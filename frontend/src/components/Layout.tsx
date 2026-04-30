import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { getStats } from "../lib/superpowersApi";
import ThemeToggle from "../components/ThemeToggle";
import {
  BookOpen,
  LayoutDashboard,
  Search,
  FileText,
  Users,
  LogOut,
  Menu,
  X,
  Flame,
  Zap,
  Award,
} from "lucide-react";

const TEACHER_LINKS = [
  { to: "/teacher/papers", label: "Papers", icon: FileText },
  { to: "/teacher/classes", label: "Classes", icon: Users },
];

const STUDENT_LINKS = [
  { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/student/self-study", label: "Self-Study", icon: Search },
];

const LEVEL_TITLES = ["", "Novice Reader", "Apprentice", "Skilled Reader", "Expert Reader", "Scholar"];
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000];

function StreakWidget() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
        <Zap className="h-4 w-4 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!stats) return null;

  const level = stats.level || 1;
  const xp = stats.xp || 0;
  const nextThreshold = level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[level] : LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const prevThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const progress = nextThreshold > prevThreshold
    ? Math.min(100, Math.round(((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100))
    : 100;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Flame className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium text-[var(--color-text)]">{stats.current_streak}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Zap className="h-4 w-4 text-yellow-500" />
        <span className="text-sm font-medium text-[var(--color-text)]">{xp} XP</span>
      </div>
      <div className="flex items-center gap-1">
        <Award className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
          Lv.{level}
        </span>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const links = role === "teacher" ? TEACHER_LINKS : STUDENT_LINKS;

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Top Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 bg-surface border-b border-border shadow-card">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between h-14 px-4">
          {/* Left: Branding */}
          <div className="flex items-center gap-2 shrink-0">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-bold text-[var(--color-text)] text-base">ReadLabAI</span>
          </div>

          {/* Center: Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-[var(--color-text-secondary)] hover:bg-muted hover:text-[var(--color-text)]"
                  }`
                }
              >
                {Icon && <Icon className="h-4 w-4" />}
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {role === "student" && (
              <div className="hidden md:block">
                <StreakWidget />
              </div>
            )}
            <ThemeToggle />
            {user?.name && (
              <span className="hidden sm:inline text-sm text-[var(--color-text-secondary)]">
                {user.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors px-2 py-1 rounded-lg hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-muted text-[var(--color-text)] transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-14 z-40 md:hidden">
          <div className="absolute inset-0 bg-surface/95 backdrop-blur-sm border-b border-border" />
          <nav className="relative p-4 space-y-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-[var(--color-text-secondary)] hover:bg-muted hover:text-[var(--color-text)]"
                  }`
                }
              >
                {Icon && <Icon className="h-5 w-5" />}
                {label}
              </NavLink>
            ))}
            <div className="pt-3 border-t border-border">
              {role === "student" && <StreakWidget />}
            </div>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-muted hover:text-[var(--color-text)] transition-colors w-full"
            >
              <LogOut className="h-5 w-5" />
              Logout
            </button>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="pt-14">
        <Outlet />
      </main>
    </div>
  );
}
