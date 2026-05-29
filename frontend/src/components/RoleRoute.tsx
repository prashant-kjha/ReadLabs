import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface Props {
  allowedRole: "teacher" | "student";
  children: ReactNode;
}

/**
 * UX-only role guard. This is purely for navigation/UX — it does NOT enforce
 * authorization. Real authorization is enforced server-side (require_teacher /
 * require_student dependencies + Supabase RLS), so a user cannot access another
 * role's data even if they bypass this component.
 */
export default function RoleRoute({ allowedRole, children }: Props) {
  const { role } = useAuth();
  if (role !== allowedRole) {
    // Unauthenticated users (role null/undefined) are handled upstream by
    // ProtectedRoute → /auth. An authenticated user with the *wrong* role is
    // sent to their own landing page rather than the login screen.
    if (role) {
      return <Navigate to={role === "teacher" ? "/teacher/papers" : "/student/dashboard"} replace />;
    }
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}
