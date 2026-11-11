<div align="center">

# MERIDIAN

### Speak the market. Trust every trade.

**A voice-native, agentic paper-trading desk for India's NSE.**
One Conductor listens to you and drives sixteen agents. Five defence layers sit between every idea and every order.
Every decision gets a plain-English story. Not one rupee is real.

`PS-02 · Agentic Trading Bot` · `Paper trading only` · `NSE · NIFTY 500 · ₹ · IST`

</div>

---

## Contents

1. [Why Meridian](#why-meridian)
2. [What it does, against the problem statement](#what-it-does-against-the-problem-statement)
3. [Feature tour](#feature-tour)
4. [Architecture](#architecture)
5. [The sixteen agents](#the-sixteen-agents)
6. [Safety: five defence layers](#safety-five-defence-layers)
7. [Quick start](#quick-start)
8. [A five-minute demo script](#a-five-minute-demo-script)
9. [Screens](#screens)
10. [Configuration](#configuration)
11. [Testing](#testing)
12. [Project structure](#project-structure)
13. [Documentation](#documentation)
14. [Credits, data and disclaimer](#credits-data-and-disclaimer)

---

## Why Meridian

SEBI's studies found that most individual intraday traders in India lose money: about 7 in 10 in FY23. The cause is rarely
a lack of rules. Traders act on noise, skip the risk rules they set for themselves, size positions on emotion, and
afterwards cannot explain why they traded.

Meridian turns the trading desk into a conversation with one accountable intelligence:

* **You talk; agents work.** "Hey Meridian, scan for breakouts" → "Plan a trade on Zomato" → "Yes, buy 482 ETERNAL".
* **The rules are code, not willpower.** Limits live outside the language model. Voice can tighten them, never loosen
  them. Every order needs a Risk PASS fingerprinted to that exact order.
* **Everything is explained.** Every trade, skip, block and halt becomes a Story whose numbers are checked against the
  tools' own output, so the model cannot invent a figure.
* **Honest by design.** Backtests compare against buy-and-hold and the NIFTY 50, and say "no demonstrated edge" when there
  is none.

## What it does, against the problem statement

| PS-02 requirement | How Meridian meets it |
| --- | --- |
| Reads market data and news | NIFTY 500 scanner on real 5-minute bars, sector heatmap and breadth, Google News India headlines, quarterly results in ₹ crore, NSE bulk and block deals |
| Picks or adapts a strategy | The Strategist scores opening-range breakout, level breakout and oversold bounce on regime features plus 60 sessions of evidence, and demotes a strategy after two stops |
| Backtests it | The Backtester replays the rule on 60 real NSE sessions with Indian intraday charges, against buy-and-hold and the NIFTY 50, with an edge gate and a PDF report |
| Trades a simulated account | Paper Exchange with bracket/OCO orders, gap-through stops and Indian charges (brokerage, STT, exchange, SEBI, GST, stamp duty) |
| Sizes positions and sets stops | Exit Planner sets the stop and target before entry; Budget sizes whole shares to a ₹2,500 max loss; a What-if simulator shows the binding limit |
| Respects a daily loss limit | The Risk gate counts the committed max-loss of every entry (₹7,500/day); the Sentinel watches live P&L and drawdown; automations can add a softer guard |
| Plain-language journal | The Journalist writes a Story for every decision, with evidence; the Trade Review adds a post-mortem of each trade |
| **Must:** paper trading only | Boot-time paper assertion, mock broker only, no live-broker code path, "PAPER ONLY" badge rendered from the server's assertion |
| **Must:** hard guardrails and a kill switch | Five layers; hold-to-halt, "stop everything", Esc×2, API and automatic triggers |
| **Must:** backtest vs buy-and-hold | Backtest Lab: equity curves, drawdown, Sharpe, win rate, R-distribution, verdict, PDF export |

## Feature tour

### Voice-first Conductor
* Wake phrase "Hey Meridian", hold **Space** to talk, or type. Local speech-to-text (faster-whisper) with an NSE vocabulary.
* A deterministic intent grammar handles every trading and safety command with no model at all. Open questions go to a
  free local LLM (Ollama `qwen2.5:3b` by default, or any OpenAI-compatible endpoint). The LLM has no order-placing tool.
* Confirmations follow the upstream repo's own rule: only a reply that starts with "yes" and matches the ticket counts.
  "Sure, go ahead" is rejected.
* Voice output through OmniVoice (a designed, then cloned voice), with a browser-voice fallback and captions always on.

### Trading pipeline (scan → plan → test → size → gate → approve → fill → story)
* **Scanner** ranks opening-range breakouts across the NIFTY 500.
* **Time Machine** replays the setup on 10,000 Monte-Carlo sessions plus 60 real ones and gives one honest verdict.
* **Budget and Risk** size the order and gate it (format, stop, max loss, daily loss, trades/day, entry window, reward:risk).
* **Paper Exchange** fills a bracket order; stops and targets work as OCO legs.

### Automations: "when X, do Y"
Rules that run on the market clock, created from templates, a visual builder, or by voice.

| Trigger | Action |
| --- | --- |
| At a time · every N minutes · a price cross · day P&L falls to ₹X · risk budget used ≥ X% · a scan finds ≥ N breakouts · an open trade reaches +N R | Briefing · status summary · say a message · scan (report / watch the top hit / plan it) · plan a trade · flatten · halt · move stop to breakeven · trail the stop |

Nine templates: Opening-bell briefing, Breakout radar, Soft loss guard, Risk budget warning, Price alert, Momentum day
planner, Breakeven guard, Trailing lock-in, Pre-close wrap-up. Say them: *"every 15 minutes scan for breakouts and watch the
best one"*, *"at 3 pm give me a status update"*, *"if I'm down 5000 lock the desk"*.
**Automations never place an order** and never replace a ticket that is waiting for your "yes".

### Risk tools
* **What-if simulator:** *"what if I buy 300 Infosys?"* gives the max loss, the limit that binds, the largest size
  allowed, round-trip charges and a gap-through-stop case. It warns when charges would eat the trade. No ticket is created.
* **Breakeven and trailing stops:** stops only ever move up; R stays measured from the original stop.
* **Mandate:** autopilot runs only inside a signed, time-boxed, scoped Mandate that you confirm on screen.

### Review and accountability
* **Trade Review:** a post-mortem of every round trip on the real bars, with MAE and MFE in R and a plain verdict such as
  "reached +1.2R before reversing: a breakeven guard would have saved it". It also breaks down the Indian charges and
  exports an end-of-day PDF.
* **Discipline Scorecard:** grades the session on behaviour (plan before entry, risk respected, patience, every decision
  explained, outcome in R), with the counts behind every score.
* **Hash-chained audit log:** every limit change, order, automation and halt, verifiable from the Guardrails screen.

### Market intelligence
* **Markets:** NIFTY 500 sector heatmap (tile size = traded value, colour = value-weighted move), breadth and mood, top
  gainers and losers, drill-down to stocks. Ask *"how are sectors doing?"*.
* Bulk and block deals, quarterly fundamentals, and news headlines on demand.

### Experience
* A landing page with a 3D Conductor orb, a scroll-driven product demo, a recorded walkthrough of the real desk, themed
  explainer videos, a live risk dial, a Time Machine fan and a hash-chain ledger, ending in a zoom transition into the desk.
* A light "paper & ink" desk: Command Deck (Orb, agent Orrery, Sundial, heatmap, risk reservoir), labelled navigation,
  a ⌘K command palette, and responsive layouts from phone to desktop.

## Architecture

```
┌──────────────────────── web · Next.js 16 (:3000) ────────────────────────┐
│ Landing · Deck · Markets · Studio · Backtest · Portfolio · Review ·      │
│ Ledger · Automations · Guardrails · ⌘K palette · mic (VAD) · captions    │
└───────────────▲─────────────── REST + WebSocket events ───────────────────┘
                │
┌───────────────┴──────────────── core · FastAPI (:8000) ──────────────────┐
│ Conductor: intent grammar → planner → Policy engine → Skill Adapter      │
│ Native services: Strategist · Backtester · Journalist · Sentinel ·       │
│   Paper Exchange · Automations · What-if · Market map · Review ·         │
│   Scorecard                                                              │
│ Skill Adapter → 11 India-edition CLIs (day-trader-skill, run as tools)   │
│ Virtual clock + Replay of the real NSE session · SQLite (events,         │
│   stories, orders, hash-chained audit) · trader/ JSON contract           │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ HTTP
┌───────────────┴───────────── voice-tts · OmniVoice (:8102, optional) ─────┐
│ designed + cloned voice, sentence streaming, WAV cache                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Design principles:
1. **One intelligence layer.** Only the Conductor reasons; workers are deterministic tools with JSON in and JSON out.
2. **Tools, not prompts.** The Python CLIs are the source of truth for numbers; the LLM may only narrate them.
3. **Policy outside the model.** Limits, mandate checks and kill state are enforced in code, before every tool call.
4. **Fail closed.** Unknown state, stale data, a missing verdict or a tool error means no order.
5. **Event-sourced UI.** The UI renders an append-only event stream; the journal and audit log are projections of it.
6. **Replay-first.** A virtual clock runs the whole system on a recorded session, so demos and tests are deterministic.

## The sixteen agents

| Agent | Kind | Job |
| --- | --- | --- |
| Scanner | skill | Opening-range breakouts and daily patterns across the NIFTY 500 |
| News | skill | Google News India headlines, tagged by event |
| Entry Timer | skill | Bar-by-bar trigger status: waiting, triggered or expired |
| Exit Planner | skill | Stop and target before entry; flat-by time |
| Time Machine | skill | Monte-Carlo and real-session replay of the setup; one honest verdict |
| Budget | skill | Whole-share sizing: the smallest of max-loss, position cap, max order and cash wins |
| Risk | skill | PASS/BLOCK per order, fingerprinted and valid only for that order and day |
| Broker | skill | Renders the ticket, records your yes, logs fills |
| Alerts | skill | NSE clock, holidays, stop/target/level alerts |
| Analyst | skill | Quarterly results in ₹ crore |
| Bulk Deals | skill | NSE bulk and block deal disclosures |
| Strategist | native | Picks or adapts the strategy; demotes after consecutive stops |
| Backtester | native | Strategy vs buy-and-hold vs NIFTY 50 with costs and an edge gate |
| Journalist | native | Stories with evidence; every number validated |
| Sentinel | native | Circuit breakers and the kill switch; acts without the Conductor |
| Paper Exchange | native | Matching engine, bracket/OCO orders, charges, positions |

## Safety: five defence layers

| Layer | Guarantees | Fails |
| --- | --- | --- |
| L0 Paper-only assertion | No real-money path exists; the app refuses to boot otherwise | closed |
| L1 Trade gate | Every order has a stop and fits max-loss, daily loss, trades/day, reward:risk, window, size, cash | closed |
| L2 Mandate | Autopilot is explicit, scoped, time-boxed and revocable | closed (back to Advise) |
| L3 Circuit breakers | Live loss, drawdown, stale data and error storms pause trading | closed (pause and notify) |
| L4 Kill switch | One gesture cancels, flattens and locks, even if the LLM is down | works without the Conductor |

Default limits: ₹5,00,000 paper budget · ₹2,500 max loss per trade · ₹7,500 daily loss · 3 trades a day · reward:risk ≥ 1 ·
entries 09:30–15:00 IST · flat by 15:15 · long only, no options, margin or shorts.

## Quick start

**Requirements:** Python 3.11+ (3.12 tested), Node.js 20+ (22 tested), about 2 GB of disk. Optional: Ollama for the
conversational LLM; an NVIDIA GPU or Apple Silicon for live OmniVoice speech.

### macOS / Linux

```bash
git clone --recurse-submodules https://github.com/Rishit1105/agentx.git && cd agentx
python3 -m venv .venv
.venv/bin/python -m pip install "fastapi>=0.115" "uvicorn[standard]" pydantic httpx numpy faster-whisper reportlab pytest pytest-asyncio python-dotenv tzdata
cp .env.example .env
(cd web && npm install)
```

Run the two services in two terminals:

```bash
.venv/bin/python -m uvicorn core.main:app --host 127.0.0.1 --port 8000
```

```bash
cd web && npm run dev
```

Open **http://localhost:3000** for the landing page, or **http://localhost:3000/deck** for the desk. The backend is at
http://localhost:8000 (`/healthz`, `/api/state`).

### Windows

```bash
python -m venv .venv
.venv/Scripts/python -m pip install "fastapi>=0.115" "uvicorn[standard]" pydantic httpx numpy faster-whisper reportlab pytest pytest-asyncio python-dotenv tzdata
cd web && npm install && cd ..
copy .env.example .env
powershell -ExecutionPolicy Bypass -File start.ps1
```

### Optional extras
* **Conversational LLM:** `ollama pull qwen2.5:3b` (or point `LLM_BASE_URL` at Groq / Gemini free tiers).
* **OmniVoice:** `python -m venv --system-site-packages voice-tts/.venv`, then
  `voice-tts/.venv/bin/python -m pip install -e vendor/OmniVoice fastapi "uvicorn[standard]" soundfile`, and run
  `uvicorn server:app --app-dir voice-tts --port 8102`.
* **Zerodha Kite-style mirror:** see [zerodha-clone/MERIDIAN.md](zerodha-clone/MERIDIAN.md) (needs MongoDB), then set
  `ZERODHA_CLONE_URL=http://localhost:3002`.
* **Fresh data:** after 15:30 IST run `scripts/record_nse.py` and set `REPLAY_DATE`.
* **Re-record the product video:** with both services running, `cd web && node scripts/record-demo.mjs`.

## A five-minute demo script

Open `/deck`, press play on the NSE REPLAY transport, then type, hold **Space**, or click the Orb:

| Minute | Say | You see |
| --- | --- | --- |
| 0:00 | "Hey Meridian, good morning" | Briefing: clock, breadth, equity, risk budget |
| 0:30 | "Scan for breakouts" | Orrery lights the Scanner; 130 of 497 NSE stocks broke out |
| 1:00 | "Plan a trade on Zomato" | Ticket: 482 ETERNAL, stop 365.57, target 375.93, risk ₹2,496.76, Risk PASS |
| 1:40 | "Sure, go ahead" → "Yes, buy 482 ETERNAL" | First rejected, second placed; paper fill with Indian charges |
| 2:10 | "What if I buy 600 Zomato?" | What-if: max loss, binding limit, gap scenario, nothing placed |
| 2:40 | "Raise my daily loss limit" | Refused: voice can only tighten |
| 3:00 | "Every 15 minutes scan for breakouts and watch the best one" | A live automation appears on the Automations screen |
| 3:30 | "How are sectors doing?" | Breadth mood and the strongest and weakest sectors |
| 4:00 | "Backtest it against buy and hold" | Backtest Lab with an honest verdict |
| 4:30 | "Stop everything" | Halted: orders cancelled, flat, locked, Kill Story written |

Then open **Review** for the post-mortem and PDF, and **Ledger** for the Discipline Scorecard.

## Screens

| Route | Screen |
| --- | --- |
| `/` | Landing page |
| `/deck` | Command Deck: Orb, agent Orrery, Sundial, sector heatmap, risk reservoir, ticket, chat |
| `/markets` | NIFTY 500 sector heatmap, breadth, movers |
| `/studio` | Trade Studio: candles, lifecycle stepper, Time Machine fan, What-if simulator, sizing, risk gate |
| `/backtest` | Backtest Lab: strategy vs buy-and-hold vs NIFTY 50, PDF export |
| `/portfolio` | Paper positions, P&L, fills |
| `/review` | Trade Review: MAE/MFE post-mortem, charges, end-of-day PDF |
| `/ledger` | Discipline Scorecard and every Story with its evidence |
| `/automations` | Rule builder, templates, voice rules, activity log |
| `/guardrails` | Limits, five layers, kill switch, audit-chain verification |

Keyboard: `1`–`9` switch screens, `⌘K` opens the palette, `Space` is push-to-talk, `Esc Esc` halts.

## Configuration

Copy `.env.example` to `.env`. The main settings:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LLM_ENABLED`, `LLM_BASE_URL`, `LLM_MODEL` | Ollama `qwen2.5:3b` | Conversational LLM (any OpenAI-compatible endpoint) |
| `REPLAY_DEFAULT`, `REPLAY_DATE`, `REPLAY_START`, `REPLAY_SPEED` | `true`, `2026-11-11`, `09:25`, `20` | Start on the recorded NSE session |
| `MERIDIAN_MODE_DEFAULT` | `advise` | `observe` · `advise` · `autopilot` (autopilot still needs a Mandate) |
| `MERIDIAN_BROKER` | `mock` | Paper exchange only; there is no live-broker path |
| `STT_MODEL`, `STT_ENABLED` | `base.en`, `true` | Local faster-whisper model |
| `TTS_URL`, `VOICE_ENGINE` | `:8102`, `auto` | OmniVoice service and voice selection |
| `ZERODHA_CLONE_URL` | empty | Optional loopback-only Kite-style mirror |
| `MERIDIAN_TOKEN` | empty | If set, required on POST/PATCH/DELETE `/api/*` and the WebSocket |

Trading limits live in `trader/config.json` (created from the India edition's `config.example.json`) and can only be
tightened from the UI or by voice.

## Testing

```bash
.venv/bin/python -m pytest                       # 93 unit and contract tests
.venv/bin/python scripts/e2e_replay.py            # 25-check acceptance run against a running core
python3 -m unittest discover -s vendor/day-trader-skill/tests   # 315 upstream tests
```

The unit tests cover the Policy engine (tighten-only, kill state), the audit hash chain, the Paper Exchange (OCO, gaps,
charges), the Journalist's numeric validator, Speakable, the intent grammar (including spoken automations), the India
edition CLIs on the recorded session, automations, the What-if simulator and the market map. The end-to-end run plays the
demo script against the live core and checks every number against the recorded NSE session.

## Project structure

```
core/                    FastAPI backend
  main.py                REST + WebSocket + tick loop
  desk.py                orchestration: pipeline, approvals, scheduler, autopilot
  conductor/             intent grammar, LLM client, narration
  services/              strategist, backtester, journalist, sentinel, automations,
                         whatif, marketmap, review, scorecard, report
  exchange/              paper matching engine, Zerodha-clone mirror
  adapter/               Skill Adapter for the CLI agents
  voice/                 speech-to-text, Speakable, TTS client
web/                     Next.js 16 app
  app/                   landing (/) and the desk screens
  components/            Orb, Orrery, instruments, heatmap, what-if, scorecard, palette
  components/landing/    landing sections and interactive components
  scripts/record-demo.mjs   Playwright product recording
vendor/                  day-trader-skill (upstream), India edition, OmniVoice
replay/fixtures-in/      the recorded NSE session (bars, news, fundamentals, deals)
voice-tts/               OmniVoice service
zerodha-clone/           optional Kite-style broker UI wired to Meridian
tests/                   pytest suite
docs/                    feature catalogue, API reference, frontend research
```

## Documentation

* [docs/FEATURES.md](docs/FEATURES.md): every voice command, automation and screen
* [docs/API.md](docs/API.md): the REST and WebSocket API
* [docs/frontend-research.md](docs/frontend-research.md): design research and the build list behind the UI
* [vendor/day-trader-skill-in/INDIA_EDITION.md](vendor/day-trader-skill-in/INDIA_EDITION.md): the India edition patches

## Credits, data and disclaimer

* Agents built on [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill) (MIT), adapted for the NSE.
* Voice by [OmniVoice](https://github.com/k2-fsa/OmniVoice) (Apache-2.0); speech recognition by faster-whisper.
* Market data: Yahoo Finance (unofficial), NSE India archives, Google News. Landing page videos are embedded from their
  YouTube channels (NSE India, CNBC-TV18, Zerodha, Business Standard) and remain theirs.

**Disclaimer.** Meridian is an educational prototype. It trades a simulated (paper) account only and is not investment
advice. SEBI's studies found most individual intraday and F&O traders lose money. Backtests and simulations do not
predict the future.
