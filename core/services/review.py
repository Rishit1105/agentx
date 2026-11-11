"""Trade Review: a post-mortem of every round trip, the charges it paid, and an end-of-day PDF.

For each closed trade it pairs the entry fill with its exit, then walks the real 5-minute bars in between to measure
MAE (maximum adverse excursion: how far it went against you) and MFE (maximum favourable excursion: how far it went
for you), both in R against the ORIGINAL stop. That shows whether the stop was sensible and how much was left on the
table, which is the kind of feedback a trading journal should give.
"""
from __future__ import annotations

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from ..costs import order_charges

INK, MUTED, MINT, CORAL, LINE = (colors.HexColor(c) for c in ("#14181F", "#646B76", "#0E9F6E", "#E5484D", "#E7E4DC"))
EXIT_LABEL = {"stop": "Stop", "target": "Target", "flatten": "Flatten", "flat_by": "Flat-by", "halt": "Kill switch"}


def _epoch(ts: str) -> float:
    return datetime.fromisoformat(ts).timestamp()


def trades(desk) -> list[dict]:
    db, m = desk.db, desk.market
    fills = db.query("SELECT * FROM fills ORDER BY id")
    entries = {o["id"]: o for o in db.query("SELECT * FROM orders WHERE leg='entry'")}
    exit_orders = {o["id"]: o for o in db.query("SELECT * FROM orders WHERE side='sell'")}
    open_by_sym: dict[str, list[dict]] = {}
    out = []
    for f in fills:
        if f["side"] == "buy":
            o = entries.get(f["order_id"]) or {}
            open_by_sym.setdefault(f["symbol"], []).append({**f, "stop": o.get("stop"), "target": o.get("target")})
            continue
        stack = open_by_sym.get(f["symbol"]) or []
        if not stack:
            continue
        e = stack.pop(0)
        risk_ps = (e["price"] - e["stop"]) if e.get("stop") else None
        t0, t1 = _epoch(e["ts"]), _epoch(f["ts"])
        path = []
        for b in m.bars(f["symbol"], include_forming=True):
            if not t0 - 300 < b["t"] <= t1:
                continue
            path.append(b)
            # the exit happened on the first bar that touched its level (the engine's own rule), not at fill-stamp time
            if (f["leg"] == "stop" and b["l"] <= f["price"]) or (f["leg"] == "target" and b["h"] >= f["price"]):
                t1 = b["t"] + 300
                break
        lo = min((b["l"] for b in path), default=min(e["price"], f["price"]))
        hi = max((b["h"] for b in path), default=max(e["price"], f["price"]))
        r = (f["price"] - e["price"]) / risk_ps if risk_ps and risk_ps > 0 else None
        mae = (lo - e["price"]) / risk_ps if risk_ps and risk_ps > 0 else None
        mfe = (hi - e["price"]) / risk_ps if risk_ps and risk_ps > 0 else None
        reason = (exit_orders.get(f["order_id"]) or {}).get("reason") or f["leg"]
        gross = (f["price"] - e["price"]) * f["qty"]
        fees = (e["fee"] or 0) + (f["fee"] or 0)
        verdict = _verdict(r, mae, mfe, f["leg"])
        out.append({
            "symbol": f["symbol"], "name": m.name(f["symbol"]), "qty": f["qty"],
            "entry": e["price"], "entry_ts": e["ts"], "exit": f["price"], "exit_ts": f["ts"], "exit_leg": f["leg"],
            "exit_label": EXIT_LABEL.get(f["leg"], f["leg"].title()), "reason": reason,
            "stop": e.get("stop"), "target": e.get("target"), "hold_min": round((t1 - t0) / 60),
            "gross": round(gross, 2), "fees": round(fees, 2), "net": round(gross - fees, 2),
            "r": round(r, 2) if r is not None else None, "mae_r": round(mae, 2) if mae is not None else None,
            "mfe_r": round(mfe, 2) if mfe is not None else None,
            "left_on_table_r": round(mfe - r, 2) if mfe is not None and r is not None else None,
            "efficiency": round(r / mfe * 100) if r is not None and mfe and mfe > 0 and r > 0 else None,
            "verdict": verdict,
        })
    return out


def _verdict(r, mae, mfe, leg) -> str:
    if r is None:
        return "No stop recorded, so R can't be measured."
    if leg == "target":
        return "Plan worked: the target filled before the stop."
    if leg == "stop" and mfe is not None and mfe >= 1:
        return f"It reached +{mfe:.1f}R before reversing to the stop. A breakeven guard would have saved it."
    if leg == "stop":
        return "Stopped out for about −1R: the loss was capped where the plan said it would be."
    if mae is not None and mae > -0.3:
        return "Clean trade: it barely went against you."
    return f"Closed at {r:+.2f}R after going as low as {mae:+.2f}R."


def charges(desk) -> dict:
    """Recompute every fill's Indian intraday charges by component, so the UI can show what the round trips cost."""
    costs = desk.cfg.get("meridian_costs")
    keys = ("brokerage", "stt", "exchange", "sebi", "gst", "stamp")
    tot = {k: 0.0 for k in keys}
    turnover = 0.0
    for f in desk.db.query("SELECT side, price, qty FROM fills"):
        c = order_charges(f["side"], f["price"], f["qty"], costs)
        turnover += f["price"] * f["qty"]
        for k in keys:
            tot[k] += c[k]
    total = sum(tot.values())
    return {"components": {k: round(v, 2) for k, v in tot.items()}, "total": round(total, 2),
            "turnover": round(turnover, 2), "bps_of_turnover": round(total / turnover * 1e4, 2) if turnover else 0.0}


def summary(desk) -> dict:
    t = trades(desk)
    rs = [x["r"] for x in t if x["r"] is not None]
    wins = [x for x in t if x["net"] > 0]
    return {"trades": t, "charges": charges(desk), "count": len(t), "wins": len(wins), "losses": len(t) - len(wins),
            "win_rate": round(len(wins) / len(t) * 100) if t else None, "net": round(sum(x["net"] for x in t), 2),
            "avg_r": round(sum(rs) / len(rs), 2) if rs else None,
            "avg_mfe_r": round(sum(x["mfe_r"] for x in t if x["mfe_r"] is not None) / max(1, len(t)), 2) if t else None,
            "account": desk.exchange.account()}


def day_pdf(desk, scorecard: dict, stories: list[dict]) -> bytes:
    s = summary(desk)
    acct = s["account"]
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    x0 = 18 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(x0, H - 22 * mm, "MERIDIAN  ·  End-of-day report")
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(x0, H - 29 * mm, "NSE · INR · paper trading only · generated from the session's own evidence")
    c.setStrokeColor(LINE)
    c.line(x0, H - 33 * mm, W - x0, H - 33 * mm)

    y = H - 46 * mm
    tiles = [("Day P&L", f"Rs {acct['day_pnl']:,.2f}"), ("Equity", f"Rs {acct['equity']:,.0f}"),
             ("Trades", f"{s['count']} ({s['wins']} won)"), ("Discipline", f"{scorecard['grade']} · {scorecard['score']}/100")]
    w = (W - 2 * x0) / 4
    for i, (k, v) in enumerate(tiles):
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x0 + i * w, y + 8 * mm, k.upper())
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 13)
        c.drawString(x0 + i * w, y + 2 * mm, v)
    y -= 12 * mm
    c.setFont("Helvetica-Oblique", 9.5)
    c.setFillColor(INK)
    c.drawString(x0, y, scorecard.get("headline", "")[:110])

    y -= 12 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0, y, "Trades")
    y -= 6 * mm
    cols = [("Symbol", 0), ("Qty", 26), ("Entry", 40), ("Exit", 60), ("Why", 80), ("R", 104), ("MAE", 118), ("MFE", 132), ("Net Rs", 148)]
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(MUTED)
    for name, dx in cols:
        c.drawString(x0 + dx * mm, y, name)
    c.setFont("Helvetica", 8.5)
    for t in s["trades"][:18]:
        y -= 5.5 * mm
        c.setFillColor(INK)
        vals = [t["symbol"], f"{t['qty']:.0f}", f"{t['entry']:.2f}", f"{t['exit']:.2f}", t["exit_label"],
                f"{t['r']:+.2f}" if t["r"] is not None else "-", f"{t['mae_r']:+.2f}" if t["mae_r"] is not None else "-",
                f"{t['mfe_r']:+.2f}" if t["mfe_r"] is not None else "-", f"{t['net']:,.2f}"]
        for (name, dx), v in zip(cols, vals):
            if name == "Net Rs":
                c.setFillColor(MINT if t["net"] >= 0 else CORAL)
            c.drawString(x0 + dx * mm, y, str(v))
    if not s["trades"]:
        y -= 5.5 * mm
        c.setFillColor(MUTED)
        c.drawString(x0, y, "No closed trades today. Skips and blocks are listed below.")

    y -= 12 * mm
    ch = s["charges"]
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0, y, f"Charges  ·  Rs {ch['total']:,.2f} on Rs {ch['turnover']:,.0f} turnover ({ch['bps_of_turnover']} bps)")
    y -= 6 * mm
    c.setFont("Helvetica", 8.5)
    c.drawString(x0, y, "   ".join(f"{k.upper()} Rs {v:,.2f}" for k, v in ch["components"].items()))

    y -= 12 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0, y, "Discipline scorecard")
    c.setFont("Helvetica", 8.5)
    for p in scorecard["pillars"].values():
        y -= 5.5 * mm
        c.drawString(x0, y, f"{p['label']}: {p['score']}/100  ·  {p['detail'][:95]}")

    y -= 12 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0, y, "Every decision, explained")
    c.setFont("Helvetica", 8.5)
    for st in stories[:14]:
        if y < 30 * mm:
            break
        y -= 5.5 * mm
        c.drawString(x0, y, f"[{st['kind']}] {(st.get('headline') or '')[:120]}")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(x0, 14 * mm, "Educational prototype. Simulated (paper) trading only, not investment advice. "
                              "SEBI found most individual intraday traders lose money.")
    c.showPage()
    c.save()
    return buf.getvalue()
