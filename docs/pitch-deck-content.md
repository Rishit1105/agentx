# Meridian pitch deck: slide content

Six slides for PS-02 (Agentic Trading Bot). Every number comes from the prototype on the recorded NSE session of
11 Nov 2026, or from the cited SEBI studies. Screenshots: run `node web/scripts/capture-screens.mjs <folder>` with both
services running.

---

## Slide 1 · Intro

**Eyebrow:** PS-02 · Agentic Trading Bot · Paper only
**Title:** MERIDIAN
**Tagline:** Speak the market. Trust every trade.
**One-liner:** A voice-first paper-trading desk for India's NSE. One Conductor listens and drives sixteen agents; five
defence layers stand between every idea and every order, and every decision gets a plain-English story.

| 16 | 5 | 497 | ₹0 |
| --- | --- | --- | --- |
| agents | defence layers | NSE stocks scanned | real money |

**Visual:** the Command Deck screenshot (`deck.png`) in a browser frame.
**Voice chips:** "Hey Meridian, scan for breakouts" · "Zomato mein trade plan karo" · "Stop everything"

---

## Slide 2 · Problem and our solution

**Title:** Traders know the rules. Nothing makes them follow them.

**What SEBI found**
- **7 in 10** individual intraday equity traders lost money in FY23 (SEBI study, July 2024).
- **93%** of individual F&O traders made losses over FY22–FY24 (SEBI study, September 2024).
- Root causes: entries on noise, rules kept in the head, size set by emotion, revenge trades after a loss, no record of why.

**Before / after**

| Moment | Before: a typical retail day | After: with Meridian |
| --- | --- | --- |
| Finding a trade | Tips, charts, FOMO | Scanner ranks 497 NSE stocks on one rule |
| Sizing | "Feels right" | Budget sizes to a ₹2,500 max loss |
| Stop-loss | Often skipped or moved | Required before entry, OCO bracket |
| After a loss | Revenge re-entry | Tilt guard: 15-minute cool-down |
| Limits | Raised mid-day | Voice can only tighten them |
| Afterwards | No idea why | A Story and a post-mortem per trade |

**Three cards:** You talk (English or Hinglish, voice or ⌘K) · Agents work (scan, plan, test, size, gate) · Rules hold
(code, not willpower)

---

## Slide 3 · System architecture and tech stack

**Title:** One intelligence, sixteen tools, policy outside the model

**Layers (top to bottom)**
1. Experience: Landing · Deck · Markets · Studio · Lab · Options · Review · Guardrails
2. Voice gateway: wake word · VAD · Whisper STT · Hinglish · TTS
3. Conductor: intent grammar → planner → narrator, with the Policy engine, Tilt guard, Automations, Compliance
4. Agents: 11 skills (Scanner, News, Entry, Exit, Time Machine, Budget, Risk, Broker, Alerts, Analyst, Bulk Deals) +
   5 native services (Strategist, Backtester, Journalist, Sentinel, Paper Exchange)
5. State and data: SQLite events · hash-chained audit · real NSE replay · Yahoo .NS

**Tech stack**

| Layer | Built with |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind 4 |
| Motion, 3D | Motion 12, three.js |
| Charts | lightweight-charts, SVG |
| Backend | Python 3.12, FastAPI, WebSocket |
| Agents | day-trader-skill, India edition |
| Voice | faster-whisper, OmniVoice |
| LLM | Local Ollama (qwen2.5), optional |
| Storage | SQLite WAL, SHA-256 chain |
| Reports | ReportLab PDFs |
| Testing | pytest, Playwright |

**Footer:** The LLM has no order-placing tool. Every order passes the Policy engine and a fingerprinted Risk PASS.

---

## Slide 4 · Impact and benefits

**Title:** The guardrails held on a real NSE session

**Before / after chart (max loss at the stop, one ETERNAL trade):**
- "Buy 600 Zomato" as asked: ₹3,108, **blocked** (over the ₹2,500 per-trade cap)
- 482 shares sized by Budget: ₹2,497, **pass**
- Revenge re-entry after the stop: ₹0, **cool-down**

**Proof strip:** 117 unit tests pass · 25/25 end-to-end checks · 100% of decisions explained

**Visual:** Trade Review screenshot (`review.png`): Discipline Scorecard and the post-mortem (MAE −1.17R, MFE +0.62R).

**Who benefits**
- Learners: practise with real data and no money at risk
- Busy traders: hands-free scans, automations and alerts
- Brokers and colleges: a safe sandbox with a SEBI-style audit trail

---

## Slide 5 · Feasibility and viability

**Title:** Runs on a laptop today. Ready for a broker tomorrow.

**Technical**
- Built and tested: 13 screens, 50+ API routes, 117 tests, a 25-check replay
- Laptop CPU: local speech-to-text, optional local LLM, no GPU needed
- Real data: a recorded NSE session, plus a live Yahoo .NS mode

**Economic and regulatory**
- Near-zero run cost: MIT and Apache-2.0 components, free data, free local LLM
- SEBI-aligned: algo IDs, kill switch, API audit log, daily logout
- Revenue paths: free for learners; licensed to brokers and colleges

**Risks and mitigations**

| Risk | Mitigation |
| --- | --- |
| Unofficial data | Replay of a recorded day |
| LLM hallucination | Numbers validated against tool output |
| Real-money misuse | No live-broker code path |

**Roadmap:** options chain feed · broker MCP read-only sync · Hindi speech recognition by default · mobile PWA

---

## Slide 6 · Research and references

**Title:** Where Meridian sits, and what it is built on

**Category comparison** (from public product descriptions; category-level, not a product audit)

| Capability | Meridian | No-code algo builders | Options analytics | Trading journals |
| --- | --- | --- | --- | --- |
| Voice, English + Hinglish | Yes | No | No | No |
| Rules enforced before entry | Yes | Partly | No | No |
| Tilt guard with cool-down | Yes | No | No | Flags only |
| Story for every decision | Yes | No | No | Manual |
| Honest backtest vs hold | Yes | Yes | Partly | No |
| Algo IDs + audit chain | Yes | Broker-side | No | No |

**References**
- SEBI: study of intraday traders (July 2024); study of F&O traders (September 2024)
- SEBI: circular on safer participation of retail investors in algorithmic trading (4 February 2025)
- day-trader-skill (Jakeschincariol), MIT licence
- k2-fsa OmniVoice, Apache-2.0
- faster-whisper (SYSTRAN)
- Data: NSE India archives, Yahoo Finance (unofficial), Google News

**Footer:** Educational prototype. Paper trading only. Not investment advice.
