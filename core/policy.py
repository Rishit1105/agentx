"""Policy engine: the part the LLM cannot touch.

Every tool call is authorised here before it runs: mode, mandate, kill state, paper assertion, call origin,
and tighten-only limits. Decisions are allow / clamp / deny / need_confirm, each with a reason the Conductor
must speak, and every decision is audited.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .clock import clock
from .config import TIGHTEN_ONLY
from .db import DB

ORDER_TOOLS = {"approve_order"}
ENTRY_TOOLS = {"plan_trade", "size_position", "approve_order", "risk_check", "show_ticket"}
WRITE_TOOLS = ORDER_TOOLS | {"set_limits", "flatten", "alerts_add"}
SAFE_DURING_HALT = {"get_state", "read_story", "explain", "rearm", "halt", "navigate_ui", "get_news",
                    "company_facts", "bulk_deals", "run_backtest", "flatten", "market_clock", "scan_market",
                    "pick_strategy", "time_machine", "check_entry", "plan_exit"}


@dataclass
class Decision:
    verdict: str            # allow | clamp | deny | need_confirm
    reason: str = ""
    args: dict = field(default_factory=dict)

    @property
    def allowed(self) -> bool:
        return self.verdict in ("allow", "clamp")

    def to_dict(self):
        return {"verdict": self.verdict, "reason": self.reason, "args": self.args}


class Mandates:
    def __init__(self, db: DB):
        self.db = db

    def active(self) -> dict | None:
        r = self.db.one("SELECT * FROM mandates WHERE status='active' ORDER BY granted_ts DESC LIMIT 1")
        if not r:
            return None
        r["scope"] = json.loads(r["scope"])
        if clock.now().isoformat() >= r["expires_ts"]:
            self.db.execute("UPDATE mandates SET status='expired' WHERE id=?", (r["id"],))
            return None
        if r["used"] >= r["max_trades"]:
            self.db.execute("UPDATE mandates SET status='exhausted' WHERE id=?", (r["id"],))
            return None
        return r

    def grant(self, minutes: int, max_trades: int, strategies: list[str], symbols, max_loss: float,
              cfg: dict, confirmed_on_screen: bool) -> dict:
        if not confirmed_on_screen:
            raise PermissionError("a mandate must be confirmed on screen")
        minutes = max(5, min(int(minutes), 390))
        max_trades = max(1, min(int(max_trades), int(cfg["max_trades_per_day"])))
        max_loss = min(float(max_loss), float(cfg["max_loss_per_trade_usd"]))  # never looser than global
        self.revoke("superseded")
        mid = "m_" + uuid.uuid4().hex[:6]
        now = clock.now()
        scope = {"strategies": strategies or ["orb", "level"], "symbols": symbols or "any",
                 "max_trades": max_trades, "max_loss_per_trade": max_loss, "side": "long",
                 "confirmed_on_screen": True}
        self.db.execute("INSERT INTO mandates(id,granted_ts,expires_ts,scope,max_trades,used,status) "
                        "VALUES(?,?,?,?,?,?,?)", (mid, now.isoformat(), (now + timedelta(minutes=minutes)).isoformat(),
                                                  json.dumps(scope), max_trades, 0, "active"))
        return self.active()

    def revoke(self, why="revoked") -> int:
        return self.db.execute("UPDATE mandates SET status=? WHERE status='active'", (why,)).rowcount

    def use(self, mid: str):
        self.db.execute("UPDATE mandates SET used=used+1 WHERE id=?", (mid,))

    @staticmethod
    def covers(m: dict, symbol: str, strategy: str, max_loss: float) -> tuple[bool, str]:
        s = m["scope"]
        if s["symbols"] != "any" and symbol.upper() not in [x.upper() for x in s["symbols"]]:
            return False, f"{symbol} is outside the mandate's symbols"
        if strategy and strategy not in s["strategies"]:
            return False, f"strategy {strategy} is outside the mandate"
        if max_loss > s["max_loss_per_trade"] + 1e-9:
            return False, f"max loss ₹{max_loss:,.2f} exceeds the mandate's ₹{s['max_loss_per_trade']:,.2f}"
        return True, ""


class Policy:
    def __init__(self, db: DB, mandates: Mandates, audit):
        self.db = db
        self.mandates = mandates
        self.audit = audit
        self.paper_ok = False

    def authorize(self, tool: str, args: dict, ctx: dict) -> Decision:
        d = self._decide(tool, args, ctx)
        self.audit.append("policy.decision", tool=tool, verdict=d.verdict, reason=d.reason,
                          origin=ctx.get("origin"), args=args)
        return d

    def _decide(self, tool: str, args: dict, ctx: dict) -> Decision:
        kill = ctx["kill_state"]
        mode = ctx["mode"]
        origin = ctx.get("origin", "user")
        if not self.paper_ok:
            return Decision("deny", "paper-only assertion failed; nothing can trade")
        if origin == "untrusted":
            return Decision("deny", "tools cannot be triggered by untrusted data (news, filings, web text)")
        if tool == "approve_order" and args.get("side") == "sell":
            return Decision("allow", "exits are always allowed, even when halted", args)
        if kill != "ARMED" and tool in ENTRY_TOOLS and tool not in SAFE_DURING_HALT:
            return Decision("deny", f"the desk is {kill.lower()}; no new entries until it is re-armed")
        if tool == "set_limits":
            return self._limits(args, ctx["limits"])
        if tool == "approve_order":
            side = args.get("side", "buy")
            if side == "sell":
                return Decision("allow", "exits are always allowed", args)
            if kill != "ARMED":
                return Decision("deny", "the desk is halted; entries are locked")
            if ctx.get("paused_reason"):
                return Decision("deny", f"entries paused by Sentinel: {ctx['paused_reason']}")
            if mode == "observe":
                return Decision("deny", "observe mode cannot trade; switch to advise or autopilot")
            if mode == "autopilot":
                m = self.mandates.active()
                if not m:
                    return Decision("deny", "no active mandate; autopilot needs one confirmed on screen")
                ok, why = Mandates.covers(m, args.get("symbol", ""), args.get("strategy", ""),
                                          float(args.get("max_loss", 0)))
                if not ok:
                    return Decision("deny", f"outside mandate: {why}")
                return Decision("allow", f"covered by mandate {m['id']}", {**args, "mandate_id": m["id"]})
            if mode == "advise" and not args.get("user_yes"):
                return Decision("need_confirm", "advise mode: say \"yes, buy …\" for this exact order", args)
            return Decision("allow", "user confirmed this order", args)
        if tool == "set_mode":
            if args.get("mode") == "autopilot" and not self.mandates.active():
                return Decision("deny", "autopilot needs an active mandate confirmed on screen")
            return Decision("allow", "", args)
        return Decision("allow", "", args)

    @staticmethod
    def _limits(args: dict, limits: dict) -> Decision:
        clamped, denied = {}, []
        for k, v in args.items():
            if k not in TIGHTEN_ONLY:
                denied.append(f"{k} cannot be changed by voice")
                continue
            try:
                v = float(v)
            except (TypeError, ValueError):
                denied.append(f"{k} must be a number")
                continue
            cur = float(limits.get(k, v))
            direction = TIGHTEN_ONLY[k]
            loosens = v > cur if direction == "down" else v < cur
            if loosens:
                denied.append(f"I can't loosen {k.replace('_', ' ')} by voice (now {cur:g}, asked {v:g})")
            elif v <= 0 and direction == "down":
                denied.append(f"{k} must stay above zero")
            else:
                clamped[k] = int(v) if k.startswith("max_trades") or k.startswith("max_orders") else v
        if denied and not clamped:
            return Decision("deny", "; ".join(denied) + ". You can review limits in Guardrails.")
        if denied:
            return Decision("clamp", "; ".join(denied), clamped)
        return Decision("allow", "tightened", clamped)


_ = datetime
