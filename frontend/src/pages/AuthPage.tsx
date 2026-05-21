import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import {
  BookOpen,
  Brain,
  Trophy,
  AlertCircle,
} from "lucide-react";

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
    <div className="min-h-screen bg-surface flex">
      {/* Left Decorative Panel (hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative z-10 max-w-md px-8 text-white">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="h-10 w-10" />
            <span className="text-3xl font-bold">ReadLabs</span>
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold leading-tight mb-10">
            Understand Research.<br />Build Critical Thinking.
          </h2>
          <ul className="space-y-5">
            <li className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-lg">Read Smarter</p>
                <p className="text-white/80 text-sm">Learn to parse and understand academic papers section by section.</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-lg">Think Critically</p>
                <p className="text-white/80 text-sm">Develop skills to evaluate methodology, evidence, and conclusions.</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-lg">Earn Achievements</p>
                <p className="text-white/80 text-sm">Build streaks, earn XP, and level up as you master research literacy.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="w-full md:w-1/2 lg:w-[45%] flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile-only branding */}
          <div className="flex md:hidden items-center gap-2 mb-8 justify-center">
            <BookOpen className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-[var(--color-text)]">ReadLabs</span>
          </div>

          {/* Card */}
          <div className="card p-6 sm:p-8">
            {/* Tab Toggle */}
            <div className="flex rounded-lg bg-muted p-1 mb-6">
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === "signup"
                    ? "bg-surface text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  mode === "signin"
                    ? "bg-surface text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}
              >
                Log In
              </button>
            </div>

            {signupSuccess && mode === "signup" ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-primary/10 p-4 text-sm text-[var(--color-text)]">
                  <p className="font-medium mb-1">Check your email</p>
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
                  <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
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
                <label htmlFor="email" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
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
                <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
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
                <div className="flex items-center gap-2 text-red-500 text-sm bg-red-500/10 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
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
                className="text-primary font-medium hover:underline"
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
