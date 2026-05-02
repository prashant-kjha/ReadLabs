import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from backend.rate_limit import limiter
from backend.routers import auth, papers, classes, assignments, enrollment, sessions, dashboard, library, superpowers

logger = logging.getLogger(__name__)

app = FastAPI(title="ReadLabAI API")

# Rate limiting — applied per-endpoint via @limiter.limit decorators.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler — ensures all errors return JSON with CORS headers
@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
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
