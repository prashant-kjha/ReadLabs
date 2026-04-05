import json
import asyncio
import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential
from backend.config import get_settings

settings = get_settings()
genai.configure(api_key=settings.gemini_api_key)
_model = genai.GenerativeModel("gemini-2.5-flash")


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_reading_guide(extracted_text: str, figure_count: int) -> dict:
    """
    Generate a structured reading guide for a research paper.
    One call per assignment — result is cached in the assignments table.
    """
    prompt = f"""You are creating a guided reading experience for students reading a research paper.

Paper text (may be truncated to 50,000 characters):
{extracted_text[:50000]}

This paper contains {figure_count} embedded figures, images, or tables.

Return a JSON object with this exact structure:
{{
  "sections": [
    {{
      "title": "section name as it appears in the paper",
      "text": "first 400 characters of this section verbatim",
      "guiding_questions": [
        "Look for: [specific thing to find in this section]",
        "As you read, notice: [another specific thing]",
        "Consider: [a third prompt]"
      ],
      "key_terms": ["jargon term 1", "jargon term 2"],
      "teacher_notes": ""
    }}
  ],
  "difficulty": "beginner"
}}

Rules:
- Detect only sections that actually exist in this paper (Abstract, Introduction, Methods, Results, Discussion, Conclusion, Limitations, etc.)
- Guiding questions must be framed as reading prompts (what to look FOR before reading), not comprehension quiz questions asked after
- Include 3 guiding questions per section
- Include 2–5 key terms per section that a student might not know
- difficulty: "beginner" = high school reader, "intermediate" = undergraduate, "advanced" = graduate level
- teacher_notes is always an empty string — the teacher fills this in
- Return ONLY the JSON object, no markdown, no explanation"""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
    )
    return json.loads(response.text)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_checkpoint_feedback(
    section_title: str,
    guiding_questions: list[str],
    student_text: str,
) -> str:
    """Socratic feedback on a checkpoint response. Never gives away the answer."""
    questions_block = "\n".join(f"- {q}" for q in guiding_questions)
    prompt = f"""A student was asked to read the "{section_title}" section with these guiding questions in mind:

{questions_block}

The student wrote:
{student_text}

In 2–3 sentences: acknowledge one specific thing they captured correctly, then point to one specific thing they missed or misunderstood relative to the guiding questions. Do not rewrite their response or summarize the section. Be encouraging but precise. Return only the feedback text, no labels or headers."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0.4),
        )
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_sowhat_feedback(
    paper_title: str,
    section_titles: list[str],
    difficulty: str,
    student_text: str,
) -> str:
    """Evaluate the student's significance claim against the paper structure."""
    sections_block = ", ".join(section_titles)
    prompt = f"""A student read a {difficulty}-level research paper titled "{paper_title}".
The paper covers these sections: {sections_block}.

The student wrote this "So What?" paragraph about the paper's significance:
{student_text}

In 3–4 sentences: affirm one thing they got right about the paper's significance, then identify one specific place where they overstated, understated, or mischaracterized the contribution. Be specific and encouraging. Return only the feedback text, no labels or headers."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0.4),
        )
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_jargon_explanation(term: str, context_snippet: str) -> str:
    """Explain a term in plain English as used in this specific paper."""
    prompt = f"""In the context of this research paper, explain what "{term}" means in plain English.
Keep the explanation to 2–3 sentences. Do not use other technical jargon. Be specific to how this term is used here.

Paper context:
{context_snippet[:500]}

Return only the explanation, no labels or headers."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0.3),
        )
    )
    return response.text.strip()
