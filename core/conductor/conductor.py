"""The Conductor: Meridian's single intelligence layer (the "Jarvis").

Request pipeline (blueprint 6.4):
 1. Router: deterministic grammar for safety words and the whole command catalogue (halt bypasses everything).
 2. Planner: for open-ended questions, a free local LLM (Ollama) with tool use. It has NO order-placing tool.
 3. Policy: every tool call is authorised in code before it runs.
 4. Narrator: replies are built from tool numbers only; Speakable turns them into speech.
State machine: IDLE -> LISTENING -> THINKING -> (AWAITING_CONFIRM) -> SPEAKING -> IDLE; HALTED when locked.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path

from ..clock import clock
from ..costs import inr
from ..voice.speakable import NAMES, sentences, speakable
from ..voice.stt import stt
from ..voice.tts_client import tts
from .llm import llm
from .router import Intent, ensure_aliases, route

SYSTEM = (Path(__file__).parent / "prompts" / "system.md").read_text(encoding="utf-8")

LLM_TOOLS = [
    {"name": "scan_market", "description": "Run the chart scanner for opening-range breakouts right now.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "get_news", "description": "Recent headlines and tags for tickers.",
     "parameters": {"type": "object", "properties": {"tickers": {"type": "array", "items": {"type": "string"}}},
                    "required": ["tickers"]}},
    {"name": "plan_trade", "description": "Run the full plan for one symbol: strategy, entry, stop/target, odds, size, "
     "risk gate. Produces a ticket the USER must approve. Cannot place orders.",
     "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}},
    {"name": "run_backtest", "description": "Backtest a strategy (orb, level, bounce) on 60 sessions vs buy-and-hold.",
     "parameters": {"type": "object", "properties": {"symbol": {"type": "string"},
                    "strategy": {"type": "string", "enum": ["orb", "level", "bounce"]}}, "required": ["symbol"]}},
    {"name": "pick_strategy", "description": "Rank strategies for a symbol today with reasons.",
     "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}},
    {"name": "company_facts", "description": "SEC quarterly results (revenue, EPS, margins, growth).",
     "parameters": {"type": "object", "properties": {"tickers": {"type": "array", "items": {"type": "string"}}},
                    "required": ["tickers"]}},
    {"name": "bulk_deals", "description": "NSE bulk and block deals (large disclosed trades), optionally for one symbol.",
     "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}}},
    {"name": "read_story", "description": "Journal stories (why a trade, skip, block or halt happened).",
     "parameters": {"type": "object", "properties": {"symbol": {"type": "string"},
                    "kind": {"type": "string", "enum": ["trade", "skip", "block", "halt", "summary"]}}}},
    {"name": "get_state", "description": "Account balance, positions, risk used today, mode, limits, market clock.",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "navigate_ui", "description": "Show a screen to the user.",
     "parameters": {"type": "object", "properties": {"screen": {"type": "string", "enum": ["deck", "studio", "backtest",
                    "portfolio", "ledger", "guardrails"]}, "symbol": {"type": "string"}}, "required": ["screen"]}},
]

HELP = ("Try: scan for breakouts. Plan a trade on Infosys. Does it pass risk. Yes, buy, then the quantity and symbol. "
        "Why did you buy Infosys. Backtest it against buy and hold. Any bulk deals. Tighten the daily limit to five "
        "thousand. Or say stop everything.")


def money(x) -> str:
    try:
        return inr(float(x))
    except (TypeError, ValueError):
        return str(x)


def core_symbols() -> set[str]:
    """The original NIFTY 100 symbols: these may be typed in lowercase. Newer NIFTY 500 names need capitals or a company name."""
    import csv
    from ..config import FIXTURES
    try:
        with open(FIXTURES / "nse" / "ind_nifty100list.csv", encoding="utf-8", newline="") as fh:
            return {r["Symbol"].strip() for r in csv.DictReader(fh)}
    except (OSError, KeyError):
        return set()


class Conductor:
    def __init__(self, desk):
        self.desk = desk
        self.state = "IDLE"
        self.history: list[dict] = []
        self.confirm_strikes = 0
        self.last_symbol: str | None = None
        self.speaking_id: str | None = None
        self._busy = asyncio.Lock()

    # ------------------------------------------------------------------ info
    def llm_info(self):
        return llm.info()

    def voice_info(self):
        return {"tts": tts.state(), "stt": stt.state(), "state": self.state}

    def set_state(self, s: str):
        if self.desk.sentinel.state in ("HALTING", "LOCKED") and s in ("IDLE",):
            s = "HALTED"
        if s != self.state:
            self.state = s
            self.desk.bus.emit("voice.state", {"state": s.lower()}, actor="conductor", persist=False)

    # ------------------------------------------------------------------ speech out
    async def say(self, text: str, kind: str = "reply", force: bool = False) -> dict:
        sid = "u_" + uuid.uuid4().hex[:8]
        speed = 0.95 if kind == "risk" else 1.05 if kind == "status" else 1.0
        speech = speakable(text, set(self.desk.market.symbols()))
        parts = sentences(speech) or [speech]
        await tts.health()
        engine = tts.engine()   # one engine for every reply: never mix cached OmniVoice clips with browser speech
        self.desk.db.execute("INSERT INTO turns(ts,role,text) VALUES(?,?,?)", (clock.now().isoformat(), "meridian", text))
        self.history.append({"role": "assistant", "content": text})
        self.history = self.history[-20:]
        self.desk.bus.emit("voice.say", {"id": sid, "text": text, "speech": speech, "kind": kind, "engine": engine,
                                         "speed": speed, "n": len(parts)}, actor="conductor")
        if engine == "omnivoice":
            asyncio.ensure_future(self._stream(sid, parts, speed))
        elif tts.should_prerender():
            asyncio.ensure_future(self._prerender(parts, speed))   # next time it's instant
        return {"id": sid, "text": text, "engine": engine}

    async def _stream(self, sid, parts, speed):
        for i, p in enumerate(parts):
            k = await tts.render(p, speed)
            self.desk.bus.emit("tts.chunk", {"id": sid, "seq": i, "n": len(parts), "url": f"/api/tts/{k}.wav" if k else None,
                                             "text": p}, actor="conductor", persist=False)

    async def _prerender(self, parts, speed):
        for p in parts:
            if len(p) < 160:
                await tts.render(p, speed)

    # ------------------------------------------------------------------ main entry
    async def handle(self, raw: str, *, source: str = "chat", confidence: float | None = None) -> dict:
        raw = (raw or "").strip()
        if not raw:
            return {"reply": ""}
        universe = set(self.desk.market.symbols()) | set(NAMES)
        ensure_aliases(self.desk.market.names, core_symbols())
        intent = route(raw, universe=universe, pending=self.desk.pending is not None)
        self.desk.db.execute("INSERT INTO turns(ts,role,text) VALUES(?,?,?)", (clock.now().isoformat(), "user", raw))
        self.history.append({"role": "user", "content": raw})
        self.desk.bus.emit("voice.final", {"text": raw, "source": source, "confidence": confidence,
                                           "intent": intent.name, "slots": intent.slots}, actor="user")
        # halt bypasses everything (any confidence, any state, no LLM)
        if intent.name == "halt":
            res = await self.desk.sentinel.halt("voice" if source == "voice" else "chat", actor="user",
                                                detail={"utterance": raw, "confidence": confidence})
            self.set_state("HALTED")
            return {"reply": "Stopped.", "intent": "halt", "result": res}
        min_conf = self.desk.cfg.get("meridian_voice", {}).get("min_confidence_action", 0.85)
        actionish = intent.name in ("confirm_yes", "flatten", "flatten_all", "set_limits", "autopilot", "plan")
        if source == "voice" and confidence is not None and confidence < min_conf and actionish:
            r = await self.say(f"I heard \"{intent.text}\" but I'm not sure. Please repeat, or tap it on screen.",
                               kind="status")
            return {"reply": r["text"], "intent": "low_confidence"}
        if self._busy.locked() and intent.name not in ("confirm_yes", "confirm_no"):
            r = await self.say("One moment, I'm still working on the last request.", kind="status")
            return {"reply": r["text"], "intent": "busy"}
        async with self._busy:
            self.set_state("THINKING")
            try:
                reply = await self.dispatch(intent, source)
            except Exception as e:
                self.desk.sentinel.note_tool(False)
                reply = f"Something failed while doing that: {e.__class__.__name__}. Nothing was traded."
                self.desk.audit.append("conductor.error", intent=intent.name, error=str(e)[:300])
            if reply:
                await self.say(reply, kind="risk" if intent.name in ("confirm_yes", "set_limits") else "reply")
            self.set_state("AWAITING_CONFIRM" if self.desk.pending else
                           "HALTED" if self.desk.sentinel.state == "LOCKED" else "IDLE")
            return {"reply": reply, "intent": intent.name, "slots": intent.slots}

    # ------------------------------------------------------------------ intents
    async def dispatch(self, it: Intent, source: str) -> str:
        d = self.desk
        s = it.slots
        n = it.name
        if n == "wake_only":
            self.set_state("LISTENING")
            return "Listening."
        if n == "help":
            return HELP
        if n == "rearm":
            return "Re-arming needs the Guardrails screen and a typed reason, after the cool-down. I can't do it by voice."
        if n == "confirm_yes":
            out = await d.approve(it.text, origin="voice" if source == "voice" else "user", user_yes=True)
            if out.get("ok"):
                self.confirm_strikes = 0
                f = out["fill"]
                return (f"Placed in the paper account: bought {int(f['qty'])} {f['symbol']} at {f['price']:.2f}. "
                        f"Alerts are watching the stop, the target and {d.cfg.get('flat_by', '15:55')}.")
            return await self._confirm_fail(out.get("reason", "not recorded"))
        if n in ("confirm_invalid",):
            return await self._confirm_fail('only a reply that starts with "yes" counts')
        if n == "confirm_no":
            await d.decline(it.text)
            self.confirm_strikes = 0
            return "Ticket cancelled. Nothing was placed."
        if n == "yes_no_ticket":
            return "There's no ticket waiting. Ask me to plan a trade first."
        if n == "briefing":
            return await self.briefing()
        if n == "scan":
            return await self.scan(then_plan=s.get("then_plan"))
        if n == "plan":
            sym = s.get("symbol")
            if not sym and (s.get("best") or not sym):
                hits = (d.last_scan or {}).get("hits") or []
                if not hits:
                    if s.get("best"):
                        await self.say("Scanning first.", kind="status")
                        await d.scan_market("orb")
                        hits = (d.last_scan or {}).get("hits") or []
                    else:
                        return "Which symbol? For example: plan a trade on Tesla."
                hit = hits[0] if hits else None
                if not hit:
                    return "The scan found nothing that fits right now."
                sym = hit["symbol"]
                return await self.plan(sym, qty=s.get("qty"), scan_hit=hit)
            return await self.plan(sym, qty=s.get("qty"))
        if n == "size" or n == "where_stop" or n == "odds" or n == "risk_check":
            return self.ticket_detail(n)
        if n == "flatten":
            sym = s.get("symbol") or self.last_symbol
            if not sym:
                return "Which position should I close?"
            out = await d.flatten(sym, reason="user")
            if not out.get("ok"):
                return out.get("reason", "Nothing to close.")
            f = out["fill"]
            return f"Closed {sym}: sold {int(f['qty'])} at {f['price']:.2f}, P&L {money(f.get('pnl', 0))}."
        if n == "flatten_all":
            ps = d.exchange.positions()
            for p in ps:
                await d.flatten(p["symbol"], reason="user")
            return f"Closed {len(ps)} position{'s' if len(ps) != 1 else ''}." if ps else "You're already flat."
        if n == "why":
            return self.why(s.get("symbol") or self.last_symbol, s.get("kind"))
        if n == "journal":
            st = d.journalist.list(limit=6)
            if not st:
                return "The journal is empty so far today."
            self.nav("ledger")
            return " ".join(x["headline"] for x in st[:4])
        if n == "news":
            sym = s.get("symbol") or self.last_symbol
            if not sym:
                return "News for which symbol?"
            nw = await d.get_news([sym], 24)
            if not nw["items"]:
                return f"No new headlines for {sym} in the last day."
            top = nw["items"][0]
            return (f"{len(nw['items'])} headlines on {sym}. Latest: \"{top['title'][:90]}\""
                    + (f", tagged {', '.join(nw['tags'])}." if nw["tags"] else "."))
        if n == "facts":
            sym = s.get("symbol")
            fx = await d.company_facts([sym])
            c = (fx["companies"] or [{}])[0]
            q = (c.get("quarters") or [None])[0]
            if not q:
                return f"I couldn't read SEC figures for {sym}{' offline' if clock.mode == 'replay' else ''}."
            rev = q.get("revenue")
            cur = q.get("currency", "INR")
            rev_s = f"{inr(rev / 1e7, 0)} crore" if cur == "INR" else f"{cur} {rev / 1e9:.2f} billion"
            return (f"{d.market.name(sym)} {q['fiscal']}: revenue {rev_s}"
                    + (f", up {q['revenue_yoy']}% on the year" if q.get("revenue_yoy") is not None else "")
                    + (f"; diluted EPS {q['eps_diluted']}" if q.get("eps_diluted") is not None else "")
                    + (f"; operating margin {q['operating_margin']}%." if q.get("operating_margin") is not None else "."))
        if n == "deals":
            dl = await d.bulk_deals(s.get("symbol"))
            f = dl["deals"]
            if not f:
                return f"No bulk or block deals{' in ' + s['symbol'] if s.get('symbol') else ''} in the latest NSE file."
            top = f[0]
            return (f"{len(f)} large disclosed deals. Biggest: {top['client']} {top['side'].lower()} {top['qty']:,} "
                    f"{top['symbol']} at {top['price']:.2f}, about {top['value_inr'] / 1e7:.1f} crore rupees, on {top['date']}. "
                    "Disclosures are information, not signals.")
        if n == "backtest":
            sym = s.get("symbol") or self.last_symbol or "RELIANCE"
            strat = s.get("strategy") or (d.pending or {}).get("strategy") or "orb"
            rep = d.run_backtest(sym, strat)
            self.nav("backtest", sym)
            if rep.get("error"):
                return rep["error"]
            st, bh = rep["strategy_stats"], rep["buy_hold"]
            return (f"{rep['strategy']['label']} on {sym}, {rep['window']['sessions']} sessions: {st['trades']} trades, "
                    f"win rate {st['win_rate']}%, net {st['net_return_pct']:+.2f}% versus buy-and-hold "
                    f"{bh['net_return_pct']:+.2f}%. Verdict: {rep['verdict']}.")
        if n == "pick_strategy":
            sym = s.get("symbol") or self.last_symbol or "RELIANCE"
            r = d.pick_strategy(sym)
            return f"For {sym}: {r['reason']}."
        if n == "account":
            self.nav("portfolio")
            a = d.exchange.account()
            ps = d.exchange.positions()
            pos = "; ".join(f"{int(p['qty'])} {p['symbol']} {money(p['unrealized'])}" for p in ps) or "no open positions"
            return (f"Paper equity {money(a['equity'])}, day P&L {money(a['day_pnl'])}, cash {money(a['cash'])}. {pos}.")
        if n == "risk_state":
            r = d.risk_used()
            return (f"You've committed {money(r['committed'])} of your {money(r['daily_limit'])} daily loss limit, "
                    f"{r['trades_used']} of {r['max_trades']} trades. Max loss per trade {money(r['max_loss_per_trade'])}.")
        if n == "set_limits":
            if s.get("value") is None:
                return "Tighten it to what? For example: tighten the daily limit to one hundred."
            out = d.tighten({s["key"]: s["value"]}, origin=source)
            if not out["ok"]:
                return out["reason"]
            k, v = next(iter(out["changed"].items()))
            return f"Done. {k.replace('_usd', '').replace('_', ' ')} is now {v:g}, tightened from {out['before'][k]:g}."
        if n == "set_mode":
            mode = s["mode"]
            if mode == "observe":
                d.mandates.revoke("user paused")
            d.set_mode(mode, reason=source)
            return f"{mode.capitalize()} mode." + (" I'll explain and scan but won't create orders." if mode == "observe" else "")
        if n == "autopilot":
            prop = {"minutes": s["minutes"], "max_trades": min(s["max_trades"], d.cfg["max_trades_per_day"]),
                    "strategies": ["orb", "level"], "max_loss_per_trade": d.cfg["max_loss_per_trade_usd"],
                    "symbols": "any"}
            d.bus.emit("ui.mandate", {"proposal": prop}, actor="conductor")
            return (f"Autopilot for {prop['minutes']} minutes, up to {prop['max_trades']} trades, long only, risking at most "
                    f"{money(prop['max_loss_per_trade'])} a trade. Confirm the mandate on screen to start it.")
        if n == "alert_add":
            if not s.get("symbol") or s.get("price") is None:
                return "Say a symbol and a price, for example: alert me if Tesla hits three seventy."
            out = await d.alerts_add(symbol=s["symbol"], above=None if s["below"] else s["price"],
                                     below=s["price"] if s["below"] else None)
            return (f"Alert set: {s['symbol']} {'below' if s['below'] else 'above'} {s['price']:.2f}." if out["ok"]
                    else f"The alert tool refused: {out['error']}")
        if n == "alert_time":
            at = s["at"].strip()
            out = await d.alerts_add(at=at if ":" in at else "15:55", label="reminder")
            return f"Reminder set for {at}." if out["ok"] else f"The alert tool refused: {out['error']}"
        if n == "navigate":
            self.nav(s["screen"], s.get("symbol"))
            return ""
        return await self.llm_turn(it.text)

    async def _confirm_fail(self, why: str) -> str:
        d = self.desk
        self.confirm_strikes += 1
        t = d.ticket_view()
        if not t:
            return "There's no ticket waiting."
        if self.confirm_strikes >= 2:
            await d.decline("no clear yes")
            self.confirm_strikes = 0
            return "That still wasn't a clear yes, so I cancelled the ticket. Nothing was placed."
        return f"Not placed: {why}. To place it, say: {t['say']}."

    # ------------------------------------------------------------------ composite flows
    async def briefing(self) -> str:
        d = self.desk
        ck = await d.market_clock()
        a = d.exchange.account()
        r = d.risk_used()
        when = clock.now().strftime("%H:%M")
        phase = clock.phase(d.cfg).replace("_", " ")
        status = "open" if ck.get("open") else f"closed ({ck.get('reason', 'outside hours')})"
        br = d.strategist.breadth()
        return (f"Good {'morning' if clock.now().hour < 12 else 'afternoon'}. It's {when} in Mumbai, NSE is {status}, "
                f"phase: {phase}. {br['pct_above_open']}% of the universe is above its open. "
                f"Paper equity {money(a['equity'])}; {money(r['daily_limit'] - r['committed'])} of risk budget left, "
                f"{r['max_trades'] - r['trades_used']} trades available.")

    async def scan(self, then_plan: bool = False) -> str:
        d = self.desk
        await self.say("Scanning now.", kind="status")
        res = await d.scan_market("orb")
        if res.get("status") == "error":
            return f"The scanner failed: {(res.get('error') or '')[:120]}"
        hits = res["hits"]
        if not hits:
            return "No opening-range breakouts so far."
        top = hits[0]
        lead = top
        self.last_symbol = lead["symbol"]
        msg = (f"{res['count']} of the NIFTY 100 closed above their fifteen-minute opening range. "
               f"{lead['symbol']} is the cleanest, {lead.get('pct_over')}% over at {lead.get('price')}.")
        if then_plan:
            await self.say(msg, kind="status")
            return await self.plan(lead["symbol"], scan_hit=lead)
        return msg + " Plan it?"

    async def plan(self, symbol: str | None, qty: int | None = None, scan_hit: dict | None = None) -> str:
        d = self.desk
        if not symbol:
            return "Which symbol?"
        self.last_symbol = symbol
        self.nav("studio", symbol)
        if scan_hit is None:
            scan_hit = next((h for h in (d.last_scan or {}).get("hits") or [] if h["symbol"] == symbol), None)
        res = await d.plan_trade(symbol, qty=qty, scan_hit=scan_hit)
        return self.narrate_plan(symbol, res, qty)

    async def on_pipeline_result(self, symbol: str, res: dict, origin: str):
        text = self.narrate_plan(symbol, res, None)
        if text:
            await self.say(f"{symbol} triggered. " + text, kind="alert")
        self.set_state("AWAITING_CONFIRM" if self.desk.pending else "IDLE")

    async def on_autopilot(self, ticket: dict, out: dict):
        if out.get("ok"):
            f = out["fill"]
            await self.say(f"Autopilot bought {int(f['qty'])} {f['symbol']} at {f['price']:.2f} under mandate "
                           f"{out.get('mandate_id')}. Max loss {money(ticket['max_loss'])}.", kind="alert")
        else:
            await self.say(f"Autopilot did not place {ticket['symbol']}: {out.get('reason')}.", kind="status")

    def narrate_plan(self, symbol: str, res: dict, qty: int | None) -> str:
        st = res.get("status")
        d = self.desk
        if st == "ready":
            t = res["ticket"]
            odds = t.get("odds") or {}
            tm = t.get("tm_verdict") or ""
            tm_line = (f"The replay calls it {tm.split(':')[0].lower()}." if tm and "coin flip" in tm.lower() or
                       "break-even" in tm.lower() else (f"Time Machine: {tm.rstrip('.')}." if tm else ""))
            if odds.get("target") is not None:
                tm_line += f" Target first {odds['target'] * 100:.0f}%, stop first {odds['stop'] * 100:.0f}%."
            lim = d.cfg["max_loss_per_trade_usd"]
            tail = (" Autopilot will place it under the mandate." if d.mode == "autopilot" else
                    " Observe mode: I won't place it." if d.mode == "observe" else f" Say \"{t['say']}\" to place it.")
            return (f"{t['strategy_label']}. Entry {t['entry']}, stop {t['stop']}, target {t['target']}. {tm_line} "
                    f"{t['qty']} shares, risking {money(t['max_loss'])}, under your {money(lim)}. Risk gate passed."
                    f"{tail} A stop can fill worse in a fast market.")
        if st == "blocked":
            why = "; ".join(res.get("reasons", []))
            alt = f" {res['suggested_qty']} shares fits. Want {res['suggested_qty']}?" if qty and res.get("suggested_qty") else ""
            return f"I can't place that. {why}.{alt}"
        if st == "waiting":
            return f"{symbol} hasn't triggered yet: {res['reason']}. The Entry Timer is watching it bar by bar."
        if st in ("skipped", "error", "denied"):
            return f"No trade on {symbol}: {res.get('reason')}."
        return f"{symbol}: {st}."

    def ticket_detail(self, what: str) -> str:
        t = self.desk.ticket_view()
        if not t:
            return "No ticket yet. Ask me to plan a trade first."
        if what == "size":
            return f"{t['qty']} shares, bound by {t['bound_by']}, max loss {money(t['max_loss'])}."
        if what == "where_stop":
            return f"Stop {t['stop']}, target {t['target']}, flat by {t['flat_by']}."
        if what == "odds":
            o = t["odds"]
            if o.get("target") is None:
                return f"Time Machine: {t['tm_verdict']}."
            return (f"Target first {o['target'] * 100:.1f}%, stop first {o['stop'] * 100:.1f}%, still open "
                    f"{o['open'] * 100:.1f}%. {t['tm_verdict']}.")
        return (f"Yes: the risk gate passed. Max loss {money(t['max_loss'])}, reward to risk {t['reward_risk']}. "
                f"Say \"{t['say']}\" to place it.")

    def why(self, symbol: str | None, kind: str | None) -> str:
        st = self.desk.journalist.list(symbol=symbol, kind=kind, limit=1) or self.desk.journalist.list(symbol=symbol, limit=1)
        if not st:
            return f"I have no story for {symbol or 'that'} yet."
        s = st[0]
        self.nav("ledger", s["symbol"])
        self.desk.bus.emit("ui.story", {"id": s["id"]}, actor="conductor", persist=False)
        return f"{s['headline']} {s['why']}"[:600]

    def nav(self, screen: str, symbol: str | None = None):
        self.desk.bus.emit("ui.navigate", {"screen": screen, "symbol": symbol}, actor="conductor", persist=False)

    # ------------------------------------------------------------------ LLM planner (free, local)
    async def llm_turn(self, text: str) -> str:
        if not await llm.available():
            return "I didn't catch a command there. " + HELP
        d = self.desk
        ctx = (f"Now {clock.label()}, mode {d.mode}, desk {d.sentinel.state}, paper equity "
               f"{d.exchange.account()['equity']}, open positions {[p['symbol'] for p in d.exchange.positions()]}, "
               f"last symbol {self.last_symbol}.")
        msgs = [{"role": "system", "content": SYSTEM + "\nCONTEXT: " + ctx}]
        msgs += [m for m in self.history[-8:-1]]
        msgs.append({"role": "user", "content": text})
        tools = [{"type": "function", "function": t} for t in LLM_TOOLS]
        t0 = time.time()
        evidence: list = [ctx, d.risk_used(), d.exchange.account(), {k: d.cfg.get(k) for k in (
            "max_loss_per_trade_usd", "max_daily_loss_usd", "max_trades_per_day", "min_reward_risk")}]
        for _ in range(4):
            try:
                msg = await llm.chat(msgs, tools=tools, max_tokens=350)
            except Exception:
                return "My language model is not responding, but every command still works. " + HELP
            calls = llm.tool_calls(msg)
            if not calls:
                content = (msg.get("content") or "").strip()
                # the narrator may only say numbers that came from tools (blueprint 6.2 principle 2)
                from ..services.journalist import validate
                errs = validate(content, {"e": evidence}, set(d.market.symbols()))
                if errs:
                    d.audit.append("llm.rejected", text=content[:400], errors=errs[:5])
                    return ("I won't read out numbers I can't verify from the tools. Try a direct command, for example: "
                            "what are my guardrails, or plan a trade on Tesla.")
                return content[:700] or "Done."
            msgs.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": msg.get("tool_calls")})
            for cid, name, args in calls:
                result = await self.exec_tool(name, args)
                evidence.append(result)
                payload = json.dumps(result, default=str)[:2500]
                if name in ("get_news", "company_facts", "bulk_deals"):
                    payload = f"<untrusted_data>{payload}</untrusted_data>"
                msgs.append({"role": "tool", "tool_call_id": cid, "name": name, "content": payload})
            if time.time() - t0 > 60:
                break
        return "I gathered the data; see the screen for details."

    async def exec_tool(self, name: str, args: dict):
        d = self.desk
        dec = d.policy.authorize(name, args, d.ctx("llm"))
        d.bus.emit("policy.decision", {"tool": name, **dec.to_dict(), "origin": "llm"}, actor="policy")
        if not dec.allowed:
            return {"denied": dec.reason}
        a = dec.args
        if name == "scan_market":
            r = await d.scan_market("orb")
            return {"count": r["count"], "top": r["hits"][:6]}
        if name == "get_news":
            return await d.get_news(a.get("tickers") or [self.last_symbol or "RELIANCE"], 24)
        if name == "plan_trade":
            sym = str(a.get("symbol", "")).upper()
            self.nav("studio", sym)
            r = await d.plan_trade(sym)
            return {"status": r["status"], "ticket": r.get("ticket"), "reasons": r.get("reasons"), "reason": r.get("reason")}
        if name == "run_backtest":
            r = d.run_backtest(str(a.get("symbol", "RELIANCE")).upper(), a.get("strategy", "orb"))
            self.nav("backtest", a.get("symbol"))
            return {k: r.get(k) for k in ("verdict", "window", "strategy", "gate")} | {
                "stats": {k: (r.get("strategy_stats") or {}).get(k) for k in ("trades", "win_rate", "expectancy_r",
                          "net_return_pct", "max_dd_pct", "sharpe")}, "buy_hold": (r.get("buy_hold") or {}).get("net_return_pct")}
        if name == "pick_strategy":
            r = d.pick_strategy(str(a.get("symbol", "RELIANCE")).upper())
            return {"chosen": r["chosen"], "reason": r["reason"]}
        if name == "company_facts":
            return await d.company_facts(a.get("tickers") or ["AAPL"])
        if name == "bulk_deals":
            return await d.bulk_deals(a.get("symbol"))
        if name == "read_story":
            return [{k: s[k] for k in ("kind", "symbol", "headline", "why", "outcome")} for s in
                    d.journalist.list(symbol=a.get("symbol"), kind=a.get("kind"), limit=3)]
        if name == "get_state":
            st = d.state()
            return {k: st[k] for k in ("mode", "risk", "account", "positions", "clock")}
        if name == "navigate_ui":
            self.nav(a.get("screen", "deck"), a.get("symbol"))
            return {"ok": True}
        return {"error": f"unknown tool {name}"}
