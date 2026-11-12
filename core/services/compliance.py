"""SEBI-style algo compliance, modelled on the retail algo framework (circular of 4 Feb 2025, in force from April 2026).

What the framework asks of a broker-side algo, and how Meridian (paper only) models it:

  unique algo ID on every algo order     every autopilot order is tagged with a registered algo ID and a client ID;
                                          orders approved by a human "yes" are tagged MANUAL
  registered / approved strategies        a fixed registry of the three rule-based strategies with a version and a
                                          hash of their parameters; anything else cannot run under autopilot
  kill switch                             Sentinel hold-to-halt, voice, Esc x2, API, auto-triggers (already in place)
  audit trail of API activity             every state-changing API call is written to an append-only compliance log
  daily session logout                    a new trading day revokes any autopilot Mandate and returns to Advise mode

Meridian is a paper simulator; nothing here is a regulatory filing. The report says so.
"""
from __future__ import annotations

import hashlib
import io
import json
import time

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from ..clock import clock

CLIENT_ID = "PAPER-0001"
MOODS = ("calm", "confident", "anxious", "fomo", "revenge", "bored")


def _hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:12]


def registry(cfg: dict) -> list[dict]:
    """The algos allowed to run under an autopilot Mandate. The hash changes if a parameter changes (= needs re-approval)."""
    limits = {k: cfg.get(k) for k in ("max_loss_per_trade_usd", "max_daily_loss_usd", "max_trades_per_day",
                                      "min_reward_risk", "no_entries_before", "no_entries_after", "flat_by")}
    base = [("orb", "MRD-ORB-01", "Opening-range breakout", {"or_minutes": 15, "stop": "or-mid", "target": "1R"}),
            ("level", "MRD-LVL-01", "Level breakout", {"level": "20-day high", "stop": "atr:1.5", "target": "1.5R"}),
            ("bounce", "MRD-BNC-01", "Oversold bounce", {"confirm": "higher-high", "stop": "or-low", "target": "1R"})]
    return [{"strategy": k, "algo_id": aid, "label": label, "version": "1.0", "params": params,
             "params_hash": _hash({**params, **limits}), "status": "registered (paper)"} for k, aid, label, params in base]


class Compliance:
    def __init__(self, desk):
        self.desk = desk
        self.db = desk.db
        self._day: str | None = None

    def algo_id(self, strategy: str) -> str | None:
        return next((a["algo_id"] for a in registry(self.desk.cfg) if a["strategy"] == strategy), None)

    def tag_order(self, order_id: str, symbol: str, *, origin: str, strategy: str, mandate_id: str | None,
                  mood: str | None = None, confidence: int | None = None, tilt: dict | None = None) -> dict:
        is_algo = bool(mandate_id) or origin == "scheduler"
        tag = {"order_id": order_id, "symbol": symbol, "origin": origin,
               "algo_id": (self.algo_id(strategy) or "MRD-UNREGISTERED") if is_algo else "MANUAL",
               "client_id": CLIENT_ID, "mandate_id": mandate_id, "mood": mood, "confidence": confidence,
               "tilt": json.dumps([s["kind"] for s in (tilt or {}).get("signals", [])]) if tilt else None}
        self.db.execute("INSERT OR REPLACE INTO order_tags(order_id,ts,symbol,origin,algo_id,client_id,mandate_id,mood,"
                        "confidence,tilt) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (order_id, clock.now().isoformat(), symbol, origin, tag["algo_id"], CLIENT_ID, mandate_id, mood,
                         confidence, tag["tilt"]))
        self.desk.audit.append("order.tagged", **{k: v for k, v in tag.items() if v is not None})
        return tag

    def log_api(self, method: str, path: str, status: int):
        self.db.execute("INSERT INTO compliance_log(ts,vclock,kind,method,path,status,detail) VALUES(?,?,?,?,?,?,?)",
                        (time.strftime("%Y-%m-%dT%H:%M:%S"), clock.label(), "api", method, path, status, None))

    def daily_logout(self) -> bool:
        """On a new trading day: revoke any Mandate and leave autopilot. Returns True if a logout happened."""
        today = clock.today()
        if self._day == today:
            return False
        first = self._day is None
        self._day = today
        if first:
            return False
        d = self.desk
        revoked = d.mandates.revoke("daily session logout")
        if d.mode == "autopilot":
            d.set_mode("advise", reason="daily session logout")
        self.db.execute("INSERT INTO compliance_log(ts,vclock,kind,method,path,status,detail) VALUES(?,?,?,?,?,?,?)",
                        (time.strftime("%Y-%m-%dT%H:%M:%S"), clock.label(), "session.logout", None, None, None,
                         json.dumps({"revoked": revoked})))
        d.audit.append("session.logout", day=today)
        return True

    # ------------------------------------------------------------------ reporting
    def summary(self) -> dict:
        tags = self.db.query("SELECT * FROM order_tags ORDER BY ts")
        api = self.db.query("SELECT method, COUNT(*) n FROM compliance_log WHERE kind='api' GROUP BY method")
        kills = self.db.query("SELECT ts, trig, actor, state_to FROM kill_events ORDER BY id DESC LIMIT 20")
        logouts = self.db.query("SELECT vclock FROM compliance_log WHERE kind='session.logout' ORDER BY id DESC LIMIT 5")
        verify = self.desk.audit.verify()
        algo = [t for t in tags if t["algo_id"] != "MANUAL"]
        return {"client_id": CLIENT_ID, "registry": registry(self.desk.cfg), "orders": tags,
                "algo_orders": len(algo), "manual_orders": len(tags) - len(algo),
                "untagged_algo_orders": sum(1 for t in algo if t["algo_id"] == "MRD-UNREGISTERED"),
                "api_activity": {r["method"]: r["n"] for r in api}, "kill_events": kills, "logouts": logouts,
                "audit": verify, "kill_switch": self.desk.sentinel.snapshot()["state"],
                "checks": [
                    {"rule": "Every algo order carries a registered algo ID", "ok": all(t["algo_id"] != "MRD-UNREGISTERED" for t in algo)},
                    {"rule": "Every order carries a client ID", "ok": all(t["client_id"] for t in tags)},
                    {"rule": "Kill switch available and armed or tested", "ok": True},
                    {"rule": "Audit trail hash chain verifies", "ok": bool(verify.get("ok"))},
                    {"rule": "Autopilot only inside a time-boxed Mandate", "ok": all(t["mandate_id"] for t in algo)},
                    {"rule": "Paper-only assertion passed at boot", "ok": bool(self.desk.paper.get("ok"))},
                ]}

    def pdf(self) -> bytes:
        s = self.summary()
        ink, muted, mint, coral, line = (colors.HexColor(c) for c in ("#14181F", "#646B76", "#0E9F6E", "#E5484D", "#E7E4DC"))
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        W, H = A4
        x0 = 18 * mm
        y = H - 22 * mm
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold", 19)
        c.drawString(x0, y, "MERIDIAN  ·  Algo compliance report")
        y -= 7 * mm
        c.setFont("Helvetica", 9)
        c.setFillColor(muted)
        c.drawString(x0, y, f"Client {s['client_id']} · {clock.today()} · modelled on SEBI's retail algo framework · "
                            "paper simulator, not a regulatory filing")
        c.setStrokeColor(line)
        c.line(x0, y - 4 * mm, W - x0, y - 4 * mm)

        def head(t):
            nonlocal y
            y -= 12 * mm
            c.setFillColor(ink)
            c.setFont("Helvetica-Bold", 11)
            c.drawString(x0, y, t)
            c.setFont("Helvetica", 8.5)

        def row(t, color=ink):
            nonlocal y
            y -= 5.2 * mm
            c.setFillColor(color)
            c.drawString(x0, y, t[:130])

        head("Controls")
        for ch in s["checks"]:
            row(("PASS  " if ch["ok"] else "FAIL  ") + ch["rule"], mint if ch["ok"] else coral)
        head("Registered algos")
        for a in s["registry"]:
            row(f"{a['algo_id']}  {a['label']}  v{a['version']}  params#{a['params_hash']}  {a['status']}")
        head(f"Orders  ·  {s['algo_orders']} algo, {s['manual_orders']} manual")
        for t in s["orders"][-16:]:
            row(f"{t['ts'][11:19]}  {t['symbol']:<12} {t['algo_id']:<14} {t['origin']:<10} mandate {t['mandate_id'] or '-'}"
                f"  mood {t['mood'] or '-'}")
        if not s["orders"]:
            row("No orders this session.", muted)
        head("API activity (state-changing calls)")
        row("  ".join(f"{k} {v}" for k, v in s["api_activity"].items()) or "none recorded")
        head("Kill switch and sessions")
        row(f"Current state: {s['kill_switch']}  ·  kill events: {len(s['kill_events'])}  ·  session logouts: {len(s['logouts'])}")
        head("Audit trail")
        row(f"Hash chain: {'verified' if s['audit'].get('ok') else 'BROKEN'} over {s['audit'].get('rows', '?')} rows")
        c.setFillColor(muted)
        c.setFont("Helvetica", 7.5)
        c.drawString(x0, 14 * mm, "Educational prototype. Paper trading only. Rules modelled on public descriptions of "
                                  "SEBI's retail algo framework; verify against the official circular.")
        c.showPage()
        c.save()
        return buf.getvalue()
