"""PDF export of a backtest report + stories (reportlab). Always carries the verdict and the disclaimers."""
from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

INK, CYAN, MINT, CORAL, MUTED = (colors.HexColor(c) for c in ("#0B1018", "#0EA5C6", "#1F9D6B", "#D64545", "#5B6672"))


def backtest_pdf(rep: dict, stories: list[dict]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    x0, y = 18 * mm, H - 22 * mm
    c.setFillColor(INK)
    c.rect(0, H - 34 * mm, W, 34 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(x0, H - 16 * mm, "MERIDIAN  ·  Backtest report")
    c.setFont("Helvetica", 9)
    c.drawString(x0, H - 23 * mm, f"{rep.get('symbol')} · {rep.get('strategy', {}).get('label')} · "
                 f"{rep.get('window', {}).get('from')} to {rep.get('window', {}).get('to')} "
                 f"({rep.get('window', {}).get('sessions')} sessions) · NSE · INR · PAPER ONLY")
    y = H - 46 * mm
    st, bh, spy = rep.get("strategy_stats", {}), rep.get("buy_hold", {}), rep.get("index_hold") or {}
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x0, y, "Verdict")
    y -= 6 * mm
    c.setFont("Helvetica", 10)
    c.setFillColor(MINT if rep.get("gate", {}).get("passed") else CORAL)
    c.drawString(x0, y, (rep.get("verdict") or "")[:110])
    y -= 10 * mm
    rows = [("Metric", "Strategy", "Buy & hold", "NIFTY 50"),
            ("Net return %", st.get("net_return_pct"), bh.get("net_return_pct"), spy.get("net_return_pct")),
            ("Sharpe (ann.)", st.get("sharpe"), bh.get("sharpe"), spy.get("sharpe")),
            ("Max drawdown %", st.get("max_dd_pct"), bh.get("max_dd_pct"), spy.get("max_dd_pct")),
            ("Win rate %", st.get("win_rate"), "", ""), ("Profit factor", st.get("profit_factor"), "", ""),
            ("Expectancy (R)", st.get("expectancy_r"), "", ""), ("Trades", st.get("trades"), "", ""),
            ("Time in market %", st.get("time_in_market_pct"), "", "")]
    for i, r in enumerate(rows):
        c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 9.5)
        c.setFillColor(MUTED if i == 0 else INK)
        for j, v in enumerate(r):
            c.drawString(x0 + j * 42 * mm, y, "—" if v in (None, "") and i else str(v))
        y -= 5.5 * mm
    # equity sparkline
    y -= 4 * mm
    eq = rep.get("equity", {})
    series = [("strategy", CYAN), ("buy_hold", MUTED), ("index", MINT)]
    vals = [v for k, _ in series for v in (eq.get(k) or [])]
    if vals:
        lo, hi = min(vals), max(vals)
        gx, gw, gh = x0, W - 2 * x0, 45 * mm
        c.setStrokeColor(colors.HexColor("#E3E7EC"))
        c.rect(gx, y - gh, gw, gh, fill=0)
        for k, col in series:
            s = eq.get(k) or []
            if len(s) < 2:
                continue
            c.setStrokeColor(col)
            c.setLineWidth(1.4 if k == "strategy" else 0.9)
            p = c.beginPath()
            for i, v in enumerate(s):
                px = gx + i / (len(s) - 1) * gw
                py = y - gh + (v - lo) / ((hi - lo) or 1) * gh
                (p.moveTo if i == 0 else p.lineTo)(px, py)
            c.drawPath(p)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(MUTED)
        c.drawString(gx, y - gh - 4 * mm, "Equity: cyan = strategy, grey = buy & hold, green = NIFTY 50 (same start capital, INR)")
        y -= gh + 12 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0, y, "Gate")
    y -= 5.5 * mm
    c.setFont("Helvetica", 9)
    for r in rep.get("gate", {}).get("reasons", []) or ["passed"]:
        c.drawString(x0, y, "• " + r[:120])
        y -= 5 * mm
    y -= 3 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x0, y, "Stories")
    y -= 5.5 * mm
    c.setFont("Helvetica", 8.5)
    for s in stories[:10]:
        if y < 30 * mm:
            break
        c.drawString(x0, y, f"[{s['kind']}] {s['headline']}"[:130])
        y -= 4.6 * mm
    c.setFont("Helvetica-Oblique", 7.5)
    c.setFillColor(MUTED)
    disc = ["Educational prototype. Simulated (paper) trading only. Not financial advice.",
            "SEBI studies show most individual intraday traders lose money. Backtests and simulations do not predict the future.",
            "Stop orders can fill worse than the stop price in a fast market. Data: Yahoo Finance (unofficial), NSE India."]
    for i, line in enumerate(disc):
        c.drawString(x0, 16 * mm - i * 4 * mm, line)
    c.showPage()
    c.save()
    return buf.getvalue()
