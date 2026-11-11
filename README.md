# MERIDIAN — speak the market, trust every trade

A voice-native **paper-trading desk for the Indian market (NSE)**. One central intelligence, the **Conductor**
(the "Jarvis"), listens, plans and drives **sixteen agents**: the eleven skills of
[day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill) (in an India edition) plus five native services.
It speaks through [OmniVoice](https://github.com/k2-fsa/OmniVoice). **Paper only: there is no real-money code path.**

## What it does (PS-02)

| Requirement | How |
| --- | --- |
| Reads market data and news | Scanner (NIFTY 500 / NSE), sector heatmap + breadth, Google News India headlines, Analyst (quarterly results in ₹ crore), NSE bulk & block deals |
| Picks or adapts a strategy | Strategist scores ORB / level breakout / oversold bounce on regime features + 60-session evidence; demotes after 2 stops |
| Backtests it | Backtester replays the rule on 60 real NSE sessions with Indian intraday charges, vs buy-and-hold and the NIFTY 50; edge gate |
| Trades a simulated account | Paper Exchange: bracket/OCO orders, gap-through stops, brokerage + STT + exchange + SEBI + GST + stamp duty |
| Sizes positions, sets stops | Exit Planner (stop/target before entry) + Budget (whole shares, ₹2,500 max loss) + What-if simulator |
| Daily loss limit | Risk gate counts committed max-loss (₹7,500/day); Sentinel watches live P&L and drawdown |
| Plain-language journal | Journalist writes a Story for every trade, skip, block and halt; every number validated against the evidence |
| Hard guardrails + kill switch | 5 layers: paper assertion, risk gate, mandate, circuit breakers, hold-to-halt (UI / voice / Esc×2 / API / auto) |
| Backtest vs buy-and-hold | Backtest Lab + PDF export |
| Autonomy you can see | Automations (when X, do Y) on the market clock, by click or by voice; autopilot only under a time-boxed Mandate |
| Accountability | Discipline Scorecard grades behaviour (plan, risk, patience, explanation, outcome in R) from the session's evidence |

## Architecture

```
web (Next.js :3000)  ── WebSocket events / REST ──  core (FastAPI :8000)  ── HTTP ──  voice-tts (OmniVoice :8102)
  Command Deck · Trade Studio · Backtest Lab           Conductor (grammar + free local LLM)
  Ledger · Guardrails · Mandate sheet                  Policy engine · Sentinel · Strategist · Backtester · Journalist
  Orb · Orrery · Sundial · Risk Reservoir              Paper Exchange · Skill Adapter -> 11 India-edition CLIs
  mic (AudioWorklet VAD) -> /api/voice/stt             SQLite (events, stories, hash-chained audit) · trader/ files
```

* **Conductor** — deterministic intent grammar handles every blueprint command (halt, yes/no, scan, plan, limits,
  autopilot, why, deals…) with no model; open questions go to a **free local LLM** (Ollama `qwen2.5:3b` by default, or any
  OpenAI-compatible endpoint such as Groq/Gemini free tiers). The LLM has **no order-placing tool**, and any number it says
  must exist in tool output or the answer is withheld.
* **India edition** — `scripts/make_india_edition.py` generates `vendor/day-trader-skill-in/` from the pinned upstream repo
  with a fixed, asserted set of patches: IST, NSE hours 09:15–15:30 and NSE's official holiday list, NSE symbols
  (`M&M`, `BAJAJ-AUTO`), 75-bar sessions, ₹ with lakh/crore grouping, NSE equity universe, Google News India, Yahoo
  quarterly fundamentals (keeps the reported currency: Infosys files in USD), and NSE bulk/block deals in place of the US
  Congress tracker. Sizing, the risk gate, the Time Machine and entry/exit rules are unchanged. Upstream stays untouched.
* **Replay** — `scripts/record_nse.py` recorded the real NSE session of **11 Nov 2026** (NIFTY 100, 60 sessions of
  5-minute bars, headlines, fundamentals, deals, holidays). Every bar in Replay is real; Yahoo's gaps (mostly the 15:15–15:25
  closing window) are carried forward flat and marked. Live mode uses the same code against Yahoo `.NS`.
* **Voice** — OmniVoice voice *designed* ("female, low pitch, british accent") then *cloned* to `voice-tts/voices/meridian.pt`;
  local faster-whisper STT with an NSE vocabulary prompt; wake phrase "Hey Meridian"; barge-in; Speakable says
  "₹2,497.50" as "two thousand four hundred ninety-seven rupees and fifty paise" and "INFY" as "Infosys".
  On CPU OmniVoice runs at RTF ≈ 12–23, so the fallback ladder applies: cached phrases in the OmniVoice voice, everything
  else in the browser voice (captions always). On an NVIDIA GPU it speaks live.

## Highlights

* **Voice-first**: "Hey Meridian, scan for breakouts" → "Plan a trade on Zomato" → "Yes, buy 482 ETERNAL". Every screen
  action has a voice equivalent and every voice action has a visible confirmation.
* **Guardrails the model cannot argue with**: limits live in code, voice can only tighten them, every order needs a
  fingerprinted Risk PASS, and the kill switch works even if the LLM is down.
* **Honest numbers**: the Journalist's numbers are validated against tool output; backtests say "no demonstrated edge"
  when there is none.

See [docs/FEATURES.md](docs/FEATURES.md) for the voice command catalogue and [docs/API.md](docs/API.md) for the REST API.

## New in this fork

* **Automations** (`core/services/automations.py`, screen `/automations`): "when X, do Y" rules on the market clock.
  Triggers: a time, every N minutes, a price cross, day P&L, risk budget used, scan hits. Actions: briefing, status
  summary, say, scan (notify / watch the top hit / plan it), plan, flatten, halt. Seven one-click templates
  (Opening-bell briefing, Breakout radar, Soft loss guard, Risk budget warning, Price alert, Momentum day planner,
  Pre-close wrap-up). Say them too: *"every 15 minutes scan for breakouts and watch the best one"*, *"at 3 pm give me a
  status update"*, *"if I'm down 5000 lock the desk"*, *"list my automations"*. Automations can never place an order:
  a plan still waits for your spoken "yes", and they never replace a ticket that is waiting for one.
* **Discipline Scorecard** (`core/services/scorecard.py`, top of `/ledger`): grades the session on behaviour (plan
  before entry, risk respected, patience, every decision explained, outcome in R), with the counts behind each score.
* **Command palette** (⌘K or the top-bar search): jump to any screen or send any Conductor command without the mic.
* **What-if simulator** (`core/services/whatif.py`, `POST /api/whatif`, or say *"what if I buy 300 Infosys"*): max loss,
  the limit that binds, the largest size allowed, round-trip charges and a gap-through-stop scenario, with warnings
  when charges would eat the trade. It never creates a ticket.
* **Market map** (`core/services/marketmap.py`, `GET /api/market/map`, or *"how are sectors doing?"*): NIFTY 500 sector
  heatmap, value-weighted sector moves, advancers/decliners and a breadth mood, cached per virtual minute.
* **Breakeven guard and trailing lock-in** (automation templates, `POST /api/positions/{symbol}/stop`, or *"move my stop to
  breakeven"*): stops only ever move up; R stays measured from the original stop.
* **Trade Review** (`core/services/review.py`, screen `/review`): post-mortem of every round trip with MAE/MFE in R on the real
  bars, a plain verdict ("reached +1.2R before reversing: a breakeven guard would have saved it"), an Indian charges
  breakdown and a downloadable end-of-day PDF (`GET /api/report/day.pdf`).
* **Markets** (screen `/markets`, also on the Deck): the NIFTY 500 sector heatmap with drill-down to stocks.
* **Light "paper & ink" theme**, a labelled navigation rail (9 screens) and a What-if panel in Trade Studio.
* **Faster tick loop**: trader/ JSON files are parsed once per change (mtime cache) instead of on every 0.5 s tick.
* **Landing page** at `/` (the desk moved to `/deck`): 3D Conductor orb, a scroll-driven product demo, safety,
  automations and backtest sections, and a zoom transition into the desk.

## Run (macOS / Linux)

```bash
python3 -m venv .venv && .venv/bin/python -m pip install "fastapi>=0.115" "uvicorn[standard]" pydantic httpx numpy faster-whisper reportlab pytest pytest-asyncio python-dotenv tzdata
cp .env.example .env
(cd web && npm install)
.venv/bin/python -m uvicorn core.main:app --host 127.0.0.1 --port 8000      # terminal 1
(cd web && npm run dev)                                                      # terminal 2, then open http://localhost:3000
```

## Setup (Windows)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install "fastapi>=0.115" "uvicorn[standard]" pydantic httpx numpy faster-whisper reportlab pytest pytest-asyncio python-dotenv tzdata
python -m venv --system-site-packages voice-tts/.venv
voice-tts/.venv/Scripts/python -m pip install -e vendor/OmniVoice fastapi "uvicorn[standard]" soundfile
cd web && npm install && cd ..
.venv/Scripts/python scripts/make_india_edition.py
copy .env.example .env
```

Optional: `ollama pull qwen2.5:3b` for the conversational brain. Re-record a fresh session after 15:30 IST with
`.venv/Scripts/python scripts/record_nse.py` and set `REPLAY_DATE`.

## Run

```bash
powershell -ExecutionPolicy Bypass -File start.ps1
```

Then open http://localhost:3000, press play on the NSE REPLAY transport, and try (type, hold **Space**, or click the Orb):

1. "Hey Meridian, good morning" → "Scan for breakouts" → "Plan a trade on Zomato"
2. "Sure, go ahead" (rejected) → "Yes, buy 482 ETERNAL" (placed) → "Why did you buy Zomato?"
3. "Buy 600 Zomato" (blocked) → "Raise my daily loss limit to twenty thousand" (refused) → "Any bulk deals?"
4. "Backtest it against buy and hold" → "Go autopilot for two hours, max three trades" (confirm on screen) → "Stop everything"

## Tests

```bash
.venv/Scripts/python -m pytest                      # 93 tests: policy, audit chain, exchange, costs, validator, voice, grammar, India edition
python -m unittest discover -s vendor/day-trader-skill/tests   # upstream: 315 tests
.venv/Scripts/python scripts/e2e_replay.py           # 25-check acceptance run against a running core
```

## Disclaimer

Educational prototype. Simulated (paper) trading only — not investment advice. SEBI's studies found most individual
intraday traders lose money. Backtests and simulations do not predict the future. Data: Yahoo Finance (unofficial), NSE India,
Google News. Licences: day-trader-skill MIT, OmniVoice Apache-2.0.
