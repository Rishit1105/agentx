"""Sentinel: the kill-switch state machine and live circuit breakers. Works without the Conductor or the LLM.

ARMED -> HALTING -> LOCKED -> (UI re-arm + typed reason, after cool-down) -> ARMED
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta

from ..clock import clock


class Sentinel:
    def __init__(self, app):
        self.app = app  # the Desk (has db, bus, audit, exchange, mandates, config)
        self.state = "ARMED"
        self.locked_at: datetime | None = None
        self.last_trigger: dict | None = None
        self.paused_reason: str | None = None
        self.tool_errors = 0
        self.consecutive_stops = 0
        self.cooldown_until: datetime | None = None
        self.breakers: dict[str, dict] = {}

    # ------------------------------------------------------------ kill
    async def halt(self, trigger: str, actor: str = "user", detail: dict | None = None) -> dict:
        if self.state in ("HALTING", "LOCKED"):
            return {"state": self.state, "already": True}
        t0 = time.perf_counter()
        app = self.app
        prev = self.state
        self._set("HALTING", trigger, actor, detail)
        cancelled = app.exchange.cancel_all("kill switch")
        flattened = app.exchange.flatten_all("halt")
        revoked = app.mandates.revoke("revoked by halt")
        if app.mode == "autopilot":
            app.set_mode("advise", reason="halt")
        ms = int((time.perf_counter() - t0) * 1000)
        self.locked_at = clock.now()
        self._set("LOCKED", trigger, actor, {**(detail or {}), "cancelled": cancelled,
                                              "flattened": len(flattened), "ms": ms})
        summary = {"trigger": trigger, "actor": actor, "cancelled": cancelled,
                   "flattened": [f["fill"]["symbol"] for f in flattened], "mandate_revoked": bool(revoked),
                   "ms": ms, "from": prev}
        self.last_trigger = summary
        app.audit.append("kill", **summary)
        await app.on_halt(summary, flattened)
        return {"state": self.state, **summary}

    def _set(self, state: str, trigger: str, actor: str, detail: dict | None):
        prev, self.state = self.state, state
        self.app.db.execute("INSERT INTO kill_events(ts,trig,actor,state_from,state_to,detail) VALUES(?,?,?,?,?,?)",
                            (clock.now().isoformat(), trigger, actor, prev, state, json.dumps(detail or {}, default=str)))
        self.app.bus.emit("kill.state", {"state": state, "trigger": trigger, "actor": actor,
                                         "detail": detail or {}}, actor="sentinel")

    def cooldown_left(self) -> int:
        if self.state != "LOCKED" or not self.locked_at:
            return 0
        mins = self.app.cfg.get("meridian_kill", {}).get("cooldown_minutes", 15)
        left = (self.locked_at + timedelta(minutes=mins) - clock.now()).total_seconds()
        return max(0, int(left))

    def rearm(self, reason: str, actor: str = "user") -> dict:
        if self.state != "LOCKED":
            return {"ok": False, "why": f"state is {self.state}"}
        if not reason or len(reason.strip()) < 8:
            return {"ok": False, "why": "type a reason (8+ characters) to re-arm"}
        left = self.cooldown_left()
        if left > 0:
            return {"ok": False, "why": f"cool-down: {left // 60}m {left % 60}s left", "cooldown_s": left}
        self._set("RE-ARMED", "rearm", actor, {"reason": reason})
        self.app.audit.append("rearm", reason=reason, actor=actor)
        self._set("ARMED", "rearm", actor, {"reason": reason})
        self.tool_errors = 0
        return {"ok": True, "state": self.state}

    # ------------------------------------------------------------ breakers (called every tick)
    async def check(self):
        app = self.app
        cfg = app.cfg
        if self.state != "ARMED":
            return
        acct = app.exchange.account()
        committed = app.risk_used()
        live_loss = max(0.0, -(acct["realized"] + acct["unrealized"]))
        limit = float(cfg["max_daily_loss_usd"])
        dd_lim = float(cfg.get("meridian_max_drawdown_pct", 2.5))
        self.breakers = {
            "daily_loss": {"value": round(live_loss, 2), "limit": limit, "tripped": live_loss >= limit},
            "drawdown": {"value": acct["drawdown_pct"], "limit": dd_lim, "tripped": acct["drawdown_pct"] >= dd_lim},
            "tool_errors": {"value": self.tool_errors, "limit": 5, "tripped": self.tool_errors >= 5},
            "committed": {"value": committed["committed"], "limit": limit, "tripped": False},
            "stale_data": {"value": self._quote_age(), "limit": cfg.get("meridian_stale_quote_seconds", 120),
                           "tripped": False},
        }
        stale = self.breakers["stale_data"]
        stale["tripped"] = stale["value"] is not None and stale["value"] > stale["limit"]
        pause = None
        if stale["tripped"]:
            pause = f"quotes are {int(stale['value'])}s old"
        if self.cooldown_until and clock.now() < self.cooldown_until:
            pause = f"cool-down after {cfg['meridian_consecutive_stop_pause']['stops']} stops in a row"
        if pause != self.paused_reason:
            self.paused_reason = pause
            app.bus.emit("sentinel.pause", {"paused": bool(pause), "reason": pause}, actor="sentinel")
        for name in ("daily_loss", "drawdown", "tool_errors"):
            if self.breakers[name]["tripped"]:
                await self.halt(f"auto:{name}", actor="sentinel", detail=self.breakers[name])
                return

    def _quote_age(self):
        if clock.mode == "replay":
            return 0
        ages = []
        for p in self.app.exchange.positions():
            t = self.app.market.quote_time(p["symbol"])
            if t:
                ages.append(time.time() - t)
        return max(ages) if ages else None

    def note_tool(self, ok: bool):
        self.tool_errors = 0 if ok else self.tool_errors + 1

    def note_exit(self, leg: str):
        if leg == "stop":
            self.consecutive_stops += 1
            rule = self.app.cfg.get("meridian_consecutive_stop_pause", {"stops": 2, "minutes": 30})
            if self.consecutive_stops >= rule["stops"]:
                self.cooldown_until = clock.now() + timedelta(minutes=rule["minutes"])
                self.app.bus.emit("sentinel.pause", {"paused": True, "reason": f"{self.consecutive_stops} stops in a row: "
                                  f"{rule['minutes']}-minute cool-down"}, actor="sentinel")
        elif leg == "target":
            self.consecutive_stops = 0

    def snapshot(self) -> dict:
        return {"state": self.state, "cooldown_s": self.cooldown_left(), "paused": self.paused_reason,
                "breakers": self.breakers, "last": self.last_trigger, "consecutive_stops": self.consecutive_stops}
