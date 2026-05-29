-- ReadLabs Audit Remediation Migration
-- ------------------------------------------------------------
-- Applies the security/correctness fixes from the full audit. Every
-- statement is idempotent (IF EXISTS / IF NOT EXISTS / DROP POLICY IF EXISTS)
-- so the migration is safe to re-run.
--
-- Covers:
--   A. HIGH #15 — drop over-permissive USING(true) read policy on
--      key_term_definitions (scoped student/teacher policies remain; the
--      backend uses the service_role key which bypasses RLS anyway).
--   B. HIGH #16 — add the self-study columns on papers that the consolidated
--      snapshot/backend reference but the migration history was missing.
--   C. MED #40  — add the missing UPDATE policy on reading_stats.
--   D. MED #41  — add missing foreign-key indexes (only ones not already
--      covered by an existing index/constraint).
--   E. LOW #85  — drop the redundant idx_sowhat_session (the UNIQUE
--      constraint on sowhat_responses.session_id already provides an index).
-- ============================================================

-- ------------------------------------------------------------
-- A. Drop the over-permissive key_term_definitions read policy (HIGH #15)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated users can read key_term_definitions" ON public.key_term_definitions;

-- ------------------------------------------------------------
-- B. Add missing self-study columns on papers (HIGH #16)
--    Mirrors the consolidated supabase_schema.sql. core_id was already
--    added by 20260501000000_add_core_id_to_papers.sql and is not re-added.
--    `source` carries the same CHECK constraint as the consolidated snapshot.
-- ------------------------------------------------------------
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS is_self_study boolean NOT NULL DEFAULT false;
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS authors text;
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS year_published int;
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload'
  CHECK (source IN ('upload', 'core_api'));

-- ------------------------------------------------------------
-- C. reading_stats UPDATE policy (MED #40)
--    The initial migration only created SELECT + INSERT policies for
--    reading_stats; without an UPDATE policy students cannot update their
--    own stats under RLS.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Students update own reading stats" ON public.reading_stats;
CREATE POLICY "Students update own reading stats" ON public.reading_stats
  FOR UPDATE USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- ------------------------------------------------------------
-- D. Add missing indexes (MED #41)
--    Only indexes that are NOT already provided by an existing index or
--    constraint are added. Omitted as already-covered:
--      - idx_assignments_class                 (already created in initial migration)
--      - idx_student_sessions_assignment       (idx_sessions_assignment covers it)
--      - idx_student_sessions_student          (covered by UNIQUE (student_id, assignment_id))
--      - idx_class_enrollments_class           (covered by PK (class_id, student_id))
--      - idx_class_enrollments_student         (idx_enrollments_student covers it)
--      - idx_key_term_definitions_assignment   (covered by UNIQUE (assignment_id, term))
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_assignments_paper ON public.assignments (paper_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_assignment ON public.quiz_questions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_assignment ON public.quiz_attempts (assignment_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON public.quiz_attempts (student_id);
CREATE INDEX IF NOT EXISTS idx_critical_prompts_assignment ON public.critical_prompts (assignment_id);

-- ------------------------------------------------------------
-- E. Drop redundant sowhat index (LOW #85)
--    sowhat_responses.session_id has a UNIQUE constraint, which already
--    creates a backing index; idx_sowhat_session is therefore redundant.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_sowhat_session;
