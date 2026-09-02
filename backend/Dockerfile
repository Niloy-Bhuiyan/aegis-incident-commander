FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependency layer first so source edits do not invalidate the install.
COPY backend/pyproject.toml ./backend/pyproject.toml
COPY backend/aegis/__init__.py ./backend/aegis/__init__.py
RUN pip install --no-cache-dir -e "./backend[postgres]"

COPY backend ./backend
# The knowledge base is ingested at startup, so it has to be in the image.
COPY knowledge ./knowledge

WORKDIR /app/backend

RUN useradd --create-home --uid 10001 aegis && chown -R aegis:aegis /app
USER aegis

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

CMD ["sh", "-c", "alembic upgrade head && uvicorn aegis.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
