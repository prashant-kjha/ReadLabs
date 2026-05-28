import logging
import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from backend.config import get_settings
from backend.rate_limit import limiter
from backend.routers import auth, papers, classes, assignments, enrollment, sessions, dashboard, library, superpowers

logger = logging.getLogger(__name__)

# Error monitoring — initialise Sentry before the app is created so its
# FastAPI/Starlette integration instruments the whole request lifecycle. No-op
# when SENTRY_DSN is unset, so local/dev and CI run without it.
_sentry_dsn = get_settings().sentry_dsn
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=get_settings().environment,
        traces_sample_rate=0.0,   # error reporting only; no perf tracing
        send_default_pii=False,   # don't attach request bodies / user data
    )
    logger.info("Sentry error monitoring enabled.")

app = FastAPI(title="ReadLabs API")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach defense-in-depth response headers to every API response.

    These are mostly belt-and-suspenders for an API that returns JSON (the
    XSS / clickjacking attack surface is the frontend), but they cost nothing
    and harden the API against being framed or sniffed in unusual ways.
    HSTS only fires in production so dev (http://) isn't broken.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if get_settings().environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# Rate limiting — applied per-endpoint via @limiter.limit decorators.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — comma-separated ALLOWED_ORIGINS env var overrides the default localhost
# dev origin. Production deployments MUST set this to their real frontend origin(s).
_origins_setting = get_settings().allowed_origins.strip()
_allowed_origins = (
    [o.strip() for o in _origins_setting.split(",") if o.strip()]
    if _origins_setting
    else ["http://localhost:3000"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler — ensures all errors return JSON with CORS headers
@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    sentry_sdk.capture_exception(exc)  # no-op if Sentry isn't configured
    from backend.config import get_settings
    detail = "Internal server error" if get_settings().environment == "production" else str(exc)
    return JSONResponse(status_code=500, content={"detail": detail})

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(papers.router, prefix="/api/v1/papers", tags=["papers"])
app.include_router(classes.router, prefix="/api/v1/classes", tags=["classes"])
app.include_router(assignments.router, prefix="/api/v1/assignments", tags=["assignments"])
app.include_router(enrollment.router, prefix="/api/v1/enrollment", tags=["enrollment"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(library.router, prefix="/api/v1/library", tags=["library"])
app.include_router(superpowers.router, prefix="/api/v1/superpowers", tags=["superpowers"])


@app.get("/health")
async def health():
    return {"status": "ok"}
