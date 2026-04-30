export interface ClassItem {
  id: string;
  name: string;
  class_code: string;
  created_at: string;
}

export interface StudentEnrollment {
  student_id: string;
  student_name: string;
  enrolled_at: string;
}

export interface ClassWithStudents extends ClassItem {
  students: StudentEnrollment[];
}

export interface EnrolledClass {
  class_id: string;
  class_name: string;
  class_code: string;
  teacher_name: string;
  enrolled_at: string;
  assignments: EnrolledAssignment[];
}

export interface EnrolledAssignment {
  id: string;
  paper_title: string;
  difficulty: string;
  created_at: string;
}
