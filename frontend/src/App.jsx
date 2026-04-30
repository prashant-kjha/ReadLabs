import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import Layout from "./components/Layout";
import PapersPage from "./pages/teacher/PapersPage";
import ClassesPage from "./pages/teacher/ClassesPage";
import AssignmentReviewPage from "./pages/teacher/AssignmentReviewPage";
import AssignPaperPage from "./pages/teacher/AssignPaperPage";
import DashboardPage from "./pages/teacher/DashboardPage";
import AssignmentDrilldownPage from "./pages/teacher/AssignmentDrilldownPage";
import StudentDashboardPage from "./pages/student/StudentDashboardPage";
import ReadingPage from "./pages/student/ReadingPage";
import SelfStudyPage from "./pages/student/SelfStudyPage";

function AppRoutes() {
  const { user, role } = useAuth();

  // Logged-in users skip landing/auth
  const defaultPath = role === "teacher" ? "/teacher/papers" : "/student/dashboard";

  return (
    <Routes>
      {/* Public landing page */}
      <Route path="/" element={user ? <Navigate to={defaultPath} /> : <LandingPage />} />

      {/* Auth */}
      <Route path="/auth" element={user ? <Navigate to={defaultPath} /> : <AuthPage />} />

      {/* Protected app routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Teacher routes */}
          <Route path="/teacher/papers" element={role === "teacher" ? <PapersPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/classes" element={role === "teacher" ? <ClassesPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/assignments/:assignmentId/review" element={role === "teacher" ? <AssignmentReviewPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/classes/:classId/assign" element={role === "teacher" ? <AssignPaperPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/assignments/:assignmentId/preview" element={role === "teacher" ? <ReadingPage previewMode={true} /> : <Navigate to="/auth" />} />
          <Route path="/teacher/classes/:classId/dashboard" element={role === "teacher" ? <DashboardPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/assignments/:assignmentId/drilldown" element={role === "teacher" ? <AssignmentDrilldownPage /> : <Navigate to="/auth" />} />
          <Route path="/teacher/assignments/:assignmentId/students/:studentId/responses" element={role === "teacher" ? <AssignmentDrilldownPage /> : <Navigate to="/auth" />} />
          {/* Student routes */}
          <Route path="/student/dashboard" element={role === "student" ? <StudentDashboardPage /> : <Navigate to="/auth" />} />
          <Route path="/student/read/:assignmentId" element={role === "student" ? <ReadingPage previewMode={false} optionalCheckpoints={true} /> : <Navigate to="/auth" />} />
          <Route path="/student/self-study" element={role === "student" ? <SelfStudyPage /> : <Navigate to="/auth" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              className: "!bg-surface !text-[var(--color-text)] !border-border !shadow-card",
              duration: 3000,
            }}
          />
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
