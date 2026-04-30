import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface Props {
  allowedRole: "teacher" | "student";
  children: ReactNode;
}

export default function RoleRoute({ allowedRole, children }: Props) {
  const { role } = useAuth();
  if (role !== allowedRole) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}
