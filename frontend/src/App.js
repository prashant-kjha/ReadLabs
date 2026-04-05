import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthPage from "./pages/AuthPage";
import Layout from "./components/Layout";
import TeacherPapersPage from "./pages/teacher/PapersPage";
import ClassesPage from "./pages/teacher/ClassesPage";
import AssignmentReviewPage from "./pages/teacher/AssignmentReviewPage";
import AssignPaperPage from "./pages/teacher/AssignPaperPage";

// Stubs — replaced in Plans 2 and 3
import StudentDashboardPage from "./pages/student/StudentDashboardPage";
import ReadingPage from "./pages/student/ReadingPage";

function AppRoutes() {
  const { role } = useAuth();
  const defaultPath = role === "teacher" ? "/teacher/papers" : "/student/dashboard";

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/teacher/papers"      element={role === "teacher" ? <TeacherPapersPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/classes"     element={role === "teacher" ? <ClassesPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/assignments/:assignmentId/review" element={role === "teacher" ? <AssignmentReviewPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/classes/:classId/assign"        element={role === "teacher" ? <AssignPaperPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/assignments/:assignmentId/preview" element={role === "teacher" ? <ReadingPage previewMode={true} /> : <Navigate to="/auth" />} />
          <Route path="/student/dashboard"                  element={role === "student" ? <StudentDashboardPage /> : <Navigate to="/auth" />} />
          <Route path="/student/read/:assignmentId"         element={role === "student" ? <ReadingPage previewMode={false} /> : <Navigate to="/auth" />} />
          <Route path="/" element={<Navigate to={defaultPath} />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
