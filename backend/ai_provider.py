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
