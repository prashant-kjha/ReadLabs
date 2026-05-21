export interface CriticalPrompt {
  id: string;
  assignment_id: string;
  section_index: number | null;
  prompt_text: string;
  prompt_type: "evaluation" | "connection" | "synthesis" | "application";
  ai_followup: string;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  assignment_id: string;
  question_text: string;
  question_type: "multiple_choice" | "short_answer";
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  created_at: string;
}

export interface QuizResult {
  score: number;
  max_score: number;
  results: QuizQuestionResult[];
}

export interface QuizQuestionResult {
  question_id: string;
  score: number;
  max: number;
  correct_answer: string;
  explanation: string;
}

export interface ReadingStats {
  student_id: string;
  papers_read: number;
  quizzes_passed: number;
  current_streak: number;
  longest_streak: number;
  last_read_at: string | null;
  level: number;
  xp: number;
  total_sections_completed: number;
  checkpoints_completed: number;
  average_comprehension_score: number;
}
