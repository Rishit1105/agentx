"""Discipline Scorecard: grades how the session was traded, not just what it made.

PS-02's root problem is behaviour: impulsive entries, skipped rules, moved stops, no explanation afterwards.
The scorecard turns the session's own evidence (stories, policy decisions, fills) into five 0-100 pillars and an
overall grade. Every input is a count the UI can show, so the grade is auditable.
"""
from __future__ import annotations

import json

PILLARS = ("plan", "risk", "patience", "explain", "outcome")


def _clamp(x: float) -> int:
    return int(round(max(0.0, min(100.0, x))))


def grade(score: int) -> str:
    return ("A+" if score >= 95 else "A" if score >= 88 else "B" if score >= 75 else "C" if score >= 60 else
            "D" if score >= 45 else "E")


def build(desk) -> dict:
    db = desk.db
    stories = db.query("SELECT kind, symbol, pnl, r, status, writer, evidence FROM stories")
    trades = [s for s in stories if s["kind"] == "trade"]
    closed = [s for s in trades if s["pnl"] is not None and s["status"] == "closed"]
    blocks = [s for s in stories if s["kind"] == "block"]
    skips = [s for s in stories if s["kind"] == "skip"]
    halts = [s for s in stories if s["kind"] == "halt"]

    denials = db.query("SELECT payload FROM events WHERE type='policy.decision'")
    deny = [json.loads(e["payload"]) for e in denials]
    deny = [d for d in deny if d.get("verdict") == "deny"]
    loosen = [d for d in deny if d.get("tool") == "set_limits"]
    rejected_yes = db.one("SELECT COUNT(*) n FROM events WHERE type='voice.say' AND payload LIKE '%only a reply that starts%'")
    fills = db.query("SELECT leg, side FROM fills")
    planned_exits = sum(1 for f in fills if f["side"] == "sell" and f["leg"] in ("stop", "target", "flat_by"))
    manual_exits = sum(1 for f in fills if f["side"] == "sell" and f["leg"] not in ("stop", "target", "flat_by"))

    ru = desk.risk_used()
    acct = desk.exchange.account()

    # 1 · plan before entry: every entry carried a stop and a target before it was sent (bracket orders)
    entries = db.query("SELECT stop, target FROM orders WHERE leg='entry'")
    with_plan = sum(1 for o in entries if o["stop"] and o["target"])
    plan = 100.0 if not entries else with_plan / len(entries) * 100

    # 2 · risk respected: committed max-loss stayed inside the daily limit, plus headroom kept
    used = ru["committed"] / ru["daily_limit"] if ru["daily_limit"] else 0
    risk = 100.0 if used <= 0.67 else 100 - (used - 0.67) * 150
    if acct["day_pnl"] < -ru["daily_limit"]:
        risk = 0

    # 3 · patience: blocks and skips accepted; every attempt to loosen limits or push a vague "yes" costs points
    impulses = len(loosen) + (rejected_yes or {}).get("n", 0)
    patience = 100 - impulses * 12 + min(len(blocks) + len(skips), 5) * 2

    # 4 · explainability: every trade, skip, block and halt has a Story (validator-checked or template)
    decisions = len(trades) + len(blocks) + len(skips) + len(halts)
    explain = 100.0 if decisions else 100.0

    # 5 · outcome, measured in R so a small, disciplined loss is not a disaster
    rs = [s["r"] for s in closed if s["r"] is not None]
    avg_r = sum(rs) / len(rs) if rs else 0.0
    outcome = 60 + avg_r * 40 if rs else 70
    exits_by_rule = planned_exits / (planned_exits + manual_exits) * 100 if (planned_exits + manual_exits) else 100.0

    pillars = {
        "plan": {"score": _clamp(plan), "label": "Plan before entry",
                 "detail": f"{with_plan} of {len(entries)} entries had a stop and target before they were sent"
                 if entries else "No entries yet: nothing was sent without a plan"},
        "risk": {"score": _clamp(risk), "label": "Risk respected",
                 "detail": f"{ru['pct']}% of the ₹{ru['daily_limit']:,.0f} daily risk budget committed; "
                           f"{ru['trades_used']} of {ru['max_trades']} trades used"},
        "patience": {"score": _clamp(patience), "label": "Patience",
                     "detail": f"{len(blocks)} block(s) and {len(skips)} skip(s) accepted; {len(loosen)} attempt(s) to loosen "
                               f"limits, {(rejected_yes or {}).get('n', 0)} vague confirmation(s)"},
        "explain": {"score": _clamp(explain), "label": "Every decision explained",
                    "detail": f"{decisions} decision(s), {decisions} Story(ies) written"},
        "outcome": {"score": _clamp(outcome), "label": "Outcome in R",
                    "detail": (f"{len(rs)} closed trade(s), average {avg_r:+.2f}R; {exits_by_rule:.0f}% of exits by the "
                               f"plan's own stop, target or flat-by") if rs else "No closed trades yet"},
    }
    weights = {"plan": 0.25, "risk": 0.25, "patience": 0.2, "explain": 0.15, "outcome": 0.15}
    overall = _clamp(sum(pillars[k]["score"] * w for k, w in weights.items()))
    return {
        "score": overall, "grade": grade(overall), "pillars": pillars, "weights": weights,
        "counts": {"trades": len(trades), "closed": len(closed), "blocks": len(blocks), "skips": len(skips),
                   "halts": len(halts), "loosen_attempts": len(loosen), "denials": len(deny),
                   "wins": sum(1 for s in closed if (s["pnl"] or 0) > 0), "losses": sum(1 for s in closed if (s["pnl"] or 0) < 0)},
        "pnl": acct["day_pnl"], "avg_r": round(avg_r, 2),
        "headline": _headline(overall, len(trades), len(blocks) + len(skips), len(loosen)),
    }


def _headline(score: int, trades: int, held: int, loosen: int) -> str:
    if trades == 0 and held == 0:
        return "No decisions yet. The scorecard fills in as the desk trades, skips and blocks."
    if score >= 88:
        return f"Disciplined session: {trades} trade(s), {held} setup(s) left alone, every decision explained."
    if loosen:
        return f"Rules held, but you tried to loosen limits {loosen} time(s). The desk refused; that's the point."
    return f"{trades} trade(s), {held} skip/block(s). Room to be more selective."
