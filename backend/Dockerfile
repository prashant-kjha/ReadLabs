# syntax=docker/dockerfile:1.6
# Multi-stage build: keeps the final image small by leaving build tools behind.

FROM python:3.12.8-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# PyMuPDF + Pillow need a compiler + headers at build time.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libjpeg-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && /opt/venv/bin/pip install -r requirements.txt


FROM python:3.12.8-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8080

# Runtime-only system libs (no compiler).
# libmagic1 is required by python-magic for content-based PDF validation.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libjpeg62-turbo \
        zlib1g \
        libmagic1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 app

COPY --from=builder /opt/venv /opt/venv

# The app imports as `backend.*` (e.g. `from backend.routers import auth`).
# Mount the code at /app/backend and run uvicorn from /app so those imports
# resolve.
WORKDIR /app
COPY --chown=app:app . /app/backend

USER app
EXPOSE 8080

# Probe /health using python (curl/wget may be absent from the slim image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0) if urllib.request.urlopen('http://localhost:'+os.environ.get('PORT','8080')+'/health').status==200 else sys.exit(1)"

# Cloud Run injects $PORT at runtime; uvicorn binds to it.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
