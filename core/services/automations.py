"""Automations: "when <trigger>, do <action>" rules that run on the virtual clock.

Every rule is evaluated on the desk tick. Actions reuse the same desk / Conductor paths a human would use, so nothing
here can place an order on its own: a "plan" action produces a ticket that still needs a spoken "yes" (or an active
autopilot Mandate), and every ticket still passes the Risk gate. Safety-tightening actions (halt, flatten) are allowed.

Triggers                                    Actions
  time      at "HH:MM", once a session        say        speak a message (supports {equity} {day_pnl} {risk_pct} ...)
  every     every N minutes in market hours   briefing   the Conductor's market briefing
  price     SYMBOL above / below a price      scan       scan; then notify | watch the top hit | plan the top hit
  day_pnl   day P&L at or below ₹X            watch      add a symbol to the Entry Timer watch list
  risk_used committed max-loss ≥ X % of limit plan       plan a trade on a symbol (needs your yes)
  scan_hits a scan finds ≥ N breakouts        flatten    close one symbol, or all positions
                                              halt       the kill switch
                                              summary    speak the day's P&L, trades and risk used
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any

from ..clock import clock

TRIGGERS = {"time", "every", "price", "day_pnl", "risk_used", "scan_hits"}
ACTIONS = {"say", "briefing", "scan", "watch", "plan", "flatten", "halt", "summary"}
ENTRY_ACTIONS = {"scan", "watch", "plan"}       # need an armed desk
MARKET_OPEN, MARKET_CLOSE = "09:15", "15:30"

SCHEMA = """
CREATE TABLE IF NOT EXISTS automations(id TEXT PRIMARY KEY, created_ts TEXT, name TEXT, enabled INTEGER,
    trigger TEXT, action TEXT, cooldown_min INTEGER, fires INTEGER, last_fired TEXT, last_result TEXT,
    template TEXT);
CREATE TABLE IF NOT EXISTS automation_runs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, vclock TEXT,
    automation_id TEXT, name TEXT, trigger TEXT, action TEXT, ok INTEGER, detail TEXT);
"""

# Ready-made rules the UI offers as one-click templates.
TEMPLATES: list[dict] = [
    {"key": "opening_bell", "name": "Opening-bell briefing", "icon": "sunrise",
     "blurb": "At 09:16 the Conductor reads the market clock, budget and headlines aloud.",
     "trigger": {"type": "time", "at": "09:16"}, "action": {"type": "briefing"}, "cooldown_min": 0},
    {"key": "breakout_radar", "name": "Breakout radar", "icon": "radar",
     "blurb": "Every 15 minutes, scan the NIFTY 500 and put the cleanest breakout on the Entry Timer's watch list.",
     "trigger": {"type": "every", "minutes": 15}, "action": {"type": "scan", "then": "watch"}, "cooldown_min": 0},
    {"key": "loss_guard", "name": "Soft loss guard", "icon": "shield",
     "blurb": "Halt the desk if the day's P&L falls to −₹5,000, before the hard ₹7,500 limit is reached.",
     "trigger": {"type": "day_pnl", "op": "below", "value": -5000}, "action": {"type": "halt"}, "cooldown_min": 0},
    {"key": "risk_budget", "name": "Risk budget warning", "icon": "gauge",
     "blurb": "Speak up once 80 % of the daily max-loss budget is committed.",
     "trigger": {"type": "risk_used", "pct": 80},
     "action": {"type": "say", "text": "Heads up: {risk_pct}% of today's risk budget is committed."}, "cooldown_min": 60},
    {"key": "price_alert", "name": "Price alert · Reliance", "icon": "bell",
     "blurb": "Tell me when RELIANCE trades above ₹1,500.",
     "trigger": {"type": "price", "symbol": "RELIANCE", "op": "above", "price": 1500},
     "action": {"type": "say", "text": "{symbol} is at {price}, above your {level} alert."}, "cooldown_min": 30},
    {"key": "momentum_plan", "name": "Momentum day planner", "icon": "zap",
     "blurb": "When a scan finds 20 or more breakouts, plan the best one. You still say yes before anything is placed.",
     "trigger": {"type": "scan_hits", "min": 20}, "action": {"type": "scan", "then": "plan"}, "cooldown_min": 45},
    {"key": "pre_close", "name": "Pre-close wrap-up", "icon": "moon",
     "blurb": "At 15:00, speak the day's P&L, trades and risk used, fifteen minutes before flat-by.",
     "trigger": {"type": "time", "at": "15:00"}, "action": {"type": "summary"}, "cooldown_min": 0},
]


class AutomationError(ValueError):
    pass


def _hhmm_ok(s: Any) -> bool:
    try:
        h, m = str(s).split(":")
        return 0 <= int(h) < 24 and 0 <= int(m) < 60 and len(m) == 2
    except Exception:
        return False


def validate(trigger: dict, action: dict) -> tuple[dict, dict]:
    """Normalise and check a rule. Raises AutomationError with a plain-English reason."""
    if not isinstance(trigger, dict) or trigger.get("type") not in TRIGGERS:
        raise AutomationError(f"trigger type must be one of {sorted(TRIGGERS)}")
    if not isinstance(action, dict) or action.get("type") not in ACTIONS:
        raise AutomationError(f"action type must be one of {sorted(ACTIONS)}")
    t = {"type": trigger["type"]}
    if t["type"] == "time":
        if not _hhmm_ok(trigger.get("at")):
            raise AutomationError("time trigger needs at: \"HH:MM\"")
        t["at"] = trigger["at"]
    elif t["type"] == "every":
        mins = int(trigger.get("minutes") or 0)
        if not 5 <= mins <= 240:
            raise AutomationError("every-N-minutes must be between 5 and 240")
        t["minutes"] = mins
    elif t["type"] == "price":
        sym, op, px = str(trigger.get("symbol") or "").upper().strip(), trigger.get("op"), trigger.get("price")
        if not sym or op not in ("above", "below") or not isinstance(px, (int, float)) or px <= 0:
            raise AutomationError("price trigger needs symbol, op above|below and a positive price")
        t.update(symbol=sym, op=op, price=float(px))
    elif t["type"] == "day_pnl":
        v = trigger.get("value")
        if not isinstance(v, (int, float)) or v >= 0:
            raise AutomationError("day P&L trigger needs a negative rupee value, e.g. -5000")
        t.update(op="below", value=float(v))
    elif t["type"] == "risk_used":
        pct = trigger.get("pct")
        if not isinstance(pct, (int, float)) or not 1 <= pct <= 100:
            raise AutomationError("risk-used trigger needs pct between 1 and 100")
        t["pct"] = float(pct)
    elif t["type"] == "scan_hits":
        n = int(trigger.get("min") or 0)
        if n < 1:
            raise AutomationError("scan-hits trigger needs min ≥ 1")
        t["min"] = n

    a = {"type": action["type"]}
    if a["type"] == "say":
        text = str(action.get("text") or "").strip()
        if not text or len(text) > 240:
            raise AutomationError("say needs a message of up to 240 characters")
        a["text"] = text
    elif a["type"] == "scan":
        then = action.get("then") or "notify"
        if then not in ("notify", "watch", "plan"):
            raise AutomationError("scan then must be notify, watch or plan")
        a["then"] = then
    elif a["type"] in ("watch", "plan"):
        sym = str(action.get("symbol") or "").upper().strip()
        if not sym and t["type"] == "price":
            sym = t["symbol"]
        if not sym:
            raise AutomationError(f"{a['type']} needs a symbol")
        a["symbol"] = sym
    elif a["type"] == "flatten":
        a["symbol"] = str(action.get("symbol") or "all").upper().strip() or "ALL"
    return t, a


class Automations:
    def __init__(self, desk):
        self.desk = desk
        self.db = desk.db
        with self.db.lock:
            self.db.conn.executescript(SCHEMA)
        self._busy: set[str] = set()
        self._last_scan_seen: str | None = None
        self._session_marks: dict[str, str] = {}    # id -> session date on which a once-a-day rule fired
        self._latched: set[str] = set()             # edge-triggered rules currently "true" (fire on rising edge)
        self._last_eval = 0.0
        if not self.db.one("SELECT id FROM automations LIMIT 1"):
            self._seed()

    # ------------------------------------------------------------------ storage
    def _seed(self):
        """First boot: install three sensible rules, disabled except the soft loss guard (it only tightens)."""
        for key, on in (("opening_bell", False), ("breakout_radar", False), ("loss_guard", True), ("pre_close", False)):
            tpl = next(t for t in TEMPLATES if t["key"] == key)
            self.create(tpl["name"], tpl["trigger"], tpl["action"], cooldown_min=tpl["cooldown_min"], enabled=on,
                        template=key, emit=False)

    def _row(self, r: dict) -> dict:
        return {"id": r["id"], "name": r["name"], "enabled": bool(r["enabled"]), "trigger": json.loads(r["trigger"]),
                "action": json.loads(r["action"]), "cooldown_min": r["cooldown_min"], "fires": r["fires"],
                "last_fired": r["last_fired"], "last_result": json.loads(r["last_result"]) if r["last_result"] else None,
                "template": r["template"], "created": r["created_ts"], "describe": describe(json.loads(r["trigger"]),
                                                                                          json.loads(r["action"]))}

    def list(self) -> list[dict]:
        return [self._row(r) for r in self.db.query("SELECT * FROM automations ORDER BY created_ts")]

    def get(self, aid: str) -> dict | None:
        r = self.db.one("SELECT * FROM automations WHERE id=?", (aid,))
        return self._row(r) if r else None

    def runs(self, limit: int = 60) -> list[dict]:
        out = self.db.query("SELECT * FROM automation_runs ORDER BY id DESC LIMIT ?", (limit,))
        for r in out:
            r["ok"] = bool(r["ok"])
            r["detail"] = json.loads(r["detail"]) if r["detail"] else None
        return out

    def create(self, name: str, trigger: dict, action: dict, *, cooldown_min: int = 0, enabled: bool = True,
               template: str | None = None, emit: bool = True) -> dict:
        t, a = validate(trigger, action)
        name = (name or "").strip()[:60] or describe(t, a)
        aid = "au_" + uuid.uuid4().hex[:8]
        self.db.execute("INSERT INTO automations VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (aid, clock.now().isoformat(), name, int(bool(enabled)), json.dumps(t), json.dumps(a),
                         max(0, int(cooldown_min or 0)), 0, None, None, template))
        self.desk.audit.append("automation.created", id=aid, name=name, trigger=t, action=a, enabled=bool(enabled))
        if emit:
            self._changed()
        return self.get(aid)

    def update(self, aid: str, patch: dict) -> dict:
        cur = self.get(aid)
        if not cur:
            raise AutomationError("no such automation")
        trig, act = patch.get("trigger", cur["trigger"]), patch.get("action", cur["action"])
        t, a = validate(trig, act)
        name = str(patch.get("name", cur["name"])).strip()[:60] or cur["name"]
        enabled = bool(patch.get("enabled", cur["enabled"]))
        cooldown = max(0, int(patch.get("cooldown_min", cur["cooldown_min"]) or 0))
        self.db.execute("UPDATE automations SET name=?, enabled=?, trigger=?, action=?, cooldown_min=? WHERE id=?",
                        (name, int(enabled), json.dumps(t), json.dumps(a), cooldown, aid))
        if enabled != cur["enabled"]:
            self._latched.discard(aid)
        self.desk.audit.append("automation.updated", id=aid, enabled=enabled, trigger=t, action=a)
        self._changed()
        return self.get(aid)

    def delete(self, aid: str) -> bool:
        cur = self.get(aid)
        if not cur:
            return False
        self.db.execute("DELETE FROM automations WHERE id=?", (aid,))
        self.desk.audit.append("automation.deleted", id=aid, name=cur["name"])
        self._changed()
        return True

    def new_session(self):
        """A fresh replay day: once-a-day rules may fire again; counters start over."""
        self._session_marks.clear()
        self._latched.clear()
        self._last_scan_seen = None
        self.db.execute("UPDATE automations SET fires=0, last_fired=NULL, last_result=NULL")
        self.db.execute("DELETE FROM automation_runs")
        self._changed()

    def _changed(self):
        self.desk.bus.emit("automation.changed", {"automations": self.list()}, actor="automations", persist=False)

    # ------------------------------------------------------------------ evaluation
    def _minutes(self, hhmm: str) -> int:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)

    def _cooling(self, rule: dict) -> bool:
        if not rule["cooldown_min"] or not rule["last_fired"]:
            return False
        last = rule["last_fired"]
        if last[:10] != clock.today():
            return False
        return self._minutes(clock.hhmm()) - self._minutes(last[11:16]) < rule["cooldown_min"]

    def _condition(self, rule: dict, ctx: dict) -> tuple[bool, dict]:
        """(is the trigger true now, facts for the message/log)."""
        t, hhmm = rule["trigger"], ctx["hhmm"]
        if t["type"] == "time":
            return hhmm >= t["at"] and self._session_marks.get(rule["id"]) != clock.today(), {"at": t["at"]}
        if t["type"] == "every":
            if not (MARKET_OPEN <= hhmm < MARKET_CLOSE):
                return False, {}
            slot = (self._minutes(hhmm) - self._minutes(MARKET_OPEN)) // t["minutes"]
            key = f"{clock.today()}#{slot}"
            return self._session_marks.get(rule["id"]) != key, {"slot": key}
        if t["type"] == "price":
            px = self.desk.market.price(t["symbol"])
            if px is None:
                return False, {}
            hit = px > t["price"] if t["op"] == "above" else px < t["price"]
            return hit, {"symbol": t["symbol"], "price": round(px, 2), "level": t["price"]}
        if t["type"] == "day_pnl":
            pnl = ctx["account"]["day_pnl"]
            return pnl <= t["value"], {"day_pnl": pnl, "level": t["value"]}
        if t["type"] == "risk_used":
            return ctx["risk"]["pct"] >= t["pct"], {"risk_pct": ctx["risk"]["pct"], "level": t["pct"]}
        if t["type"] == "scan_hits":
            scan = ctx.get("scan")
            if not scan or scan.get("as_of") == self._last_scan_seen:
                return False, {}
            return (scan.get("count") or 0) >= t["min"], {"hits": scan.get("count"), "level": t["min"]}
        return False, {}

    async def tick(self):
        """Called from Desk.tick. Cheap: rules are evaluated at most every 0.5 s of wall time."""
        if time.time() - self._last_eval < 0.5:
            return
        self._last_eval = time.time()
        rules = [r for r in self.list() if r["enabled"]]
        if not rules:
            return
        ctx = {"hhmm": clock.hhmm(), "account": self.desk.exchange.account(), "risk": self.desk.risk_used(),
               "scan": self.desk.last_scan}
        edge_types = {"price", "day_pnl", "risk_used"}
        for r in rules:
            if r["id"] in self._busy:
                continue
            ok, facts = self._condition(r, ctx)
            if r["trigger"]["type"] in edge_types:       # fire on the rising edge only, re-arm when false again
                if not ok:
                    self._latched.discard(r["id"])
                    continue
                if r["id"] in self._latched:
                    continue
                self._latched.add(r["id"])
            if not ok or self._cooling(r):
                continue
            t = r["trigger"]
            if t["type"] == "time":
                self._session_marks[r["id"]] = clock.today()
            elif t["type"] == "every":
                self._session_marks[r["id"]] = facts["slot"]
            self._busy.add(r["id"])
            asyncio.ensure_future(self._fire(r, facts, ctx))
        if ctx["scan"]:
            self._last_scan_seen = ctx["scan"].get("as_of")

    async def run_now(self, aid: str) -> dict:
        r = self.get(aid)
        if not r:
            raise AutomationError("no such automation")
        ctx = {"hhmm": clock.hhmm(), "account": self.desk.exchange.account(), "risk": self.desk.risk_used(),
               "scan": self.desk.last_scan}
        _, facts = self._condition(r, ctx)
        self._busy.add(aid)
        return await self._fire(r, {**facts, "manual": True}, ctx)

    # ------------------------------------------------------------------ actions
    def _fill(self, text: str, facts: dict, ctx: dict) -> str:
        acct, risk = ctx["account"], ctx["risk"]
        vals = {"equity": f"₹{acct['equity']:,.0f}", "day_pnl": f"₹{acct['day_pnl']:,.0f}", "risk_pct": risk["pct"],
                "trades": risk["trades_used"], "time": ctx["hhmm"], "symbol": facts.get("symbol", ""),
                "price": facts.get("price", ""), "level": facts.get("level", "")}
        try:
            return text.format(**vals)
        except (KeyError, IndexError, ValueError):
            return text

    async def _fire(self, rule: dict, facts: dict, ctx: dict) -> dict:
        a, d, cond = rule["action"], self.desk, self.desk.conductor
        bus = d.bus
        bus.emit("automation.fired", {"id": rule["id"], "name": rule["name"], "trigger": rule["trigger"],
                                      "action": a, "facts": facts}, actor="automations")
        ok, detail = True, {}
        try:
            if a["type"] in ENTRY_ACTIONS and d.sentinel.state != "ARMED":
                ok, detail = False, {"skipped": f"desk is {d.sentinel.state.lower()}"}
            elif a["type"] == "say":
                msg = self._fill(a["text"], facts, ctx)
                if cond:
                    await cond.say(msg, kind="alert")
                detail = {"said": msg}
            elif a["type"] == "briefing":
                out = await cond.handle("good morning", source="automation") if cond else {}
                detail = {"said": out.get("reply")}
            elif a["type"] == "summary":
                acct, risk = d.exchange.account(), d.risk_used()
                msg = (f"Status at {ctx['hhmm']}: day P&L ₹{acct['day_pnl']:,.2f}, {risk['trades_used']} of "
                       f"{risk['max_trades']} trades used, {risk['pct']}% of the daily risk budget committed, "
                       f"{len(d.exchange.positions())} position(s) open.")
                if cond:
                    await cond.say(msg, kind="status")
                detail = {"said": msg}
            elif a["type"] == "scan":
                scan = await d.scan_market("orb")
                hits = scan.get("hits") or []
                detail = {"hits": scan.get("count"), "top": [h["symbol"] for h in hits[:5]]}
                if not hits:
                    detail["note"] = "no breakouts"
                elif a["then"] == "watch":
                    top = next((h for h in hits if h["symbol"] not in d.watch and h["symbol"] not in d.strategist.demoted),
                               None)
                    if top:
                        detail["watching"] = top["symbol"]
                        res = await d.plan_trade(top["symbol"], origin="automation", scan_hit=top)
                        detail["plan"] = res.get("status")
                        if cond:
                            await cond.on_pipeline_result(top["symbol"], res, origin="scheduler")
                elif a["then"] == "plan":
                    if d.pending or d.exchange.positions():
                        detail["note"] = "a ticket or position is already open"
                    else:
                        top = hits[0]
                        res = await d.plan_trade(top["symbol"], origin="automation", scan_hit=top)
                        detail.update(planned=top["symbol"], plan=res.get("status"))
                        if cond:
                            await cond.on_pipeline_result(top["symbol"], res, origin="scheduler")
                elif cond:
                    await cond.say(f"Scan: {scan.get('count')} breakouts. Top: {', '.join(detail['top'][:3])}.",
                                   kind="status")
            elif a["type"] in ("watch", "plan"):
                res = await d.plan_trade(a["symbol"], origin="automation")
                detail = {"symbol": a["symbol"], "plan": res.get("status"), "reason": (res.get("reasons") or [None])[0]}
                if cond:
                    await cond.on_pipeline_result(a["symbol"], res, origin="scheduler")
            elif a["type"] == "flatten":
                syms = [p["symbol"] for p in d.exchange.positions()] if a["symbol"] == "ALL" else [a["symbol"]]
                done = []
                for s in syms:
                    out = await d.flatten(s, reason="automation")
                    if out.get("ok"):
                        done.append(s)
                detail = {"flattened": done}
            elif a["type"] == "halt":
                res = await d.sentinel.halt("automation", actor="automations",
                                            detail={"rule": rule["name"], **{k: v for k, v in facts.items()}})
                if cond:
                    cond.set_state("HALTED")
                detail = {"halted": True, "state": (res or {}).get("state")}
        except Exception as e:   # an automation must never take the desk down
            ok, detail = False, {"error": repr(e)[:200]}
        finally:
            self._busy.discard(rule["id"])
        stamp = clock.now().isoformat()
        result = {"ok": ok, **detail}
        self.db.execute("UPDATE automations SET fires=fires+1, last_fired=?, last_result=? WHERE id=?",
                        (stamp, json.dumps(result, default=str), rule["id"]))
        self.db.execute("INSERT INTO automation_runs(ts,vclock,automation_id,name,trigger,action,ok,detail) "
                        "VALUES(?,?,?,?,?,?,?,?)", (time.strftime("%Y-%m-%dT%H:%M:%S"), stamp, rule["id"], rule["name"],
                                                   json.dumps(rule["trigger"]), json.dumps(a), int(ok),
                                                   json.dumps(result, default=str)))
        self.desk.audit.append("automation.fired", id=rule["id"], name=rule["name"], ok=ok)
        bus.emit("automation.run", {"id": rule["id"], "name": rule["name"], "ok": ok, "detail": result,
                                    "vclock": stamp, "action": a["type"]}, actor="automations")
        self._changed()
        return result


def describe(t: dict, a: dict) -> str:
    """One readable line: 'Every 15 min → scan, watch the top hit'."""
    when = {
        "time": lambda: f"At {t.get('at')}",
        "every": lambda: f"Every {t.get('minutes')} min",
        "price": lambda: f"When {t.get('symbol')} goes {t.get('op')} ₹{t.get('price'):,.2f}",
        "day_pnl": lambda: f"When day P&L ≤ −₹{abs(t.get('value')):,.0f}",
        "risk_used": lambda: f"When ≥{t.get('pct'):.0f}% of risk is used",
        "scan_hits": lambda: f"When a scan finds ≥{t.get('min')} breakouts",
    }[t["type"]]()
    then = {
        "say": lambda: f"say “{a.get('text')}”",
        "briefing": lambda: "give the market briefing",
        "summary": lambda: "speak a status summary",
        "scan": lambda: {"notify": "scan and report", "watch": "scan and watch the top hit",
                         "plan": "scan and plan the top hit"}[a.get("then", "notify")],
        "watch": lambda: f"watch {a.get('symbol')}",
        "plan": lambda: f"plan a trade on {a.get('symbol')}",
        "flatten": lambda: "flatten all positions" if a.get("symbol") in ("ALL", None) else f"flatten {a.get('symbol')}",
        "halt": lambda: "halt the desk",
    }[a["type"]]()
    return f"{when} → {then}"
