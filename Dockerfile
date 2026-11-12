# Meridian core (FastAPI) for Render / Railway / Fly.io / any container host.
# The web app deploys separately (Vercel); point it here with NEXT_PUBLIC_CORE.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    REPLAY_DEFAULT=true STT_ENABLED=false LLM_ENABLED=false MERIDIAN_BROKER=mock
WORKDIR /app

RUN pip install "fastapi>=0.115" "uvicorn[standard]" pydantic httpx numpy reportlab python-dotenv tzdata
# speech-to-text is optional (it adds ~300 MB); enable with --build-arg WITH_STT=1 and STT_ENABLED=true
ARG WITH_STT=0
RUN if [ "$WITH_STT" = "1" ]; then pip install faster-whisper; fi

COPY core ./core
COPY vendor/day-trader-skill-in ./vendor/day-trader-skill-in
COPY replay ./replay
COPY scripts/make_india_edition.py ./scripts/make_india_edition.py

EXPOSE 8000
# most hosts inject $PORT; default to 8000
CMD ["sh", "-c", "uvicorn core.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
