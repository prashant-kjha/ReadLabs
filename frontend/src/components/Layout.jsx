import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TEACHER_LINKS = [
  { to: "/teacher/papers",  label: "Papers" },
  { to: "/teacher/classes", label: "Classes" },
];

const STUDENT_LINKS = [
  { to: "/student/dashboard", label: "My Classes" },
  { to: "/student/self-study", label: "Self-Study" },
];

export default function Layout() {
  const { role, logout } = useAuth();
  const navigate         = useNavigate();
  const links            = role === "teacher" ? TEACHER_LINKS : STUDENT_LINKS;

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className="w-52 bg-gray-900 flex flex-col p-4 shrink-0">
        <div className="text-white font-bold text-base mb-8 px-2">ReadLabAI</div>
        <nav className="flex-1 space-y-0.5">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="text-gray-500 hover:text-white text-sm px-3 py-2 text-left transition-colors"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
