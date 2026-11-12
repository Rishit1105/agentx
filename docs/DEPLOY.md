# Deploying Meridian

Meridian is two services, deployed separately:

| Part | What it is | Where it fits |
| --- | --- | --- |
| `web/` | Next.js 16 frontend (landing page + desk) | **Vercel** (zero config) |
| `core/` | FastAPI backend: WebSocket event stream, agent CLIs as subprocesses, SQLite, replay data | A container host: **Render**, **Railway** or **Fly.io** |

Vercel can't host the backend. Its serverless functions are short-lived and stateless, but the core keeps a WebSocket open,
runs a 2 Hz tick loop, spawns the agent CLIs and writes SQLite. Put the core in a container (the repo root `Dockerfile`)
and point the frontend at it.

## 1. Backend (container)

The `Dockerfile` builds the core with the recorded NSE session. Speech-to-text and the LLM are off by default, to fit
free tiers.

**Render** (simplest): New → Web Service → connect the GitHub repo → Runtime **Docker** → instance type with ≥ 512 MB.
Set environment variables:

```
UI_ORIGIN=https://<your-app>.vercel.app
UI_ORIGIN_REGEX=https://.*\.vercel\.app       # optional: allow Vercel preview deployments
REPLAY_DEFAULT=true
```

**Railway**: New Project → Deploy from GitHub repo → it detects the Dockerfile. Add the same variables.

**Fly.io**: `fly launch` in the repo root (it detects the Dockerfile), then `fly secrets set UI_ORIGIN=…` and `fly deploy`.

Optional:
- Speech-to-text: build with `--build-arg WITH_STT=1` and set `STT_ENABLED=true` (needs ~1 GB RAM).
- Conversational LLM: set `LLM_ENABLED=true`, `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY` for a hosted
  OpenAI-compatible endpoint (for example Groq). Without it the deterministic grammar still handles every trading and
  safety command.
- `MERIDIAN_TOKEN`: require a token on state-changing API calls.

Check it: `https://<backend>/healthz` should return `{"ok": true, "paper": {"ok": true, …}}`.

## 2. Frontend (Vercel)

1. vercel.com → Add New → Project → import the GitHub repo.
2. **Root Directory: `web`** (framework preset: Next.js).
3. Environment variable: `NEXT_PUBLIC_CORE=https://<your-backend-host>` (no trailing slash). The WebSocket URL is derived
   from it (`https` → `wss`).
4. Deploy. The landing page is at `/`, the desk at `/deck`.

## 3. Notes

- **Free tiers sleep.** Render's free web service sleeps after inactivity; the first request takes about 30–60 s. For a
  live demo, use a paid instance or open `/healthz` a minute before presenting.
- **Data.** The container ships the recorded session of 11 Nov 2026 (about 50 MB). SQLite lives in the container, so a
  redeploy starts a fresh paper account, which is fine for a demo.
- **Paper only.** No broker credentials are needed or accepted anywhere; the Zerodha mirror only talks to loopback hosts.
