from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import auth, papers, classes, assignments, enrollment, sessions

app = FastAPI(title="ReadLabAI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(papers.router, prefix="/api/v1/papers", tags=["papers"])
app.include_router(classes.router, prefix="/api/v1/classes", tags=["classes"])
app.include_router(assignments.router, prefix="/api/v1/assignments", tags=["assignments"])
app.include_router(enrollment.router, prefix="/api/v1/enrollment", tags=["enrollment"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["sessions"])


@app.get("/health")
async def health():
    return {"status": "ok"}
