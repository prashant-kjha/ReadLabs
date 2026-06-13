import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { getStats } from "../lib/superpowersApi";
import ThemeToggle from "../components/ThemeToggle";
import {
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

import type { ReadingStats } from "../types/superpowers";

function Wordmark() {
  return (
    <div className="flex items-baseline gap-1.5 select-none">
      <span className="inline-block w-2.5 h-2.5 bg-accent rounded-[1px] translate-y-[-1px]" aria-hidden="true" />
      <span className="font-display font-bold text-lg leading-none text-[var(--color-text)]">
        ReadLabs
      </span>
    </div>
  );
}

function StreakWidget() {
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(() => {
      // Stats are non-critical
    })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    // animate-pulse is load-bearing: gap-audit.spec.js targets '.animate-pulse + span'
    return (
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)] font-mono text-xs">
        <Zap className="h-3.5 w-3.5 animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!stats) return null;

  const level = stats.level || 1;
  const xp = stats.xp || 0;

  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      {/* text-orange-500 is load-bearing: gap-audit.spec.js targets '.text-orange-500 + span' */}
      <div className="flex items-center gap-1.5" title="Reading streak">
        <Flame className="h-3.5 w-3.5 text-orange-500" />
        <span className="font-medium text-[var(--color-text)]">{stats.current_streak}</span>
      </div>
      <span className="text-border" aria-hidden="true">/</span>
      <div className="flex items-center gap-1.5" title="Experience points">
        <Zap className="h-3.5 w-3.5 text-warning" />
        <span className="font-medium text-[var(--color-text)]">{xp} XP</span>
      </div>
      <span className="text-border" aria-hidden="true">/</span>
      <div className="flex items-center gap-1" title="Level">
        <Award className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold px-2 py-0.5 rounded-sm bg-primary/10 text-primary">
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
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Masthead */}
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between h-14 px-4">
          {/* Left: Branding */}
          <div className="shrink-0">
            <Wordmark />
          </div>

          {/* Center: Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 h-full">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 px-4 h-14 font-mono text-xs font-medium uppercase tracking-[0.14em] transition-colors ${
                    isActive
                      ? "bg-primary/5 text-[var(--color-text)] after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:bg-accent"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  }`
                }
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            {role === "student" && (
              <div className="hidden md:block">
                <StreakWidget />
              </div>
            )}
            <ThemeToggle />
            {user?.name && (
              <span className="hidden sm:inline font-mono text-xs text-[var(--color-text-secondary)]">
                {user.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-text-secondary)] hover:text-accent transition-colors px-2 py-1"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded hover:bg-muted text-[var(--color-text)] transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-14 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="absolute inset-0 bg-surface/95 backdrop-blur-sm border-b border-border" />
          <nav className="relative p-4 space-y-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded font-mono text-sm uppercase tracking-[0.14em] transition-colors ${
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
              className="flex items-center gap-3 px-4 py-3 rounded font-mono text-sm uppercase tracking-[0.14em] text-[var(--color-text-secondary)] hover:bg-muted hover:text-[var(--color-text)] transition-colors w-full"
            >
              <LogOut className="h-5 w-5" />
              Logout
            </button>
          </nav>
        </div>
      )}

      {/* Main Content (made inert while the mobile menu overlay is open) */}
      <main className="pt-14" inert={mobileMenuOpen}>
        <Outlet />
      </main>

      <footer className="border-t border-border mt-12 py-4 bg-surface">
        <div className="max-w-screen-2xl mx-auto px-4 flex flex-wrap items-center justify-end gap-4 font-mono text-[11px] text-[var(--color-text-secondary)]">
          <a href="/terms" className="hover:text-accent underline underline-offset-4 transition-colors">Terms</a>
          <a
            href="mailto:legal@readlabs.org?subject=Copyright%20Infringement%20Report"
            className="hover:text-accent underline underline-offset-4 transition-colors"
          >
            Report copyright
          </a>
          <span>&copy; {new Date().getFullYear()} ReadLabs</span>
        </div>
      </footer>
    </div>
  );
}
