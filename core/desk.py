"""The Desk: wires every worker together and runs the trade lifecycle.

Workers (16): 11 repo skills wrapped by the Skill Adapter + Strategist, Backtester, Journalist, Sentinel, Paper Exchange.
Only the Conductor reasons; everything here is deterministic and audited.
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timedelta

from .adapter.skill import ToolResult, read_trader, run_skill, write_trader
from .audit import Audit
from .clock import IST as NY, clock
from .config import ENV, ensure_config, paper_assertion, read_config, write_config
from .db import DB
from .events import EventBus
from .exchange.engine import ExchangeError, PaperExchange
from .market import market
from .costs import inr
from .policy import Mandates, Policy
from .services import backtester as bt
from .services.journalist import Journalist
from .services.sentinel import Sentinel
from .services.strategist import Strategist

AGENTS = [
    # id, label, kind, tool names
    ("scanner", "Scanner", "repo", "trader-scanner"), ("news", "News", "repo", "trader-news"),
    ("entry", "Entry Timer", "repo", "trader-entry"), ("exit", "Exit Planner", "repo", "trader-exit"),
    ("timemachine", "Time Machine", "repo", "trader-timemachine"), ("budget", "Budget", "repo", "trader-budget"),
    ("risk", "Risk", "repo", "trader-risk"), ("broker", "Broker", "repo", "trader-broker"),
    ("alerts", "Alerts", "repo", "trader-alerts"), ("analyst", "Analyst", "repo", "trader-analyst"),
    ("deals", "Bulk Deals", "repo", "trader-deals"),
    ("strategist", "Strategist", "native", None), ("backtester", "Backtester", "native", None),
    ("journalist", "Journalist", "native", None), ("sentinel", "Sentinel", "native", None),
    ("exchange", "Paper Exchange", "native", None),
]
SKILL_TO_AGENT = {a[3]: a[0] for a in AGENTS if a[3]}

PIPELINE = ["Scan", "News", "Strategy", "Entry", "Plan", "Test", "Size", "Gate", "Approve", "Fill"]


class Desk:
    def __init__(self):
        self.cfg = ensure_config()
        self.db = DB()
        self.bus = EventBus(self.db)
        self.audit = Audit(self.db)
        self.market = market
        self.mandates = Mandates(self.db)
        self.policy = Policy(self.db, self.mandates, self.audit)
        self.exchange = PaperExchange(self.db, float(self.cfg["budget"]), self.cfg["meridian_costs"])
        self.exchange.on_fill(self._on_fill)
        self.sentinel = Sentinel(self)
        self.strategist = Strategist()
        self.journalist = Journalist(self)
        self.mode = self.cfg.get("meridian_mode_default", ENV["mode_default"])
        self.paper = {"ok": False}
        self.pending: dict | None = None          # the ticket waiting for a yes
        self.watch: dict[str, dict] = {}          # symbols the Entry Timer watches bar by bar
        self.last_result: dict[str, dict] = {}    # per agent, for the Orrery drawer
        self.agent_busy: dict[str, int] = {}
        self.conductor = None                     # set by main
        self.lock = asyncio.Lock()
        self.auto_lock = asyncio.Lock()
        self._last_bar_t = 0
        self._last_alert_check = 0.0
        self._last_auto = None
        self._flat_done = None
        self._summary_done = None
        self._risk_sig = None
        self.last_scan: dict | None = None
        self.bt_reports: dict[str, dict] = {}

    # ================================================================== boot / replay
    def boot(self):
        try:
            self.paper = paper_assertion(self.cfg)
            self.policy.paper_ok = True
            self.audit.append("boot.paper_assertion", ok=True, broker=self.paper["broker"])
        except Exception as e:
            self.audit.append("boot.paper_assertion", ok=False, error=str(e))
            raise

    def start_replay(self, date: str = "2026-11-11", start: str = "09:25", speed: float = 20.0) -> dict:
        info = market.prepare_replay(date)
        h, m = map(int, start.split(":"))
        clock.set_replay(datetime.strptime(date, "%Y-%m-%d").replace(hour=h, minute=m, tzinfo=NY), speed)
        self.db.reset_trading_day()
        for rel in ("watchlist.json", "entry.json", "plan.json", "timemachine.json", "orders.json", "prices.json",
                    "portfolio.json", "alerts.json", "state/risk.json", "state/broker.json", "state/alerts.json",
                    "state/news.json"):
            p = __import__("pathlib").Path("trader") / rel
            if p.exists():
                p.unlink()
        self.exchange.reset(float(self.cfg["budget"]))
        write_trader("portfolio.json", {"cash": float(self.cfg["budget"]), "positions": []})
        self.sentinel.state = "ARMED"
        self.sentinel.consecutive_stops = 0
        self.sentinel.cooldown_until = None
        self.strategist = Strategist()
        self.pending, self.watch, self.last_result = None, {}, {}
        self._flat_done = self._summary_done = None
        self.mode = self.cfg.get("meridian_mode_default", "advise")
        self.audit.append("replay.start", date=date, start=start, speed=speed)
        self.bus.emit("replay.started", {**info, "start": start, "speed": speed}, actor="clock")
        return {**info, "clock": clock.snapshot(self.cfg)}

    def start_live(self):
        clock.set_live()
        self.audit.append("live.start")
        self.bus.emit("replay.started", {"live": True}, actor="clock")

    # ================================================================== helpers
    def ctx(self, origin: str = "user") -> dict:
        return {"mode": self.mode, "kill_state": self.sentinel.state, "limits": self.cfg, "origin": origin,
                "paused_reason": self.sentinel.paused_reason}

    def now_args(self) -> list[str]:
        n = clock.now_arg()
        return ["--now", n] if n else []

    def agent_ping(self, agent: str, tool: str, args: dict | None = None):
        self.bus.emit("agent.start", {"agent": agent, "tool": tool, "args": args or {}}, actor=agent, persist=False)
        self.bus.emit("agent.done", {"agent": agent, "tool": tool, "ok": True, "ms": 1}, actor=agent, persist=False)

    async def skill(self, skill: str, args: list[str], *, tool: str, read_file: str | None = None,
                    timeout: float = 90, quiet: bool = False) -> ToolResult:
        agent = SKILL_TO_AGENT[skill]
        self.agent_busy[agent] = self.agent_busy.get(agent, 0) + 1
        if not quiet:
            self.bus.emit("agent.start", {"agent": agent, "tool": tool, "args": [a for a in args if len(a) < 60]},
                          actor=agent)
        try:
            r = await run_skill(skill, args, timeout=timeout, read_file=read_file)
        finally:
            self.agent_busy[agent] -= 1
        self.sentinel.note_tool(r.status != "error")
        self.db.execute("INSERT INTO tool_calls(ts,tool,args,result_digest,ok,status,ms,decision,origin) "
                        "VALUES(?,?,?,?,?,?,?,?,?)", (clock.now().isoformat(), tool, json.dumps(args), r.digest(),
                                                       int(r.ok), r.status, r.ms, "allow", "desk"))
        self.audit.append("tool", tool=tool, skill=skill, args=args, status=r.status, digest=r.digest(), ms=r.ms)
        self.last_result[agent] = {"tool": tool, "status": r.status, "ms": r.ms, "at": clock.label(),
                                   "data": r.data, "text": (r.text or r.stderr)[-4000:], "files": r.files,
                                   "argv": [a for a in r.argv[2:]]}
        if not quiet:
            self.bus.emit("agent.done", {"agent": agent, "tool": tool, "ok": r.ok, "status": r.status, "ms": r.ms,
                                         "error": r.stderr[-300:] if r.status == "error" else None}, actor=agent)
        return r

    def native(self, agent: str, tool: str, fn, *a, **kw):
        t0 = time.perf_counter()
        self.bus.emit("agent.start", {"agent": agent, "tool": tool}, actor=agent)
        try:
            out = fn(*a, **kw)
            ok = True
            return out
        except Exception:
            ok = False
            raise
        finally:
            ms = int((time.perf_counter() - t0) * 1000)
            self.bus.emit("agent.done", {"agent": agent, "tool": tool, "ok": ok, "ms": ms}, actor=agent)
            if ok:
                self.last_result[agent] = {"tool": tool, "status": "ok", "ms": ms, "at": clock.label(),
                                           "data": out if isinstance(out, (dict, list)) else None}

    def step(self, symbol: str, n: int, status: str, detail: str = ""):
        self.bus.emit("pipeline.step", {"symbol": symbol, "step": n, "name": PIPELINE[n - 1], "status": status,
                                        "detail": detail}, actor="conductor")

    def offline(self) -> dict:
        return market.offline_paths()

    def risk_used(self) -> dict:
        state = read_trader("state/broker.json", {}) or {}
        today = clock.today()
        placed = [o for o in state.get("orders", []) if o.get("date") == today and o.get("status") == "placed"
                  and o.get("kind") == "entry"]
        committed = round(sum(float(o.get("max_loss") or 0) for o in placed), 2)
        return {"committed": committed, "daily_limit": float(self.cfg["max_daily_loss_usd"]),
                "trades_used": len(placed), "max_trades": int(self.cfg["max_trades_per_day"]),
                "max_loss_per_trade": float(self.cfg["max_loss_per_trade_usd"]),
                "pct": round(committed / float(self.cfg["max_daily_loss_usd"]) * 100, 1)}

    def set_mode(self, mode: str, reason: str = "user"):
        if mode not in ("observe", "advise", "autopilot"):
            raise ValueError(mode)
        prev, self.mode = self.mode, mode
        self.audit.append("mode", frm=prev, to=mode, reason=reason)
        self.bus.emit("mode.changed", {"mode": mode, "from": prev, "reason": reason}, actor="policy")

    # ================================================================== worker tools
    async def scan_market(self, mode: str = "orb", symbols: list[str] | None = None, limit: int | None = None,
                          at: str | None = None) -> dict:
        off = self.offline()
        args = [mode, "--json", "--quiet"]
        if off:
            args += ["--offline", off["wall"], "--min-price", "0", "--min-volume", "0"]
            mode = "orb"
            args[0] = "orb"
        elif not symbols:
            # live: scan the NIFTY 100 (the replay universe) unless told otherwise; the full NSE list is ~2,000 names
            symbols = market.symbols() or None
            if not symbols:
                args += ["--limit", str(limit or 200)]
        if symbols:
            args += ["--symbols", ",".join(s.upper() for s in symbols)]
        if at and mode == "orb":
            args += ["--at", at]
        args += self.now_args()
        r = await self.skill("trader-scanner", args, tool="scan_market", read_file="trader/watchlist.json")
        doc = r.data or read_trader("watchlist.json") or {}
        hits = [h for h in doc.get("hits", []) if (h.get("price") or 0) >= 50 and h.get("symbol") != "NIFTY50"]
        hits.sort(key=lambda h: (-(h.get("pct_over") or 0) if (h.get("pct_over") or 0) < 3 else 0, h["symbol"]))
        # rank: confirmed breakouts with meaningful follow-through and liquidity first
        def rank(h):
            p = h.get("pct_over") or 0
            return (0.25 <= p <= 2.0, (h.get("price") or 0) >= 100, p)
        hits.sort(key=rank, reverse=True)
        self.last_scan = {"as_of": doc.get("as_of"), "mode": doc.get("mode", mode), "scanned": doc.get("scanned"),
                          "universe": doc.get("universe"), "count": len(doc.get("hits", [])), "hits": hits[:40],
                          "status": r.status, "error": r.stderr if r.status == "error" else None}
        self.bus.emit("scan.done", {k: self.last_scan[k] for k in ("as_of", "scanned", "count", "status")} |
                      {"top": hits[:8]}, actor="scanner")
        return self.last_scan

    async def get_news(self, tickers: list[str], hours: int = 24) -> dict:
        off = self.offline()
        args = ["--tickers", *[t.upper() for t in tickers], "--hours", str(min(int(hours), 72)), "--json", "--dry-run"]
        args += ["--no-sec"]                       # SEC filings do not apply to NSE issuers
        if off:
            args += ["--offline", off["news"], "--no-moves", "--now", clock.now().isoformat(timespec="seconds")]
        r = await self.skill("trader-news", args, tool="get_news")
        items = (r.data or {}).get("items", []) if isinstance(r.data, dict) else []
        out = []
        for it in items[:12]:
            out.append({"ticker": it.get("ticker"), "title": (it.get("title") or "")[:160].replace("\n", " "),
                        "time": it.get("time"), "tags": it.get("tags", []), "source": it.get("source"),
                        "kind": it.get("kind"), "link": it.get("link")})
        tags = sorted({t for it in out for t in it["tags"]})
        return {"items": out, "tags": tags, "moves": (r.data or {}).get("moves", []) if isinstance(r.data, dict) else [],
                "status": r.status, "error": r.stderr if r.status == "error" else None}

    async def check_entry(self, symbol: str, setup: str = "orb", level: float | None = None,
                          or_minutes: int = 15, write: bool = True) -> dict:
        off = self.offline()
        args = ["check", symbol.upper(), "--setup", setup, "--or-minutes", str(or_minutes), "--json"]
        if write:
            args += ["--write"]
        if level is not None:
            args += ["--level", f"{level:.2f}"]
        if off:
            args += ["--offline", off["charts"]]
        args += self.now_args()
        r = await self.skill("trader-entry", args, tool="check_entry")
        d = r.data if isinstance(r.data, dict) else {}
        return {**d, "_status": r.status, "_error": r.stderr if r.status == "error" else None}

    async def plan_exit(self, stop: str = "or-mid", target: str = "1R", symbol: str | None = None) -> dict:
        off = self.offline()
        args = ["plan", "--stop", stop, "--target", target, "--write", "--json"]
        if off and symbol and stop.startswith("atr"):
            args += ["--offline", f"{off['charts']}/{symbol.upper()}.json.gz"]
        args += self.now_args()
        r = await self.skill("trader-exit", args, tool="plan_exit")
        d = r.data if isinstance(r.data, dict) else {}
        return {**d, "_status": r.status, "_error": r.stderr if r.status == "error" else None}

    async def time_machine(self, symbol: str, seed: int = 19) -> dict:
        off = self.offline()
        args = ["run", "--write", "--json", "--seed", str(seed)]
        if off:
            args += ["--offline", f"{off['tm_dir']}/{symbol.upper()}.json.gz"]   # 60 real NSE sessions
        args += self.now_args()
        r = await self.skill("trader-timemachine", args, tool="time_machine", timeout=120)
        d = r.data if isinstance(r.data, dict) else {}
        if not d:
            return {"verdict": None, "skipped": (r.stderr or "time machine unavailable")[-200:]}
        return d

    async def size_position(self, symbol: str) -> dict:
        market.write_prices([symbol.upper()])
        args = ["--write", "--json", *self.now_args()]
        r = await self.skill("trader-budget", args, tool="size_position")
        d = r.data if isinstance(r.data, dict) else {}
        return {**d, "_status": r.status, "_error": r.stderr if r.status == "error" else None}

    async def risk_check(self) -> dict:
        r = await self.skill("trader-risk", ["--json", *self.now_args()], tool="risk_check",
                             read_file="trader/state/risk.json")
        d = r.data if isinstance(r.data, dict) else {}
        self.bus.emit("risk.update", self.risk_used(), actor="risk")
        return {**d, "_status": r.status, "_error": r.stderr if r.status == "error" else None}

    async def show_ticket(self, index: int | None = None) -> list:
        args = ["show", "--json", *self.now_args()]
        if index:
            args += ["--index", str(index)]
        r = await self.skill("trader-broker", args, tool="show_ticket")
        if isinstance(r.data, dict):
            return [r.data]
        return r.data if isinstance(r.data, list) else []

    async def alerts_add(self, *, from_plan: bool = False, symbol: str | None = None, above: float | None = None,
                         below: float | None = None, at: str | None = None, label: str | None = None) -> dict:
        args = ["add"]
        if from_plan:
            args += ["--from-plan"]
        else:
            if symbol:
                args += ["--symbol", symbol.upper()]
            if above is not None:
                args += ["--above", f"{above:.2f}"]
            elif below is not None:
                args += ["--below", f"{below:.2f}"]
            elif at:
                args += ["--at", at] + (["--label", label] if label else [])
        if clock.mode == "replay":
            args += ["--date", clock.today()] if at and not from_plan else []
        r = await self.skill("trader-alerts", args, tool="alerts_add")
        return {"ok": r.ok, "text": r.text.strip()[:600], "error": r.stderr[-300:] if not r.ok else None}

    async def alerts_check(self) -> dict:
        rules = read_trader("alerts.json")
        if not rules or not rules.get("rules"):
            return {"rang": []}
        syms = sorted({x.get("symbol") for x in rules.get("rules", []) if x.get("symbol")})
        off = self.offline()
        args = ["check", "--json"]
        if off:
            market.write_quote_files(syms)
            args += ["--offline", off["quotes"]]
        args += self.now_args()
        r = await self.skill("trader-alerts", args, tool="alerts_check", quiet=True)
        d = r.data if isinstance(r.data, dict) else {}
        return {"rang": d.get("rings") or [], "data": d}

    async def market_clock(self) -> dict:
        r = await self.skill("trader-alerts", ["clock", "--json", *self.now_args()], tool="market_clock")
        return r.data if isinstance(r.data, dict) else {}

    async def company_facts(self, tickers: list[str]) -> dict:
        off = self.offline()
        args = [*[t.upper() for t in tickers[:5]], "--json", "--quarters", "4"]
        if off:
            args += ["--offline", off["analyst"]]
        r = await self.skill("trader-analyst", args, tool="company_facts", timeout=60)
        out = []
        for row in (r.data or []) if isinstance(r.data, list) else []:
            res = row.get("result") or {}
            q = (res.get("rows") or [])[:4]
            out.append({"ticker": row.get("ticker"), "entity": res.get("entity"), "error": row.get("error"),
                        "quarters": [{k: x.get(k) for k in ("fiscal", "end", "revenue", "net_income", "eps_diluted",
                                      "gross_margin", "operating_margin", "revenue_yoy", "eps_yoy", "form", "filed")}
                                     for x in q], "filings": res.get("filings")})
        return {"companies": out, "status": r.status, "error": r.stderr[-300:] if r.status == "error" else None}

    async def bulk_deals(self, symbol: str | None = None, min_value: float = 0) -> dict:
        """NSE bulk & block deals (the India edition's replacement for the US Congress tracker)."""
        off = self.offline()
        args = ["index", "--json", "--limit", "15"]
        if symbol:
            args += ["--symbol", symbol.upper()]
        if min_value:
            args += ["--min-value", str(min_value)]
        if off:
            args += ["--offline", off["deals"]]
        r = await self.skill("trader-deals", args, tool="bulk_deals", timeout=60)
        return {"deals": r.data if isinstance(r.data, list) else [], "status": r.status,
                "error": r.stderr[-300:] if r.status == "error" else None}

    def pick_strategy(self, symbol: str, scan_hit=None, news_tags=None) -> dict:
        res = self.native("strategist", "pick_strategy", self.strategist.pick, symbol, self.cfg, scan_hit=scan_hit,
                          news_tags=news_tags, committed=self.risk_used()["committed"],
                          recent_stops=self.sentinel.consecutive_stops)
        write_trader("meridian/strategy.json", res)
        self.bus.emit("strategy.chosen", {"symbol": symbol, "chosen": res["chosen"], "reason": res["reason"],
                                          "ranked": [{k: r[k] for k in ("id", "label", "score", "gate", "gate_reason",
                                                      "expectancy_r", "trades")} for r in res["ranked"]]},
                      actor="strategist")
        return res

    def run_backtest(self, symbol: str, strategy: str = "orb", sessions: int = 60) -> dict:
        rep = self.native("backtester", "run_backtest", bt.run_backtest, symbol, strategy, self.cfg, sessions)
        rep["generated_at"] = clock.label()
        self.bt_reports[f"{symbol.upper()}:{strategy}"] = rep
        write_trader("meridian/backtest_report.json", rep)
        self.bus.emit("backtest.ready", {"symbol": symbol.upper(), "strategy": strategy, "verdict": rep.get("verdict"),
                                         "gate": rep.get("gate")}, actor="backtester")
        return rep

    # ================================================================== the trade lifecycle (steps 1-9)
    async def plan_trade(self, symbol: str, *, strategy: str | None = None, qty: int | None = None,
                         origin: str = "user", scan_hit: dict | None = None) -> dict:
        symbol = symbol.upper()
        if self.sentinel.state != "ARMED":
            return {"status": "denied", "reason": f"the desk is {self.sentinel.state.lower()}; re-arm it first"}
        if symbol not in market.symbols() and clock.mode == "replay":
            return {"status": "error", "reason": f"{symbol} is not in the recorded NIFTY 500 universe for this replay"}
        if scan_hit is None and self.last_scan:
            scan_hit = next((h for h in self.last_scan.get("hits") or [] if h["symbol"] == symbol), None)
        async with self.lock:
            self.pending = None
            self.bus.emit("pipeline.start", {"symbol": symbol, "steps": PIPELINE}, actor="conductor")
            self.step(symbol, 1, "done" if scan_hit else "skipped", "from scan" if scan_hit else "direct request")
            # 2 news (+ analyst context)
            self.step(symbol, 2, "running")
            news = await self.get_news([symbol], 12)
            self.step(symbol, 2, "done", f"{len(news['items'])} headlines; tags {', '.join(news['tags']) or 'none'}")
            # 3 strategy
            self.step(symbol, 3, "running")
            strat = self.pick_strategy(symbol, scan_hit, news["tags"])
            chosen = strategy or strat["chosen"]
            if not chosen:
                self.step(symbol, 3, "blocked", strat["reason"])
                story = self.journalist.create("skip", symbol, {"symbol": symbol, "reason": "no strategy passes its gate",
                                               "why": strat["reason"], "checked": "; ".join(
                                                   f"{r['label']}: {r['gate_reason'] or 'ok'}" for r in strat["ranked"])})
                return {"status": "skipped", "reason": strat["reason"], "strategy": strat, "story": story["id"]}
            params = next((r["params"] for r in strat["ranked"] if r["id"] == chosen), bt.STRATEGIES[chosen]["default"])
            self.step(symbol, 3, "done", f"{bt.STRATEGIES[chosen]['label']} (score "
                      f"{next(r['score'] for r in strat['ranked'] if r['id'] == chosen):+.2f})")
            # 4 entry
            self.step(symbol, 4, "running")
            setup, level = ("orb", None)
            if chosen == "level":
                prev = market.sessions_5m(symbol, 1)
                setup, level = "level", (max(b["h"] for b in prev[-1]) if prev else None)
                if level is None:
                    setup = "orb"
            entry = await self.check_entry(symbol, setup=setup, level=level)
            est = entry.get("status")
            if est != "triggered":
                why = entry.get("reason") or entry.get("_error") or "not triggered"
                if est == "waiting" or (entry.get("_status") == "error" and "waiting" in why):
                    self.watch[symbol] = {"setup": setup, "level": level, "strategy": chosen, "since": clock.label(),
                                          "origin": origin}
                    self.step(symbol, 4, "waiting", why)
                    self.bus.emit("watch.added", {"symbol": symbol, "setup": setup, "reason": why}, actor="entry")
                    return {"status": "waiting", "reason": why, "entry": entry, "strategy": strat}
                self.step(symbol, 4, "blocked", why)
                story = self.journalist.create("skip", symbol, {"symbol": symbol, "reason": f"the setup is {est or 'unavailable'}",
                                               "why": why, "checked": f"Entry Timer: {why}"})
                return {"status": "skipped", "reason": why, "entry": entry, "story": story["id"]}
            self.step(symbol, 4, "done", entry.get("reason", "triggered"))
            # 5 plan
            self.step(symbol, 5, "running")
            if chosen == "orb":
                stop_rule = "or-mid" if params.get("stop", "or_mid") == "or_mid" else "or-low"
            elif chosen == "level":
                stop_rule = f"atr:{params.get('atr_k', 1.5)}"
            else:
                stop_rule = "or-low"
            tr = params.get("target_r", 1.0)
            target_rule = f"{tr:g}R"
            plan = await self.plan_exit(stop_rule, target_rule, symbol)
            if not plan.get("stop"):
                self.step(symbol, 5, "error", plan.get("_error") or "no plan")
                return {"status": "error", "reason": plan.get("_error") or "exit planner failed"}
            self.step(symbol, 5, "done", f"stop {plan['stop']} / target {plan['target']}")
            # 6 test: Time Machine + Backtester evidence
            self.step(symbol, 6, "running")
            tm = await self.time_machine(symbol)
            bt_rep = self.strategist.evidence(symbol, chosen, self.cfg)
            self.bt_reports[f"{symbol}:{chosen}"] = bt_rep
            tm_v = tm.get("verdict") or tm.get("skipped")
            self.step(symbol, 6, "done", f"Time Machine: {tm_v}")
            if tm.get("mc"):
                self.bus.emit("timemachine.ready", {"symbol": symbol, "mc": {k: tm["mc"].get(k) for k in
                              ("p_target", "p_stop", "p_neither", "median_close", "avg_R", "replays", "seed")},
                              "verdict": tm.get("verdict"), "history": {k: (tm.get("history") or {}).get(k) for k in
                              ("sessions", "triggered", "target", "stop", "close")}}, actor="timemachine")
            # 7 size
            self.step(symbol, 7, "running")
            sz = await self.size_position(symbol)
            sizing = sz.get("sizing") or {}
            if not sz.get("orders"):
                why = sizing.get("refusal") or sz.get("_error") or "budget refused to size it"
                self.step(symbol, 7, "blocked", why)
                story = self.journalist.create("skip", symbol, {"symbol": symbol, "reason": why})
                return {"status": "skipped", "reason": why, "sizing": sizing, "story": story["id"]}
            if qty and int(qty) != int(sz["orders"][0]["qty"]):
                # a user-specified size: edit the order (this invalidates any earlier PASS) and let Risk judge it
                doc = read_trader("orders.json")
                doc["orders"][0]["qty"] = str(int(qty))
                ml = round(int(qty) * float(sizing.get("risk_per_share", 0)), 2)
                doc["orders"][0]["plan"]["max_loss"] = ml
                doc["orders"][0]["why"] = f"user asked for {int(qty)} shares (sizer suggested {sizing.get('qty')})"
                write_trader("orders.json", doc)
                self.audit.append("orders.edited", symbol=symbol, qty=int(qty), by=origin)
            self.step(symbol, 7, "done", f"{sz['orders'][0]['qty'] if not qty else qty} shares, bound by "
                      f"{sizing.get('bound_by')}")
            # 8 gate
            self.step(symbol, 8, "running")
            risk = await self.risk_check()
            res = (risk.get("results") or [{}])[0]
            ticket = (await self.show_ticket(1) or [None])[0]
            bundle = {"symbol": symbol, "strategy": chosen, "strategy_reason": strat["reason"], "entry": entry,
                      "plan": plan, "tm": {k: tm.get(k) for k in ("verdict", "mc", "history") if k in tm} if tm else {},
                      "backtest": {k: bt_rep.get(k) for k in ("verdict", "strategy_stats", "gate")},
                      "sizing": sizing, "risk": res, "news": news["items"][:5], "ticket": ticket}
            if res.get("verdict") != "PASS":
                reasons = res.get("reasons") or [risk.get("_error") or "blocked"]
                self.step(symbol, 8, "blocked", "; ".join(reasons))
                alt = None
                if qty and sizing.get("qty"):
                    alt = f"{sizing['qty']} shares fits the limit."
                story = self.journalist.create("block", symbol, {"symbol": symbol, "qty": qty or sizing.get("qty"),
                                               "plain": (ticket or {}).get("plain"), "reasons": reasons,
                                               "max_loss": res.get("max_loss"), "alternative": alt},
                                               files=["trader/orders.json", "trader/state/risk.json"])
                self.bus.emit("risk.block", {"symbol": symbol, "reasons": reasons, "max_loss": res.get("max_loss"),
                                             "alternative": alt, "story": story["id"]}, actor="risk")
                return {"status": "blocked", "reasons": reasons, "risk": res, "alternative": alt,
                        "suggested_qty": sizing.get("qty"), "story": story["id"], "bundle": bundle}
            n_checks = len(res.get("info", [])) + 1
            self.step(symbol, 8, "done", f"PASS · max loss {inr(res.get('max_loss') or 0)}")
            # 9 ticket ready -> needs a yes (advise) or a mandate (autopilot)
            self.pending = {"index": 1, "symbol": symbol, "ticket": ticket, "risk": res, "plan": plan, "sizing": sizing,
                            "tm": tm, "strategy": chosen, "strategy_detail": strat, "news": news, "bt": bt_rep,
                            "entry": entry, "created": clock.label(), "created_wall": time.time(), "origin": origin,
                            "fingerprint": res.get("fingerprint"), "qty": int(ticket["tool_input"]["qty"]) if ticket else None,
                            "bundle": bundle, "checks": n_checks}
            self.step(symbol, 9, "waiting", "say \"yes, buy …\" or tap" if self.mode != "autopilot" else "mandate")
            self.bus.emit("ticket.ready", self.ticket_view(), actor="broker")
            return {"status": "ready", "ticket": self.ticket_view()}

    def ticket_view(self) -> dict | None:
        p = self.pending
        if not p:
            return None
        t = p["ticket"] or {}
        tm = p.get("tm") or {}
        mc = tm.get("mc") or {}
        return {"symbol": p["symbol"], "index": p["index"], "plain": t.get("plain"), "tool_input": t.get("tool_input"),
                "fingerprint": p["fingerprint"], "qty": p["qty"], "entry": p["plan"].get("entry"),
                "stop": p["plan"].get("stop"), "target": p["plan"].get("target"),
                "risk_per_share": p["plan"].get("risk_per_share"), "max_loss": p["risk"].get("max_loss"),
                "reward_risk": p["risk"].get("reward_risk"), "value": p["risk"].get("value_usd"),
                "strategy": p["strategy"], "strategy_label": bt.STRATEGIES[p["strategy"]]["label"],
                "tm_verdict": tm.get("verdict") or tm.get("skipped"),
                "odds": {"target": mc.get("p_target"), "stop": mc.get("p_stop"), "open": mc.get("p_neither")},
                "bt_verdict": (p.get("bt") or {}).get("verdict"), "risk_info": p["risk"].get("info", []),
                "sizing_limits": p["sizing"].get("limits", []), "bound_by": p["sizing"].get("bound_by"),
                "flat_by": p["plan"].get("flat_by"), "created": p["created"], "mode": self.mode,
                "say": f"yes, buy {p['qty']} {p['symbol']}",
                "window_s": self.cfg.get("meridian_voice", {}).get("confirm_window_s", 30)}

    # ================================================================== execution (step 9-10)
    async def approve(self, reply: str, *, origin: str = "user", user_yes: bool = True) -> dict:
        p = self.pending
        if not p:
            return {"ok": False, "reason": "there is no ticket waiting for approval"}
        args = {"symbol": p["symbol"], "side": "buy", "strategy": p["strategy"], "max_loss": p["risk"].get("max_loss"),
                "user_yes": user_yes, "fingerprint": p["fingerprint"]}
        d = self.policy.authorize("approve_order", args, self.ctx(origin))
        self.bus.emit("policy.decision", {"tool": "approve_order", **d.to_dict()}, actor="policy")
        if not d.allowed:
            return {"ok": False, "reason": d.reason, "decision": d.verdict}
        # price drift guard: if the plan is old, re-run size + risk on a fresh price (fingerprint must still match)
        r = await self.skill("trader-broker", ["approve", "--index", str(p["index"]), "--reply", reply,
                                               *self.now_args()], tool="approve_order")
        if r.code != 0:
            why = (r.text or r.stderr).strip().splitlines()[0] if (r.text or r.stderr).strip() else "not recorded"
            return {"ok": False, "reason": why, "repo_rejected": True}
        self.step(p["symbol"], 9, "done", f"approved: \"{reply}\"")
        mandate_id = d.args.get("mandate_id")
        try:
            placed = self.native("exchange", "place_stock_order", self.exchange.place_stock_order, p["ticket"]["tool_input"],
                                 fingerprint=p["fingerprint"], mandate_id=mandate_id,
                                 meta={"max_loss": p["risk"].get("max_loss"), "setup": p["strategy"]})
        except ExchangeError as e:
            await self.skill("trader-broker", ["result", "--index", str(p["index"]), "--status", "failed", "--note",
                                               str(e), *self.now_args()], tool="ticket_result")
            self.step(p["symbol"], 10, "error", str(e))
            return {"ok": False, "reason": f"exchange rejected it: {e}"}
        fill = placed["fill"]
        await self.skill("trader-broker", ["result", "--index", str(p["index"]), "--status", "placed", "--broker-id",
                                           placed["order"]["id"], "--filled-qty", str(int(fill["qty"])),
                                           "--filled-price", f"{fill['price']:.2f}", *self.now_args()],
                         tool="ticket_result")
        if mandate_id:
            self.mandates.use(mandate_id)
        self.step(p["symbol"], 10, "done", f"filled {int(fill['qty'])} @ {fill['price']:.2f}")
        alerts = await self.alerts_add(from_plan=True)
        tmv = (p.get("tm") or {}).get("verdict") or (p.get("tm") or {}).get("skipped") or "n/a"
        ev = {"qty": int(fill["qty"]), "symbol": p["symbol"], "entry": p["plan"]["entry"], "fill_price": fill["price"],
              "date": clock.today(), "time": clock.hhmm(), "setup": p["strategy"],
              "setup_label": bt.STRATEGIES[p["strategy"]]["label"], "stop": p["plan"]["stop"],
              "stop_label": p["plan"].get("stop_label"), "target": p["plan"]["target"],
              "target_label": p["plan"].get("target_label"), "flat_by": p["plan"].get("flat_by", "15:55"),
              "max_loss": p["risk"].get("max_loss"), "max_loss_limit": float(self.cfg["max_loss_per_trade_usd"]),
              "rr": p["risk"].get("reward_risk"), "news_summary": (", ".join(p["news"]["tags"]) or "no tagged headlines")
              + f" ({len(p['news']['items'])} headlines)", "tm_verdict": tmv,
              "bt_verdict": (p.get("bt") or {}).get("verdict"), "risk_passed": f"PASS ({p['checks']} checks)",
              "mode": self.mode, "mandate_id": mandate_id, "strategy_reason": p["strategy_detail"]["reason"],
              "reply": reply, "fingerprint": p["fingerprint"], "order_id": placed["order"]["id"]}
        story = self.journalist.create("trade", p["symbol"], ev, files=["trader/plan.json", "trader/orders.json",
                                       "trader/state/risk.json", "trader/state/broker.json", "trader/timemachine.json"])
        self.db.execute("UPDATE positions SET story_id=? WHERE symbol=?", (story["id"], p["symbol"]))
        self.bus.emit("order.update", {"order": placed["order"], "fill": fill, "story": story["id"]}, actor="exchange")
        self.bus.emit("risk.update", self.risk_used(), actor="risk")
        self.pending = None
        self.watch.pop(p["symbol"], None)
        return {"ok": True, "fill": fill, "order": placed["order"], "story": story["id"], "alerts": alerts,
                "mandate_id": mandate_id}

    async def decline(self, reply: str = "no") -> dict:
        p = self.pending
        if not p:
            return {"ok": False, "reason": "nothing to decline"}
        await self.skill("trader-broker", ["decline", "--index", str(p["index"]), "--reply", reply or "no",
                                           *self.now_args()], tool="decline_order")
        story = self.journalist.create("skip", p["symbol"], {"symbol": p["symbol"], "reason": "you declined the ticket",
                                       "why": f"Reply: \"{reply}\". Ticket: {p['ticket'].get('plain')}"})
        self.step(p["symbol"], 9, "blocked", "declined")
        self.pending = None
        self.bus.emit("ticket.cleared", {"symbol": p["symbol"], "why": "declined"}, actor="broker")
        return {"ok": True, "story": story["id"]}

    async def flatten(self, symbol: str, reason: str = "user") -> dict:
        """Close a position through the repo's flatten ticket path (ticket -> risk -> yes -> exchange)."""
        symbol = symbol.upper()
        pos = self.exchange.position(symbol)
        if not pos:
            return {"ok": False, "reason": f"no open {symbol} position"}
        r = await self.skill("trader-broker", ["flatten", "--symbol", symbol, "--qty", str(int(pos["qty"])),
                                               *self.now_args()], tool="flatten")
        market.write_prices([symbol])
        await self.risk_check()
        ap = await self.skill("trader-broker", ["approve", "--index", "1", "--reply",
                                                f"yes, sell {int(pos['qty'])} {symbol}", *self.now_args()],
                              tool="approve_order")
        try:
            placed = self.exchange.flatten(symbol, reason=reason)
        except ExchangeError as e:
            return {"ok": False, "reason": str(e)}
        if placed and ap.code == 0:
            f = placed["fill"]
            await self.skill("trader-broker", ["result", "--index", "1", "--status", "placed", "--broker-id",
                                               placed["order"]["id"], "--note", reason, *self.now_args()],
                             tool="ticket_result", quiet=True)
            _ = f
        return {"ok": True, "fill": placed["fill"] if placed else None, "repo_ticket": r.ok}

    # ================================================================== exchange callbacks
    def _on_fill(self, fill: dict):
        if fill.get("side") != "sell":
            return
        asyncio.ensure_future(self._after_exit(fill))

    async def _after_exit(self, fill: dict):
        sym, leg = fill["symbol"], fill.get("leg")
        await self.skill("trader-broker", ["fill", "--symbol", sym, "--side", "sell", "--qty", str(int(fill["qty"])),
                                           "--price", f"{fill['price']:.2f}", *self.now_args()], tool="record_fill",
                         quiet=True)
        self.bus.emit("order.update", {"fill": fill, "order": fill.get("order")}, actor="exchange")
        pnl, r = fill.get("pnl", 0.0), fill.get("r")
        words = {"stop": "The stop filled", "target": "The target filled", "flatten": "Flattened at market",
                 "halt": "Flattened by the kill switch", "flat_by": "Flattened by the 15:55 rule"}
        lesson = {"stop": "the rule capped the loss where the plan said it would",
                  "target": "the plan's target was hit before the stop",
                  "flat_by": "the session ended before either level"}.get(fill.get("reason") or leg,
                                                                          "the position was closed on instruction")
        self.journalist.close_trade(fill.get("story_id"), f"{words.get(fill.get('reason') or leg, 'Closed')}: sold "
                                    f"{int(fill['qty'])} {sym} at {fill['price']:.2f}.", pnl, r, lesson)
        self.sentinel.note_exit(leg)
        dem = self.strategist.after_exit(leg, self.sentinel.consecutive_stops)
        if dem:
            self.bus.emit("strategy.demoted", {"strategy": dem, "reason": self.strategist.demoted[dem]}, actor="strategist")
        self.bus.emit("risk.update", self.risk_used(), actor="risk")
        if self.conductor and leg in ("stop", "target"):
            await self.conductor.say(f"{sym} {'hit the target' if leg == 'target' else 'stopped out'} at "
                                     f"{fill['price']:.2f}. P&L {inr(pnl)}" + (f", {r:+.2f}R." if r is not None else "."),
                                     kind="alert")

    async def on_halt(self, summary: dict, flattened: list):
        for f in flattened:
            fill = f["fill"]
            fill["reason"] = "halt"
        story = self.journalist.create("halt", None, {**summary, "time": clock.hhmm()})
        self.pending = None
        self.watch.clear()
        self.bus.emit("ticket.cleared", {"why": "halted"}, actor="sentinel")
        if self.conductor:
            await self.conductor.say("Stopped. Orders cancelled, positions flat, autopilot off. I've written up what "
                                     "happened.", kind="risk", force=True)
        return story

    # ================================================================== limits
    def tighten(self, changes: dict, origin: str = "voice") -> dict:
        d = self.policy.authorize("set_limits", changes, self.ctx(origin))
        self.bus.emit("policy.decision", {"tool": "set_limits", **d.to_dict()}, actor="policy")
        if not d.allowed:
            return {"ok": False, "reason": d.reason}
        cfg = read_config()
        before = {k: cfg.get(k) for k in d.args}
        cfg.update(d.args)
        write_config(cfg)
        self.cfg = cfg
        self.audit.append("limits.tightened", before=before, after=d.args, origin=origin)
        self.bus.emit("limits.changed", {"before": before, "after": d.args}, actor="policy")
        self.bus.emit("risk.update", self.risk_used(), actor="risk")
        return {"ok": True, "changed": d.args, "before": before, "note": d.reason if d.verdict == "clamp" else ""}

    # ================================================================== state snapshot
    def state(self) -> dict:
        m = self.mandates.active()
        return {"mode": self.mode, "clock": clock.snapshot(self.cfg), "kill": self.sentinel.snapshot(),
                "paper": self.paper, "limits": {k: self.cfg.get(k) for k in (
                    "budget", "max_loss_per_trade_usd", "max_daily_loss_usd", "max_trades_per_day", "max_orders_per_day",
                    "min_reward_risk", "no_entries_before", "no_entries_after", "flat_by", "max_position_pct",
                    "cash_buffer_pct", "max_order_usd", "require_stop", "allow_options", "allow_margin", "allow_short",
                    "pdt_guard", "meridian_max_drawdown_pct", "meridian_stale_quote_seconds",
                    "meridian_consecutive_stop_pause", "meridian_kill")},
                "risk": self.risk_used(), "account": self.exchange.account(), "positions": self.exchange.positions(),
                "orders": self.exchange.orders("open"), "mandate": m, "ticket": self.ticket_view(),
                "watch": self.watch, "agents": self.agents(), "last_scan": self.last_scan,
                "llm": self.conductor.llm_info() if self.conductor else None,
                "voice": self.conductor.voice_info() if self.conductor else None,
                "replay": {"date": market.date, "synthetic_from": None, "filled_bars": sum(market.filled.values())},
                "market": {"exchange": "NSE", "currency": "INR", "tz": "IST", "index": "NIFTY 50"},
                "names": market.names}

    def agents(self) -> list[dict]:
        out = []
        for aid, label, kind, skill in AGENTS:
            lr = self.last_result.get(aid)
            out.append({"id": aid, "label": label, "kind": kind, "skill": skill, "busy": self.agent_busy.get(aid, 0) > 0,
                        "last": {k: lr.get(k) for k in ("tool", "status", "ms", "at")} if lr else None})
        return out

    # ================================================================== scheduler (every tick)
    async def tick(self):
        now = clock.now()
        self.exchange.on_tick()
        await self.sentinel.check()
        hhmm = now.strftime("%H:%M")
        bars = market.bars("NIFTY50") or (market.bars(market.symbols()[0]) if market.symbols() else [])
        new_bar = bool(bars) and bars[-1]["t"] != self._last_bar_t
        if new_bar:
            self._last_bar_t = bars[-1]["t"]
            self.bus.emit("market.bar", {"t": bars[-1]["t"], "hhmm": hhmm}, actor="clock", persist=False)
        sig = json.dumps(self.risk_used(), sort_keys=True) + json.dumps(self.exchange.account()["equity"])
        if sig != self._risk_sig:
            self._risk_sig = sig
            self.bus.emit("risk.update", self.risk_used(), actor="risk", persist=False)
        # mandate expiry -> back to advise
        if self.mode == "autopilot" and not self.mandates.active():
            self.set_mode("advise", reason="mandate expired")
            if self.conductor:
                await self.conductor.say("The autopilot mandate has ended. Back to advise mode.", kind="status")
        # alerts every ~30 virtual seconds (at most every 2 wall seconds)
        if time.time() - self._last_alert_check > max(2.0, 30 / max(clock.speed, 1)) and self.exchange.positions():
            self._last_alert_check = time.time()
            res = await self.alerts_check()
            for a in res.get("rang") or []:
                self.bus.emit("alert.ring", a if isinstance(a, dict) else {"text": str(a)}, actor="alerts")
        # entry watches: re-check on each new bar
        if new_bar and self.watch and self.sentinel.state == "ARMED" and not self.lock.locked():
            for sym, w in list(self.watch.items()):
                e = await self.check_entry(sym, setup=w["setup"], level=w["level"], write=False)
                if e.get("status") == "triggered":
                    self.watch.pop(sym, None)
                    self.bus.emit("watch.triggered", {"symbol": sym, "reason": e.get("reason")}, actor="entry")
                    res = await self.plan_trade(sym, strategy=w["strategy"], origin="scheduler")
                    if self.conductor:
                        await self.conductor.on_pipeline_result(sym, res, origin="scheduler")
                elif e.get("status") == "expired":
                    self.watch.pop(sym, None)
                    self.journalist.create("skip", sym, {"symbol": sym, "reason": "the setup expired",
                                                         "why": e.get("reason", "")})
        # flat-by
        fb = self.cfg.get("flat_by", "15:55")
        if hhmm >= fb and self._flat_done != clock.today() and "09:15" <= hhmm < "15:35":
            self._flat_done = clock.today()
            for pnow in self.exchange.positions():
                await self.flatten(pnow["symbol"], reason="flat_by")
            if self.pending:
                self.pending = None
                self.bus.emit("ticket.cleared", {"why": "flat-by"}, actor="broker")
        # end-of-day summary
        if hhmm >= "15:30" and self._summary_done != clock.today():
            self._summary_done = clock.today()
            await self.day_summary()
            if clock.mode == "replay":
                clock.pause(True)
                self.bus.emit("replay.ended", {"date": clock.today()}, actor="clock")
        # autopilot loop: under an active mandate, scan -> plan -> approve (each order still needs a Risk PASS)
        if (self.mode == "autopilot" and self.sentinel.state == "ARMED" and not self.sentinel.paused_reason
                and clock.phase(self.cfg) == "entry_window" and not self.auto_lock.locked() and not self.lock.locked()):
            slot = now.strftime("%H") + str(now.minute // 15)
            if slot != self._last_auto:
                self._last_auto = slot
                asyncio.ensure_future(self.autopilot_cycle())

    async def autopilot_cycle(self):
        async with self.auto_lock:
            m = self.mandates.active()
            if not m or self.exchange.positions() or self.pending:
                return
            self.bus.emit("autopilot.cycle", {"mandate": m["id"], "used": m["used"], "max": m["max_trades"]},
                          actor="conductor")
            scan = await self.scan_market("orb")
            syms = m["scope"]["symbols"]
            hits = [h for h in scan["hits"] if syms == "any" or h["symbol"] in syms]
            for h in hits[:3]:
                if h["symbol"] in self.strategist.demoted:
                    continue
                res = await self.plan_trade(h["symbol"], origin="scheduler", scan_hit=h)
                if res["status"] == "ready":
                    t = res["ticket"]
                    out = await self.approve(f"yes, buy {t['qty']} {t['symbol']}", origin="scheduler", user_yes=False)
                    if self.conductor:
                        await self.conductor.on_autopilot(t, out)
                    return
                if self.conductor and res["status"] == "blocked":
                    await self.conductor.say(f"Autopilot skipped {h['symbol']}: {res['reasons'][0]}.", kind="status")

    async def day_summary(self):
        stories = self.journalist.list(limit=500)
        acct = self.exchange.account()
        ru = self.risk_used()
        ev = {"trades": sum(1 for s in stories if s["kind"] == "trade"), "blocks": sum(1 for s in stories if s["kind"] == "block"),
              "skips": sum(1 for s in stories if s["kind"] == "skip"), "pnl": acct["day_pnl"], "equity": acct["equity"],
              "committed": ru["committed"], "limit": ru["daily_limit"]}
        self.journalist.create("summary", None, ev, rewrite=False)


_ = (timedelta, ENV)
