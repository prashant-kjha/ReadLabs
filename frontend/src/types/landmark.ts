export interface LandmarkLevel {
  difficulty: string;
  assignment_id: string;
}

export interface LandmarkPaper {
  paper_id: string;
  title: string;
  created_at?: string;
  levels: LandmarkLevel[];
}

export interface LandmarkLibraryResponse {
  items: LandmarkPaper[];
  has_more: boolean;
}

export interface AssignLandmarkResponse {
  assignment_id: string;
  class_id: string;
  paper_id: string;
  difficulty: string;
  status: string;
}
