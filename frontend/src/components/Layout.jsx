import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { getStats } from "../lib/superpowersApi";

const TEACHER_LINKS = [
  { to: "/teacher/papers",  label: "Papers" },
  { to: "/teacher/classes", label: "Classes" },
];

const STUDENT_LINKS = [
  { to: "/student/dashboard", label: "My Classes" },
  { to: "/student/self-study", label: "Self-Study" },
];

const LEVEL_TITLES = ["", "Novice Reader", "Apprentice", "Skilled Reader", "Expert Reader", "Scholar"];
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000];

function StreakWidget() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  if (!stats) return null;

  const level = stats.level || 1;
  const xp = stats.xp || 0;
  const nextThreshold = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const prevThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const progress = nextThreshold > prevThreshold
    ? Math.min(100, Math.round(((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
    : 100;

  return (
    <div className="mt-auto pt-4 border-t border-gray-800 px-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🔥</span>
        <span className="text-white text-sm font-medium">{stats.current_streak} day streak</span>
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          level >= 5 ? "bg-amber-500/20 text-amber-300" :
          level >= 3 ? "bg-indigo-500/20 text-indigo-300" :
          "bg-gray-700 text-gray-400"
        }`}>
          Lv.{level}
        </span>
        <span className="text-xs text-gray-500">{LEVEL_TITLES[level] || "Scholar"}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-gray-600 mt-1">{xp} XP</p>
    </div>
  );
}

export default function Layout() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();
  const links = role === "teacher" ? TEACHER_LINKS : STUDENT_LINKS;

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
        {role === "student" && <StreakWidget />}
        <button
          onClick={handleLogout}
          className="text-gray-500 hover:text-white text-sm px-3 py-2 text-left transition-colors mt-2"
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
