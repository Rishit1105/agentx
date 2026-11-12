"""Tilt guard: spots revenge trading and loss-chasing before the order, not in the journal afterwards.

Trading journals flag tilt after the fact. Meridian enforces it at the moment of the next entry. Each plan is checked
against the session's own record:

  revenge re-entry    the same stock within 30 min of losing on it, or any entry within 10 min of a stop-out
  size escalation     planned risk more than 1.5x the session's average risk per trade
  loss chasing        the day is already down more than half the daily loss limit
  losing streak       two or more losing trades in a row (the Sentinel also pauses after two stops)

Severity: one signal warns (the ticket carries the warning and the Conductor says it); a revenge re-entry or two signals
together start a cool-down during which new entries are refused. Exits are never blocked.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from ..adapter.skill import read_trader
from ..clock import clock

REVENGE_SAME_SYMBOL_MIN = 30
REVENGE_AFTER_STOP_MIN = 10
SIZE_JUMP = 1.5
CHASE_FRACTION = 0.5
COOLDOWN_MIN = 15


def _ts(s: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(s) if s else None
    except ValueError:
        return None


class TiltGuard:
    def __init__(self, desk):
        self.desk = desk
        self.cooldown_until: datetime | None = None
        self.cooldown_reason: str | None = None
        self.events: list[dict] = []          # every assessment that found something, for the UI and the scorecard

    def reset(self):
        self.cooldown_until, self.cooldown_reason, self.events = None, None, []

    # ------------------------------------------------------------------ state
    def cooling(self) -> int:
        """Seconds of tilt cool-down left (virtual clock)."""
        if not self.cooldown_until:
            return 0
        left = (self.cooldown_until - clock.now()).total_seconds()
        if left <= 0:
            self.cooldown_until, self.cooldown_reason = None, None
            return 0
        return int(left)

    def snapshot(self) -> dict:
        return {"cooldown_s": self.cooling(), "reason": self.cooldown_reason, "events": self.events[-12:],
                "rules": {"revenge_same_symbol_min": REVENGE_SAME_SYMBOL_MIN, "revenge_after_stop_min": REVENGE_AFTER_STOP_MIN,
                          "size_jump": SIZE_JUMP, "chase_fraction": CHASE_FRACTION, "cooldown_min": COOLDOWN_MIN}}

    # ------------------------------------------------------------------ evidence
    def _closed(self) -> list[dict]:
        from .review import trades
        return trades(self.desk)

    def _session_risks(self) -> list[float]:
        state = read_trader("state/broker.json", {}) or {}
        today = clock.today()
        return [float(o.get("max_loss") or 0) for o in state.get("orders", [])
                if o.get("date") == today and o.get("status") == "placed" and o.get("kind") == "entry" and o.get("max_loss")]

    # ------------------------------------------------------------------ the check
    def assess(self, symbol: str, planned_risk: float | None) -> dict:
        now = clock.now()
        sym = symbol.upper()
        signals: list[dict] = []
        closed = self._closed()

        losses_on_sym = [t for t in closed if t["symbol"] == sym and t["net"] < 0]
        if losses_on_sym:
            last = losses_on_sym[-1]
            ago = (now - _ts(last["exit_ts"])).total_seconds() / 60 if _ts(last["exit_ts"]) else None
            if ago is not None and ago < REVENGE_SAME_SYMBOL_MIN:
                signals.append({"kind": "revenge", "severe": True,
                                "text": f"you lost on {sym} {ago:.0f} min ago; this looks like trying to win it back"})
        stops = [t for t in closed if t["exit_leg"] == "stop"]
        if stops and not any(s["kind"] == "revenge" for s in signals):
            ago = (now - _ts(stops[-1]["exit_ts"])).total_seconds() / 60 if _ts(stops[-1]["exit_ts"]) else None
            if ago is not None and ago < REVENGE_AFTER_STOP_MIN:
                signals.append({"kind": "revenge", "severe": True,
                                "text": f"a stop filled {ago:.0f} min ago ({stops[-1]['symbol']}); entering this fast after a stop is "
                                        f"the classic revenge pattern"})

        streak = 0
        for t in reversed(closed):
            if t["net"] < 0:
                streak += 1
            else:
                break
        if streak >= 2:
            signals.append({"kind": "streak", "severe": False, "text": f"{streak} losing trades in a row"})

        risks = self._session_risks()
        if planned_risk and risks:
            avg = sum(risks) / len(risks)
            if avg > 0 and planned_risk > SIZE_JUMP * avg:
                signals.append({"kind": "size", "severe": False,
                                "text": f"this risks ₹{planned_risk:,.0f}, {planned_risk / avg:.1f}x your session average of "
                                        f"₹{avg:,.0f}"})

        acct = self.desk.exchange.account()
        limit = float(self.desk.cfg["max_daily_loss_usd"])
        if acct["day_pnl"] < -CHASE_FRACTION * limit:
            signals.append({"kind": "chase", "severe": False,
                            "text": f"the day is down ₹{-acct['day_pnl']:,.0f}, past half your ₹{limit:,.0f} daily limit"})

        severe = any(s["severe"] for s in signals) or len(signals) >= 2
        level = "cooldown" if severe else "warn" if signals else "ok"
        out = {"level": level, "signals": signals, "symbol": sym, "planned_risk": planned_risk, "at": clock.label()}
        if level == "cooldown":
            self.cooldown_until = now + timedelta(minutes=COOLDOWN_MIN)
            self.cooldown_reason = signals[0]["text"]
            out["cooldown_until"] = self.cooldown_until.strftime("%H:%M")
        if signals:
            self.events.append(out)
            self.desk.audit.append("tilt.detected", level=level, symbol=sym, signals=[s["kind"] for s in signals])
            self.desk.bus.emit("tilt.detected", out, actor="sentinel")
        return out

    def gate(self) -> str | None:
        """Called before planning any entry: the reason entries are refused, or None."""
        left = self.cooling()
        if not left:
            return None
        return f"tilt cool-down: {self.cooldown_reason}. {left // 60}m {left % 60}s left"
