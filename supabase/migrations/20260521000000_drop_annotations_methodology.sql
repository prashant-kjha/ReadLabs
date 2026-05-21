-- Drop the annotations and methodology_elements features.
-- These were cut from the product: highlighting is impractical on PDFs (which
-- we now keep as the source of truth for student/teacher reading), and the
-- methodology decoder was descoped. Critical prompts and quizzes remain.

DROP TABLE IF EXISTS public.annotations CASCADE;
DROP TABLE IF EXISTS public.methodology_elements CASCADE;
