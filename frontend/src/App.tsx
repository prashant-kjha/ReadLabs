import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import RoleRoute from "./components/RoleRoute";
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
          <Route path="/teacher/papers" element={<RoleRoute allowedRole="teacher"><PapersPage /></RoleRoute>} />
          <Route path="/teacher/classes" element={<RoleRoute allowedRole="teacher"><ClassesPage /></RoleRoute>} />
          <Route path="/teacher/assignments/:assignmentId/review" element={<RoleRoute allowedRole="teacher"><AssignmentReviewPage /></RoleRoute>} />
          <Route path="/teacher/classes/:classId/assign" element={<RoleRoute allowedRole="teacher"><AssignPaperPage /></RoleRoute>} />
          <Route path="/teacher/assignments/:assignmentId/preview" element={<RoleRoute allowedRole="teacher"><ReadingPage previewMode={true} /></RoleRoute>} />
          <Route path="/teacher/classes/:classId/dashboard" element={<RoleRoute allowedRole="teacher"><DashboardPage /></RoleRoute>} />
          <Route path="/teacher/assignments/:assignmentId/drilldown" element={<RoleRoute allowedRole="teacher"><AssignmentDrilldownPage /></RoleRoute>} />
          <Route path="/teacher/assignments/:assignmentId/students/:studentId/responses" element={<RoleRoute allowedRole="teacher"><AssignmentDrilldownPage /></RoleRoute>} />
          {/* Student routes */}
          <Route path="/student/dashboard" element={<RoleRoute allowedRole="student"><StudentDashboardPage /></RoleRoute>} />
          <Route path="/student/read/:assignmentId" element={<RoleRoute allowedRole="student"><ReadingPage previewMode={false} optionalCheckpoints={true} /></RoleRoute>} />
          <Route path="/student/self-study" element={<RoleRoute allowedRole="student"><SelfStudyPage /></RoleRoute>} />
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
          <ErrorBoundary>
            <Toaster
              position="top-right"
              toastOptions={{
                className: "!bg-surface !text-[var(--color-text)] !border-border !shadow-card",
                duration: 3000,
              }}
            />
            <AppRoutes />
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
