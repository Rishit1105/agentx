"""Indian equity intraday transaction costs (NSE, MIS / intraday). Used by the Paper Exchange and the Backtester
so live paper fills and backtests charge the same way.

Per order:  brokerage   min(₹20, 0.03% of turnover)          (discount-broker norm)
            exchange    0.00297% of turnover (NSE)
            SEBI fee    ₹10 per crore of turnover
            GST         18% on (brokerage + exchange + SEBI)
Sell side:  STT         0.025% of sell turnover (intraday)
Buy side:   stamp duty  0.003% of buy turnover
Rates are configurable in trader/config.json (meridian_costs) and are an approximation, not a contract note.
"""
from __future__ import annotations

DEFAULT = {"brokerage_flat": 20.0, "brokerage_pct": 0.03, "stt_sell_pct": 0.025, "exchange_pct": 0.00297,
           "sebi_per_crore": 10.0, "stamp_buy_pct": 0.003, "gst_pct": 18.0, "slippage_bps": 2}


def order_charges(side: str, price: float, qty: float, costs: dict | None = None) -> dict:
    c = {**DEFAULT, **(costs or {})}
    turnover = price * qty
    brokerage = min(c["brokerage_flat"], turnover * c["brokerage_pct"] / 100)
    exchange = turnover * c["exchange_pct"] / 100
    sebi = turnover / 1e7 * c["sebi_per_crore"]
    gst = (brokerage + exchange + sebi) * c["gst_pct"] / 100
    stt = turnover * c["stt_sell_pct"] / 100 if side == "sell" else 0.0
    stamp = turnover * c["stamp_buy_pct"] / 100 if side == "buy" else 0.0
    total = brokerage + exchange + sebi + gst + stt + stamp
    return {"brokerage": round(brokerage, 2), "exchange": round(exchange, 2), "sebi": round(sebi, 2),
            "gst": round(gst, 2), "stt": round(stt, 2), "stamp": round(stamp, 2), "total": round(total, 2)}


def slippage(costs: dict | None) -> float:
    return float({**DEFAULT, **(costs or {})}.get("slippage_bps", 2)) / 10000.0


def inr(x, d: int = 2) -> str:
    """Indian digit grouping: 500000 -> ₹5,00,000.00; -2497.5 -> −₹2,497.50."""
    if x is None:
        return "—"
    neg = x < 0
    s = f"{abs(float(x)):.{d}f}"
    whole, _, frac = s.partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return ("−" if neg else "") + "₹" + whole + ("." + frac if d else "")
