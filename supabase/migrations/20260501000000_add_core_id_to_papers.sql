-- Add core_id column to papers so /library/fetch can deduplicate against
-- previously-imported CORE papers (the dedup logic in routers/library.py
-- expected this column but it did not exist before — the dedup was silently
-- a no-op).

ALTER TABLE public.papers
  ADD COLUMN IF NOT EXISTS core_id text;

CREATE INDEX IF NOT EXISTS idx_papers_core_id
  ON public.papers (core_id)
  WHERE core_id IS NOT NULL;
