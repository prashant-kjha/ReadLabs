import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { authApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";

// How long we wait for supabase-js to ingest the session from the redirect
// URL (detectSessionInUrl) before declaring the sign-in failed.
const SESSION_POLL_ATTEMPTS = 20;
const SESSION_POLL_INTERVAL_MS = 250;

/**
 * OAuth landing page (e.g. Google). Supabase redirects here after the provider
 * flow; supabase-js picks the session out of the URL, then we ask the backend
 * to ensure a user_profiles row exists (created as student on first sign-in)
 * and route by role — same shape as the email/password login path.
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    // StrictMode double-fires effects; the backend endpoint is idempotent,
    // but there's no reason to run the whole dance twice.
    if (ran.current) return;
    ran.current = true;

    const complete = async () => {
      // Supabase may carry the provider error back in the URL (e.g. the user
      // cancelled the consent screen). Surface it instead of polling.
      const params = new URLSearchParams(
        window.location.hash.replace(/^#/, "") || window.location.search
      );
      const providerError = params.get("error_description") || params.get("error");
      if (providerError) {
        setError(providerError.replace(/\+/g, " "));
        return;
      }

      let session = null;
      for (let i = 0; i < SESSION_POLL_ATTEMPTS; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, SESSION_POLL_INTERVAL_MS));
      }
      if (!session) {
        setError("Sign-in didn't complete. Please try again.");
        return;
      }

      try {
        const profile = await authApi.oauthProfile();
        await login({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          user_id: profile.user_id,
          name: profile.name,
          role: profile.role,
        });
        navigate(profile.role === "teacher" ? "/teacher/papers" : "/student/dashboard", {
          replace: true,
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Sign-in failed");
      }
    };

    void complete();
  }, [login, navigate]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Logo size={24} />
          <span className="font-display text-xl font-bold text-[var(--color-text)]">ReadLabs</span>
        </div>

        <div className="card-print p-6 sm:p-8 text-center">
          {error ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-red-500 text-sm border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                <span className="text-danger">{error}</span>
              </div>
              <Link to="/auth" className="btn-primary w-full inline-block">
                Back to sign in
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--color-text-secondary)]">Completing sign-in…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
