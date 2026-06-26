from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    # NOTE: kept extra="ignore" so leftover unrelated env vars (e.g. REACT_APP_*
    # from a previous CRA setup) don't break startup. The production-required
    # secret check below catches the most important misconfiguration class
    # (missing required keys); raising on extras is a future hardening.
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    # Supabase — find these in: Project Settings > API
    supabase_url: str = ""              # "Project URL"
    supabase_anon_key: str = ""         # "anon / public" key  (or sb_publishable_... on new projects)
    supabase_service_role_key: str = "" # "service_role / secret" key  (or sb_secret_... on new projects)
    # NOTE: SUPABASE_JWT_SECRET is intentionally not required — JWT verification
    # uses Supabase's JWKS endpoint (deps.py:_get_jwks) so no shared secret is needed.

    # Gemini AI
    gemini_api_key: str = ""  # used when ai_provider == "studio" (local/dev)
    # AI provider surface: "studio" (API key) | "vertex" (project billing via ADC, prod).
    # Explicit switch so production can flip back to the key path without a redeploy.
    ai_provider: str = "studio"
    gcp_project_id: str = ""  # required when ai_provider == "vertex"
    gcp_region: str = "us-central1"  # Vertex region; must match the Cloud Run region

    # CORE API (core.ac.uk — open access full-text aggregator)
    core_api_key: str = ""

    # Error monitoring (optional). When set, unhandled exceptions are sent to
    # Sentry. Leave empty to disable (Sentry init is skipped).
    sentry_dsn: str = ""

    # CORS — comma-separated list of allowed origins (overrides frontend_url when set)
    allowed_origins: str = ""
    frontend_url: str = "http://localhost:3000"

    # Environment
    environment: str = "development"

    # Landmark-library seed script: UUID of the service user that owns seeded
    # papers. Only used by backend/scripts/seed_landmark_library.py (not the app).
    landmark_user_id: str = ""


# Secrets that MUST be set for the app to function correctly. Listed explicitly
# so a misconfigured deployment fails at startup, not on the first auth request.
# Provider-aware: Vertex authenticates via ADC (no key) and needs the project id;
# the AI Studio path needs the Gemini API key.
def _required_for_production(s: Settings) -> list[str]:
    base = ["supabase_url", "supabase_anon_key", "supabase_service_role_key"]
    if s.ai_provider == "vertex":
        return base + ["gcp_project_id"]
    return base + ["gemini_api_key"]
# NOTE: ALLOWED_ORIGINS is intentionally NOT required — it falls back to a
# sensible localhost default. Production deployments SHOULD set ALLOWED_ORIGINS
# to their real frontend origin(s) so CORS is locked down correctly.


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    if s.environment == "production":
        missing = [name for name in _required_for_production(s) if not getattr(s, name)]
        if missing:
            raise RuntimeError(
                f"Missing required production env vars: {', '.join(missing)}"
            )
    return s
