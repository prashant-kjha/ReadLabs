export interface Figure {
  page: number;
  index: number;
  data: string;
  ext: string;
  width: number;
  height: number;
}

export interface Paper {
  id: string;
  title: string;
  extracted_text: string;
  figures: Figure[];
  pdf_path: string;
  uploaded_by: string;
  created_at: string;
}

export interface PaperListItem {
  id: string;
  title: string;
  created_at: string;
  text_length: number;
  figure_count: number;
}

export interface PaperUploadResponse {
  id: string;
  title: string;
  text_length: number;
  figure_count: number;
  pdf_path: string;
}
