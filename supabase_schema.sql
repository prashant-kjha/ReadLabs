-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- User profiles (teacher or student, one per auth user)
create table user_profiles (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  name      text not null,
  role      text not null check (role in ('teacher', 'student')),
  created_at timestamptz default now()
);
alter table user_profiles enable row level security;
create policy "Users read own profile"   on user_profiles for select using (auth.uid() = user_id);
create policy "Users insert own profile" on user_profiles for insert with check (auth.uid() = user_id);
create policy "Users update own profile" on user_profiles for update using (auth.uid() = user_id);

-- Classes (one teacher owns many classes)
create table classes (
  id         uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  class_code text not null unique,
  created_at timestamptz default now()
);
alter table classes enable row level security;
create policy "Teachers manage own classes" on classes for all using (auth.uid() = teacher_id);
create policy "Anyone can read classes"     on classes for select using (true);

-- Enrollments (student joins class via class_code)
create table class_enrollments (
  class_id     uuid not null references classes(id) on delete cascade,
  student_id   uuid not null references auth.users(id) on delete cascade,
  student_name text not null,
  enrolled_at  timestamptz default now(),
  primary key (class_id, student_id)
);
alter table class_enrollments enable row level security;
create policy "Students manage own enrollment" on class_enrollments
  for all using (auth.uid() = student_id);
create policy "Teachers read enrollments for own classes" on class_enrollments
  for select using (
    exists (select 1 from classes where classes.id = class_enrollments.class_id and classes.teacher_id = auth.uid())
  );
create policy "Teachers delete enrollments for own classes" on class_enrollments
  for delete using (
    exists (select 1 from classes where classes.id = class_enrollments.class_id and classes.teacher_id = auth.uid())
  );

-- Papers (teacher uploads a PDF; extraction stored here)
create table papers (
  id             uuid primary key default uuid_generate_v4(),
  title          text not null,
  extracted_text text,
  figures        jsonb default '[]',
  pdf_path       text,
  uploaded_by    uuid not null references auth.users(id),
  created_at     timestamptz default now()
);
alter table papers enable row level security;
create policy "Teachers manage own papers" on papers for all using (auth.uid() = uploaded_by);

-- Assignments (teacher assigns paper to class; AI reading guide stored here)
create table assignments (
  id           uuid primary key default uuid_generate_v4(),
  class_id     uuid not null references classes(id) on delete cascade,
  paper_id     uuid not null references papers(id) on delete cascade,
  reading_guide jsonb,
  status       text not null default 'processing'
                 check (status in ('processing', 'draft', 'published')),
  difficulty   text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  created_at   timestamptz default now()
);
alter table assignments enable row level security;
create policy "Teachers manage assignments for own classes" on assignments
  for all using (
    exists (select 1 from classes where classes.id = assignments.class_id and classes.teacher_id = auth.uid())
  );
create policy "Students read published assignments for enrolled classes" on assignments
  for select using (
    status = 'published' and
    exists (
      select 1 from class_enrollments
      where class_enrollments.class_id = assignments.class_id
        and class_enrollments.student_id = auth.uid()
    )
  );

-- Student reading sessions (one per student per assignment)
create table student_sessions (
  id                   uuid primary key default uuid_generate_v4(),
  student_id           uuid not null references auth.users(id) on delete cascade,
  assignment_id        uuid not null references assignments(id) on delete cascade,
  status               text not null default 'not_started'
                         check (status in ('not_started', 'in_progress', 'completed')),
  current_section_index int not null default 0,
  started_at           timestamptz,
  completed_at         timestamptz,
  unique (student_id, assignment_id)
);
alter table student_sessions enable row level security;
create policy "Students manage own sessions" on student_sessions
  for all using (auth.uid() = student_id);
create policy "Teachers read sessions for own class assignments" on student_sessions
  for select using (
    exists (
      select 1 from assignments
      join classes on classes.id = assignments.class_id
      where assignments.id = student_sessions.assignment_id
        and classes.teacher_id = auth.uid()
    )
  );

-- Checkpoint responses (student writes after each section)
create table checkpoint_responses (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references student_sessions(id) on delete cascade,
  section_index int not null,
  student_text  text not null,
  ai_feedback   text,
  submitted_at  timestamptz default now(),
  unique (session_id, section_index)
);
alter table checkpoint_responses enable row level security;
create policy "Students manage own checkpoint responses" on checkpoint_responses
  for all using (
    exists (select 1 from student_sessions where student_sessions.id = checkpoint_responses.session_id and student_sessions.student_id = auth.uid())
  );
create policy "Teachers read checkpoint responses for own classes" on checkpoint_responses
  for select using (
    exists (
      select 1 from student_sessions
      join assignments on assignments.id = student_sessions.assignment_id
      join classes on classes.id = assignments.class_id
      where student_sessions.id = checkpoint_responses.session_id
        and classes.teacher_id = auth.uid()
    )
  );

-- So What responses (final synthesis paragraph per session)
create table sowhat_responses (
  id           uuid primary key default uuid_generate_v4(),
  session_id   uuid not null references student_sessions(id) on delete cascade unique,
  student_text text not null,
  ai_feedback  text,
  submitted_at timestamptz default now()
);
alter table sowhat_responses enable row level security;
create policy "Students manage own sowhat responses" on sowhat_responses
  for all using (
    exists (select 1 from student_sessions where student_sessions.id = sowhat_responses.session_id and student_sessions.student_id = auth.uid())
  );
create policy "Teachers read sowhat responses for own classes" on sowhat_responses
  for select using (
    exists (
      select 1 from student_sessions
      join assignments on assignments.id = student_sessions.assignment_id
      join classes on classes.id = assignments.class_id
      where student_sessions.id = sowhat_responses.session_id
        and classes.teacher_id = auth.uid()
    )
  );

-- Jargon lookups (student highlights a term, requests explanation)
create table jargon_lookups (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid not null references student_sessions(id) on delete cascade,
  term        text not null,
  explanation text not null,
  created_at  timestamptz default now()
);
alter table jargon_lookups enable row level security;
create policy "Students manage own jargon lookups" on jargon_lookups
  for all using (
    exists (select 1 from student_sessions where student_sessions.id = jargon_lookups.session_id and student_sessions.student_id = auth.uid())
  );

-- Assignment insights (class-wide patterns, generated once on-demand)
create table assignment_insights (
  id            uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null references assignments(id) on delete cascade unique,
  insights      jsonb not null,
  generated_at  timestamptz default now()
);
alter table assignment_insights enable row level security;
create policy "Teachers manage insights for own class assignments" on assignment_insights
  for all using (
    exists (
      select 1 from assignments
      join classes on classes.id = assignments.class_id
      where assignments.id = assignment_insights.assignment_id
        and classes.teacher_id = auth.uid()
    )
  );

-- Storage bucket for PDFs
insert into storage.buckets (id, name, public) values ('papers', 'papers', false)
  on conflict do nothing;
create policy "Authenticated users upload papers" on storage.objects
  for insert with check (bucket_id = 'papers' and auth.role() = 'authenticated');
create policy "Authenticated users read papers" on storage.objects
  for select using (bucket_id = 'papers' and auth.role() = 'authenticated');

-- ── Self-study mode migrations ─────────────────────────────────────────────

ALTER TABLE papers ADD COLUMN IF NOT EXISTS is_self_study boolean NOT NULL DEFAULT false;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS core_id text;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS authors text;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS year_published int;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload'
  CHECK (source IN ('upload', 'core_api'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_core_id ON papers(core_id) WHERE core_id IS NOT NULL;

ALTER TABLE assignments ALTER COLUMN class_id DROP NOT NULL;

-- Self-study papers readable by any authenticated user
CREATE POLICY "Authenticated users read self-study papers" ON papers
  FOR SELECT USING (is_self_study = true AND auth.role() = 'authenticated');

-- Self-study assignments readable by student who owns them
CREATE POLICY "Students read own self-study assignments" ON assignments
  FOR SELECT USING (
    class_id IS NULL
    AND EXISTS (
      SELECT 1 FROM student_sessions
      WHERE student_sessions.assignment_id = assignments.id
        AND student_sessions.student_id = auth.uid()
    )
  );

-- ── Superpowers: Critical Prompts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS critical_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  section_index integer,
  prompt_text text NOT NULL,
  prompt_type text NOT NULL
    CHECK (prompt_type IN ('evaluation', 'connection', 'synthesis', 'application')),
  ai_followup text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE critical_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read critical prompts for own sessions" ON critical_prompts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.assignment_id = critical_prompts.assignment_id
              AND student_sessions.student_id = auth.uid())
  );

-- ── Superpowers: Quiz Questions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL
    CHECK (question_type IN ('multiple_choice', 'short_answer')),
  options jsonb,
  correct_answer text,
  explanation text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read quiz for own sessions" ON quiz_questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.assignment_id = quiz_questions.assignment_id
              AND student_sessions.student_id = auth.uid())
  );
CREATE POLICY "Students insert quiz for own sessions" ON quiz_questions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM student_sessions
            WHERE student_sessions.assignment_id = quiz_questions.assignment_id
              AND student_sessions.student_id = auth.uid())
  );

-- ── Superpowers: Quiz Attempts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  max_score integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own quiz attempts" ON quiz_attempts
  FOR ALL USING (auth.uid() = student_id);

-- ── Superpowers: Reading Stats ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reading_stats (
  student_id uuid PRIMARY KEY,
  papers_read integer DEFAULT 0,
  quizzes_passed integer DEFAULT 0,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  last_read_at timestamptz,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  total_sections_completed integer DEFAULT 0,
  checkpoints_completed integer DEFAULT 0,
  average_comprehension_score real DEFAULT 0
);

ALTER TABLE reading_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students manage own reading stats" ON reading_stats
  FOR ALL USING (auth.uid() = student_id);
