export interface UserData {
  access_token: string;
  refresh_token: string;
  user_id: string;
  name: string;
  role: "teacher" | "student";
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  name: string;
  role: "teacher" | "student";
}
