-- ReadLabs Initial Schema Migration
-- Captures all tables, indexes, functions, triggers, and RLS policies

-- ============================================================
-- EXTENSIONS
-- ============================================================
-- uuid-ossp and pgcrypto are already enabled by Supabase by default.
-- These are the only actively installed extensions:
--   extensions.uuid-ossp  (uuid_generate_v4)
--   extensions.pgcrypto   (gen_random_uuid)

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Prevents users from changing their role after signup
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.role = OLD.role;
  RETURN NEW;
END;
$$;

-- Auto-enables RLS on any new table created in public schema
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- EVENT TRIGGERS
-- ============================================================

-- Drop first so this migration is re-runnable: event triggers are
-- database-global (not schema-scoped), so a partial/interrupted apply can
-- leave `ensure_rls` behind even after a `public` schema reset.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();

-- ============================================================
-- TABLES (ordered by dependency)
-- ============================================================

-- 1. User profiles
CREATE TABLE public.user_profiles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 200),
  role text NOT NULL CHECK (role = ANY (ARRAY['teacher', 'student'])),
  created_at timestamptz DEFAULT now()
);

-- 2. Classes
CREATE TABLE public.classes (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 200),
  class_code bpchar NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- 3. Class enrollments
CREATE TABLE public.class_enrollments (
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  enrolled_at timestamptz DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);

-- 4. Papers
CREATE TABLE public.papers (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  title text NOT NULL,
  extracted_text text,
  figures jsonb DEFAULT '[]'::jsonb,
  pdf_path text,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- 5. Assignments
CREATE TABLE public.assignments (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  reading_guide jsonb,
  status text NOT NULL DEFAULT 'processing' CHECK (status = ANY (ARRAY['processing', 'draft', 'published'])),
  difficulty text CHECK (difficulty = ANY (ARRAY['beginner', 'intermediate', 'advanced'])),
  created_at timestamptz DEFAULT now()
);

-- 6. Student sessions
CREATE TABLE public.student_sessions (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status = ANY (ARRAY['not_started', 'in_progress', 'completed'])),
  current_section_index integer DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz
);

-- 7. Checkpoint responses
CREATE TABLE public.checkpoint_responses (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.student_sessions(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  student_text text NOT NULL CHECK (char_length(student_text) <= 50000),
  ai_feedback text,
  submitted_at timestamptz DEFAULT now(),
  UNIQUE (session_id, section_index)
);

-- 8. So-what responses
CREATE TABLE public.sowhat_responses (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE REFERENCES public.student_sessions(id) ON DELETE CASCADE,
  student_text text NOT NULL CHECK (char_length(student_text) <= 50000),
  ai_feedback text,
  submitted_at timestamptz DEFAULT now()
);

-- 9. Jargon lookups
CREATE TABLE public.jargon_lookups (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.student_sessions(id) ON DELETE CASCADE,
  term text NOT NULL CHECK (char_length(term) <= 500),
  explanation text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 10. Annotations
CREATE TABLE public.annotations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.student_sessions(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  start_char integer NOT NULL,
  end_char integer NOT NULL,
  highlight_text text NOT NULL CHECK (char_length(highlight_text) <= 2000),
  note_text text CHECK (char_length(note_text) <= 10000),
  color text DEFAULT '#3B82F9' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  category text DEFAULT 'important' CHECK (category = ANY (ARRAY['important', 'confusion', 'question', 'idea'])),
  ai_prompt_shown boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 11. Assignment insights
CREATE TABLE public.assignment_insights (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  assignment_id uuid NOT NULL UNIQUE REFERENCES public.assignments(id) ON DELETE CASCADE,
  insights jsonb NOT NULL,
  generated_at timestamptz DEFAULT now()
);

-- 12. Key term definitions
CREATE TABLE public.key_term_definitions (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  term text NOT NULL,
  explanation text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (assignment_id, term)
);

-- 13. Methodology elements
CREATE TABLE public.methodology_elements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  section_index integer NOT NULL,
  element_type text NOT NULL CHECK (element_type = ANY (ARRAY['study_design', 'sample_size', 'statistical_test', 'control', 'effect_size', 'limitation', 'assumption', 'variable', 'finding', 'key_result'])),
  label text NOT NULL,
  description text NOT NULL,
  explanation text NOT NULL,
  follow_up_questions jsonb DEFAULT '[]'::jsonb,
  difficulty text DEFAULT 'intermediate' CHECK (difficulty = ANY (ARRAY['beginner', 'intermediate', 'advanced']))
);

-- 14. Critical prompts
CREATE TABLE public.critical_prompts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  section_index integer,
  prompt_text text NOT NULL CHECK (char_length(prompt_text) <= 5000),
  prompt_type text NOT NULL CHECK (prompt_type = ANY (ARRAY['evaluation', 'connection', 'synthesis', 'application'])),
  ai_followup text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- 15. Quiz questions
CREATE TABLE public.quiz_questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type = ANY (ARRAY['multiple_choice', 'short_answer'])),
  options jsonb,
  correct_answer text,
  explanation text,
  created_at timestamptz DEFAULT now()
);

-- 16. Quiz attempts
CREATE TABLE public.quiz_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  max_score integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 17. Reading stats
CREATE TABLE public.reading_stats (
  student_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- 18. Audit log
CREATE TABLE public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- NOTE: unique indexes backing the inline UNIQUE table constraints
-- (classes.class_code, checkpoint_responses, sowhat_responses,
-- assignment_insights, key_term_definitions) are created AUTOMATICALLY by
-- those constraints with the conventional `<table>_<cols>_key` name. They
-- must NOT be re-declared here, or a clean apply fails with
-- "relation ..._key already exists" (42P07).
CREATE INDEX idx_assignments_class ON public.assignments (class_id);
CREATE INDEX idx_sessions_assignment ON public.student_sessions (assignment_id);
CREATE UNIQUE INDEX student_sessions_student_id_assignment_id_key ON public.student_sessions (student_id, assignment_id);
CREATE INDEX idx_checkpoints_session ON public.checkpoint_responses (session_id);
CREATE INDEX idx_sowhat_session ON public.sowhat_responses (session_id);
CREATE INDEX idx_jargon_session ON public.jargon_lookups (session_id);
CREATE INDEX idx_annotations_session ON public.annotations (session_id, section_index);
CREATE INDEX idx_annotations_assignment ON public.annotations (session_id);
CREATE INDEX idx_enrollments_student ON public.class_enrollments (student_id);
CREATE INDEX idx_papers_uploaded_by ON public.papers (uploaded_by);
CREATE INDEX idx_reading_stats_student ON public.reading_stats (student_id);
CREATE INDEX idx_audit_log_user ON public.audit_log (user_id);
CREATE INDEX idx_audit_log_action ON public.audit_log (action);
CREATE INDEX idx_audit_log_created ON public.audit_log (created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sowhat_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jargon_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_term_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.methodology_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- user_profiles
CREATE POLICY "Users read own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK ((auth.uid() = user_id) AND (role = 'student'));

CREATE POLICY "Users update own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- classes
CREATE POLICY "Teachers manage own classes"
  ON public.classes FOR ALL
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers read own classes"
  ON public.classes FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Students read enrolled classes"
  ON public.classes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM class_enrollments
    WHERE class_enrollments.class_id = classes.id
      AND class_enrollments.student_id = auth.uid()
  ));

-- class_enrollments
CREATE POLICY "Students manage own enrollment"
  ON public.class_enrollments FOR ALL
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers read enrollments for own classes"
  ON public.class_enrollments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM classes
    WHERE classes.id = class_enrollments.class_id
      AND classes.teacher_id = auth.uid()
  ));

CREATE POLICY "Teachers delete enrollments for own classes"
  ON public.class_enrollments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM classes
    WHERE classes.id = class_enrollments.class_id
      AND classes.teacher_id = auth.uid()
  ));

-- papers
CREATE POLICY "Teachers manage own papers"
  ON public.papers FOR ALL
  USING (auth.uid() = uploaded_by);

CREATE POLICY "Students read assigned papers"
  ON public.papers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM (assignments a
      JOIN class_enrollments ce ON ce.class_id = a.class_id)
    WHERE a.paper_id = papers.id
      AND ce.student_id = auth.uid()
  ));

-- assignments
CREATE POLICY "Teachers manage assignments for own classes"
  ON public.assignments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM classes
    WHERE classes.id = assignments.class_id
      AND classes.teacher_id = auth.uid()
  ));

CREATE POLICY "Students read published assignments for enrolled classes"
  ON public.assignments FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM class_enrollments
      WHERE class_enrollments.class_id = assignments.class_id
        AND class_enrollments.student_id = auth.uid()
    )
  );

-- student_sessions
CREATE POLICY "Students manage own sessions"
  ON public.student_sessions FOR ALL
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers read sessions for own class assignments"
  ON public.student_sessions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM (assignments
      JOIN classes ON classes.id = assignments.class_id)
    WHERE assignments.id = student_sessions.assignment_id
      AND classes.teacher_id = auth.uid()
  ));

-- checkpoint_responses
CREATE POLICY "Students manage own checkpoint responses"
  ON public.checkpoint_responses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM student_sessions
    WHERE student_sessions.id = checkpoint_responses.session_id
      AND student_sessions.student_id = auth.uid()
  ));

CREATE POLICY "Teachers read checkpoint responses for own classes"
  ON public.checkpoint_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ((student_sessions
      JOIN assignments ON assignments.id = student_sessions.assignment_id)
      JOIN classes ON classes.id = assignments.class_id)
    WHERE student_sessions.id = checkpoint_responses.session_id
      AND classes.teacher_id = auth.uid()
  ));

-- sowhat_responses
CREATE POLICY "Students manage own sowhat responses"
  ON public.sowhat_responses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM student_sessions
    WHERE student_sessions.id = sowhat_responses.session_id
      AND student_sessions.student_id = auth.uid()
  ));

CREATE POLICY "Teachers read sowhat responses for own classes"
  ON public.sowhat_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ((student_sessions
      JOIN assignments ON assignments.id = student_sessions.assignment_id)
      JOIN classes ON classes.id = assignments.class_id)
    WHERE student_sessions.id = sowhat_responses.session_id
      AND classes.teacher_id = auth.uid()
  ));

-- jargon_lookups
CREATE POLICY "Students manage own jargon lookups"
  ON public.jargon_lookups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM student_sessions
    WHERE student_sessions.id = jargon_lookups.session_id
      AND student_sessions.student_id = auth.uid()
  ));

-- annotations
CREATE POLICY "Students manage own annotations"
  ON public.annotations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM student_sessions
    WHERE student_sessions.id = annotations.session_id
      AND student_sessions.student_id = auth.uid()
  ));

CREATE POLICY "Teachers read annotations for own classes"
  ON public.annotations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ((student_sessions ss
      JOIN assignments a ON a.id = ss.assignment_id)
      JOIN classes c ON a.class_id = c.id)
    WHERE ss.id = annotations.session_id
      AND c.teacher_id = auth.uid()
  ));

-- assignment_insights
CREATE POLICY "Teachers manage insights for own class assignments"
  ON public.assignment_insights FOR ALL
  USING (EXISTS (
    SELECT 1 FROM (assignments
      JOIN classes ON classes.id = assignments.class_id)
    WHERE assignments.id = assignment_insights.assignment_id
      AND classes.teacher_id = auth.uid()
  ));

-- key_term_definitions
CREATE POLICY "Teachers manage key terms for own classes"
  ON public.key_term_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM (assignments a
      JOIN classes c ON a.class_id = c.id)
    WHERE a.id = key_term_definitions.assignment_id
      AND c.teacher_id = auth.uid()
  ));

CREATE POLICY "Students read key terms for enrolled assignments"
  ON public.key_term_definitions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM ((assignments a
      JOIN classes c ON a.class_id = c.id)
      JOIN class_enrollments ce ON ce.class_id = c.id)
    WHERE a.id = key_term_definitions.assignment_id
      AND ce.student_id = auth.uid()
  ));

-- NOTE: This over-permissive USING(true) policy is superseded and dropped by
-- 20260601000000_audit_remediation.sql (HIGH #15). The scoped student/teacher
-- policies above are sufficient. Kept here so migration history stays append-only.
CREATE POLICY "authenticated users can read key_term_definitions"
  ON public.key_term_definitions FOR SELECT
  TO authenticated
  USING (true);

-- methodology_elements
CREATE POLICY "Students read methodology for own sessions"
  ON public.methodology_elements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM student_sessions
    WHERE student_sessions.assignment_id = methodology_elements.assignment_id
      AND student_sessions.student_id = auth.uid()
  ));

-- critical_prompts
CREATE POLICY "Students read critical prompts for own sessions"
  ON public.critical_prompts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM student_sessions
    WHERE student_sessions.assignment_id = critical_prompts.assignment_id
      AND student_sessions.student_id = auth.uid()
  ));

-- quiz_questions
CREATE POLICY "Students read quiz for own sessions"
  ON public.quiz_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM student_sessions
    WHERE student_sessions.assignment_id = quiz_questions.assignment_id
      AND student_sessions.student_id = auth.uid()
  ));

-- quiz_attempts
CREATE POLICY "Students manage own quiz attempts"
  ON public.quiz_attempts FOR ALL
  USING (auth.uid() = student_id);

-- reading_stats
CREATE POLICY "Students select own reading stats"
  ON public.reading_stats FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students insert own reading stats"
  ON public.reading_stats FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- audit_log
CREATE POLICY "Users read own audit log"
  ON public.audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Prevent role escalation: users cannot change their own role
CREATE TRIGGER enforce_role_immutable
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_change();
