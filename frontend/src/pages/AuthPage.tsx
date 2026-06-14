import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { BookOpen, Brain, Trophy, AlertCircle } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import Logo from "../components/Logo";

const PANEL_FEATURES = [
  {
    Icon: BookOpen,
    num: "01",
    title: "Read Smarter",
    desc: "Learn to parse and understand academic papers section by section.",
  },
  {
    Icon: Brain,
    num: "02",
    title: "Think Critically",
    desc: "Develop skills to evaluate methodology, evidence, and conclusions.",
  },
  {
    Icon: Trophy,
    num: "03",
    title: "Earn Achievements",
    desc: "Build streaks, earn XP, and level up as you master research literacy.",
  },
];

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await api.post("/auth/signup", {
          email: form.email,
          password: form.password,
          name: form.name,
        });
        setSignupSuccess(true);
        toast.success("Account created. Check your email to confirm.");
      } else {
        const { data } = await api.post("/auth/signin", {
          email: form.email,
          password: form.password,
        });
        login(data);
        navigate(data.role === "teacher" ? "/teacher/papers" : "/student/dashboard");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: string) => {
    setMode(newMode);
    setError("");
    setSignupSuccess(false);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      {/* Left: the book cover (fixed ink-green, both themes) */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] relative overflow-hidden bg-[#1b3a2c] text-[#f3eee2] items-center justify-center">
        {/* Ruled lines, like a ledger */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent 39px, #f3eee2 39px, #f3eee2 40px)",
          }}
        />
        {/* Spine rule along the right edge */}
        <div className="absolute inset-y-0 right-0 w-px bg-[#f3eee2]/20" aria-hidden="true" />
        <div className="absolute inset-y-0 right-3 w-px bg-[#f3eee2]/10" aria-hidden="true" />

        <div className="relative z-10 max-w-md px-10 py-16">
          <div className="flex items-center gap-2.5 mb-12">
            <Logo size={36} />
            <span className="font-display text-3xl font-bold">ReadLabs</span>
          </div>

          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#f3eee2]/60">
            A field guide to the scientific literature
          </p>
          <h2 className="mt-4 font-display text-4xl lg:text-[2.75rem] font-semibold leading-tight mb-12">
            Understand Research.
            <br />
            <em className="text-[#e8784a] font-medium">Build Critical Thinking.</em>
          </h2>

          <ul className="space-y-7">
            {PANEL_FEATURES.map(({ Icon, num, title, desc }) => (
              <li key={num} className="flex items-start gap-4 border-t border-[#f3eee2]/15 pt-5">
                <span className="font-mono text-xs text-[#e8784a] mt-1">{num}</span>
                <div className="shrink-0 w-9 h-9 rounded-sm border border-[#f3eee2]/25 flex items-center justify-center">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-display font-semibold text-lg leading-snug">{title}</p>
                  <p className="text-[#f3eee2]/65 text-sm leading-relaxed mt-1">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right: the library card */}
      <div className="w-full md:w-1/2 lg:w-[45%] flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile-only branding */}
          <div className="flex md:hidden items-center gap-2 mb-8 justify-center">
            <Logo size={24} />
            <span className="font-display text-xl font-bold text-[var(--color-text)]">ReadLabs</span>
          </div>

          <p className="label-mono text-center mb-4">
            {mode === "signin" ? "Reader check-in" : "New library card"}
          </p>

          {/* Card */}
          <div className="card-print p-6 sm:p-8">
            {/* Tab Toggle */}
            {/* rounded-lg + bg-muted classes are load-bearing: auth.spec.js targets
                '.flex.rounded-lg.bg-muted' to disambiguate tab buttons */}
            <div className="flex rounded-lg border border-border bg-muted p-1 mb-6">
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`flex-1 py-2 font-mono text-xs uppercase tracking-[0.12em] rounded-sm transition-colors ${
                  mode === "signup"
                    ? "bg-surface-raised text-[var(--color-text)] shadow-sm border border-border"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`flex-1 py-2 font-mono text-xs uppercase tracking-[0.12em] rounded-sm transition-colors ${
                  mode === "signin"
                    ? "bg-surface-raised text-[var(--color-text)] shadow-sm border border-border"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                Log In
              </button>
            </div>

            {signupSuccess && mode === "signup" ? (
              <div className="space-y-4">
                <div className="rounded-sm border border-primary/40 bg-primary/5 p-4 text-sm text-[var(--color-text)]">
                  <p className="font-medium font-display mb-1">Check your email</p>
                  <p className="text-[var(--color-text-secondary)]">
                    We sent a confirmation link to <span className="font-medium">{form.email}</span>.
                    Click it to activate your account, then log in below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="btn-primary w-full"
                >
                  Go to Log In
                </button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Field (signup only) */}
              {mode === "signup" && (
                <div>
                  <label htmlFor="name" className="label-mono block mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    className="input-field w-full"
                    placeholder="Your full name"
                  />
                </div>
              )}

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="label-mono block mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="input-field w-full"
                  placeholder="you@example.com"
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="label-mono block mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="input-field w-full"
                  placeholder="Your password"
                />
              </div>

              {/* Error Message */}
              {error && (
                /* text-red-500 on the wrapper is load-bearing: auth.spec.js targets
                   '.text-red-500 span'; children carry the actual token color */
                <div className="flex items-center gap-2 text-red-500 text-sm border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                  <span className="text-danger">{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? "Loading..." : mode === "signin" ? "Log In" : "Create Account"}
              </button>
            </form>
            )}

            {/* Toggle Mode Link */}
            <p className="text-center text-sm text-[var(--color-text-secondary)] mt-5">
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                className="text-accent font-medium hover:underline underline-offset-4"
              >
                {mode === "signin" ? "Sign up" : "Log in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
