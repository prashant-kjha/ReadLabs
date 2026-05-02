from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Supabase — find these in: Project Settings > API
    supabase_url: str = ""              # "Project URL"
    supabase_anon_key: str = ""         # "anon / public" key  (or sb_publishable_... on new projects)
    supabase_service_role_key: str = "" # "service_role / secret" key  (or sb_secret_... on new projects)
    supabase_jwt_secret: str = ""        # JWT secret for verifying tokens

    # Gemini AI
    gemini_api_key: str = ""

    # CORE API (core.ac.uk — open access full-text aggregator)
    core_api_key: str = ""

    # CORS — comma-separated list of allowed origins (overrides frontend_url when set)
    allowed_origins: str = ""
    frontend_url: str = "http://localhost:3000"

    # Environment
    environment: str = "development"

    class Config:
        env_file = ".env"
        case_sensitive = False
        # NOTE: kept "ignore" so leftover unrelated env vars (e.g. REACT_APP_*
        # from a previous CRA setup) don't break startup. The production-required
        # secret check below catches the most important misconfiguration class
        # (missing required keys); raising on extras is a future hardening.
        extra = "ignore"


# Secrets that MUST be set for the app to function correctly. Listed explicitly
# so a misconfigured deployment fails at startup, not on the first auth request.
_REQUIRED_FOR_PRODUCTION = (
    "supabase_url",
    "supabase_anon_key",
    "supabase_service_role_key",
)


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    if s.environment == "production":
        missing = [name for name in _REQUIRED_FOR_PRODUCTION if not getattr(s, name)]
        if missing:
            raise RuntimeError(
                f"Missing required production env vars: {', '.join(missing)}"
            )
    return s
