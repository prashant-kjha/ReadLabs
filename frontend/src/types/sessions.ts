export interface Section {
  title: string;
  text: string;
  guiding_questions: string[];
  key_terms: string[];
  teacher_notes: string;
  section_type: string;
}

export interface ReadingGuide {
  sections: Section[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface CheckpointResponse {
  id: string;
  section_index: number;
  student_text: string;
  ai_feedback: string | null;
  submitted_at: string;
}

export interface SoWhatResponse {
  id: string;
  student_text: string;
  ai_feedback: string | null;
  submitted_at: string;
}

export interface JargonLookup {
  id: string;
  term: string;
  explanation: string;
  created_at: string;
}

export interface Session {
  session_id: string;
  assignment_id: string;
  paper_id: string;
  status: "not_started" | "in_progress" | "completed";
  current_section_index: number;
  reading_guide: ReadingGuide;
  paper_title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface SessionDetail {
  id: string;
  assignment_id: string;
  status: "not_started" | "in_progress" | "completed";
  current_section_index: number;
  checkpoints: CheckpointResponse[];
  sowhat: SoWhatResponse | null;
  jargon_lookups: JargonLookup[];
}
