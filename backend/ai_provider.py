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
      "teacher_notes": "",
      "section_type": "Introduction",
      "simplifications": {{
        "undergrad": "technical terms kept, simpler sentence structure, 3-4 sentences",
        "high_school": "key concepts only in everyday language, 3-4 sentences",
        "eli5": "core idea in plain language with analogies, 2-3 sentences"
      }}
    }}
  ],
  "difficulty": "beginner",
  "methodology_elements": [
    {{
      "section_index": 0,
      "element_type": "study_design",
      "label": "human-readable label for this element",
      "description": "one sentence describing what was found",
      "explanation": "2-3 sentences explaining why this matters to a student",
      "follow_up_questions": ["one follow-up question to deepen understanding"],
      "difficulty": "intermediate"
    }}
  ],
  "critical_prompts": [
    {{
      "section_index": 0,
      "prompt_text": "evaluative question for this section",
      "prompt_type": "evaluation"
    }}
  ]
}}

Rules:
- Detect only sections that actually exist in this paper
- Guiding questions must be framed as reading prompts (what to look FOR before reading)
- Include 3 guiding questions per section
- Include 2-5 key terms per section
- difficulty: "beginner" = high school reader, "intermediate" = undergraduate, "advanced" = graduate
- teacher_notes is always an empty string
- section_type must be one of: "Introduction", "Methods", "Results", "Discussion", "Other"
- simplifications: write all three levels for every section (undergrad, high_school, eli5)
- methodology_elements: only for sections with actual methodology content (Methods, Results). May be empty list []
- element_type must be one of: study_design, sample_size, statistical_test, control, effect_size, limitation, assumption, variable, finding, key_result
- critical_prompts: one prompt per section. prompt_type must be one of: evaluation, connection, synthesis, application
  - Introduction sections: use "connection" or "evaluation"
  - Methods sections: use "evaluation" or "application"
  - Results sections: use "synthesis" or "evaluation"
  - Discussion sections: use "synthesis" or "application"
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


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_class_insights(section_title: str, responses: list[str]) -> dict:
    """
    Analyze all student checkpoint responses for a section.
    Identifies the most common misconception and the most commonly grasped concept.
    Called once per assignment section, result cached in assignment_insights table.
    """
    responses_text = "\n---\n".join(
        f"Student {i + 1}: {r}" for i, r in enumerate(responses)
    )
    prompt = f"""You are analyzing {len(responses)} student checkpoint responses for the "{section_title}" section of a research paper.

Student responses:
{responses_text}

Based on these responses, identify patterns across the class.

Return valid JSON with this exact structure:
{{
  "common_misconception": "A specific description of what most students got wrong or misunderstood about this section. Be concrete — quote or paraphrase the pattern.",
  "commonly_grasped": "A specific description of what most students correctly understood. Be concrete.",
  "student_count": {len(responses)}
}}

Rules:
- If fewer than 3 responses, note that patterns are limited
- Be specific about the content of the misconception, not generic ("students struggled with X" not "students had difficulty")
- Return ONLY the JSON object, no other text"""

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
async def generate_annotation_socratic_prompt(highlighted_text: str, section_title: str) -> str:
    """Generate a Socratic question about text a student highlighted."""
    prompt = f"""A student highlighted this passage from the "{section_title}" section of a research paper:

"{highlighted_text}"

Ask one Socratic question (10-20 words) that helps the student reflect on WHY this passage caught their attention.
Do not summarize, explain, or evaluate the passage. Just ask the question.
Return only the question text, no labels."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0.5),
        )
    )
    return response.text.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def generate_quiz_questions(paper_title: str, sections: list[dict], difficulty: str) -> list[dict]:
    """Generate 5 quiz questions for a paper. One call per paper, cached in quiz_questions table."""
    sections_text = "\n".join(
        f"## {s['title']}\n{s.get('text', '')[:300]}" for s in sections[:6]
    )
    prompt = f"""Generate 5 comprehension quiz questions for a {difficulty}-level research paper titled "{paper_title}".

Paper sections:
{sections_text}

Return a JSON array of exactly 5 questions. Mix: 3 multiple choice + 2 short answer.

Each question:
{{
  "question_text": "the question",
  "question_type": "multiple_choice" | "short_answer",
  "options": ["A: ...", "B: ...", "C: ...", "D: ..."] or null,
  "correct_answer": "A: ..." or "expected short answer",
  "explanation": "why this is the correct answer, 1-2 sentences"
}}

Rules:
- Multiple choice: 4 options (A-D prefix), one clearly correct
- Short answer: 1-2 sentence expected answer
- Questions must be answerable from the section excerpts provided
- No trick questions; focus on key concepts and findings
Return ONLY the JSON array, no markdown."""

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
async def grade_short_answer(question: str, correct_answer: str, student_answer: str) -> dict:
    """Grade a short answer 0-2. Returns {{"score": int, "explanation": str}}."""
    prompt = f"""Grade this student answer for a research paper quiz.

Question: {question}
Expected answer: {correct_answer}
Student's answer: {student_answer}

Score 0-2:
- 2: fully correct, captures the key concept
- 1: partially correct, missing one key element
- 0: incorrect or irrelevant

Return JSON: {{"score": 0|1|2, "explanation": "one sentence explaining the score"}}
Return ONLY the JSON object."""

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: _model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )
    )
    return json.loads(response.text)
