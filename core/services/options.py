"""Paper options desk: payoff, risk and a Risk-gate verdict for defined-risk strategies. Read-only, paper only.

There is no options chain in the recorded session, so premiums are MODELLED with Black-Scholes using the underlying's
realised volatility from its own 60 sessions of 5-minute bars, a 6.5% risk-free rate and the chosen days to expiry.
Every response says so. Only defined-risk strategies are offered (no naked short options), and the strategy's maximum
loss is checked against the same per-trade loss limit as stock trades, so the desk's rules apply unchanged.
"""
from __future__ import annotations

import math

RATE = 0.065
STRATEGIES = {
    "long_call": "Long call", "long_put": "Long put", "bull_call_spread": "Bull call spread",
    "bear_put_spread": "Bear put spread", "long_straddle": "Long straddle", "iron_condor": "Iron condor",
}


class OptionsError(ValueError):
    pass


def _ncdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _npdf(x: float) -> float:
    return math.exp(-x * x / 2) / math.sqrt(2 * math.pi)


def bs(kind: str, S: float, K: float, T: float, vol: float, r: float = RATE) -> dict:
    """Black-Scholes price and greeks for one European option (NSE index and stock options are European)."""
    T = max(T, 1 / 365)
    d1 = (math.log(S / K) + (r + vol * vol / 2) * T) / (vol * math.sqrt(T))
    d2 = d1 - vol * math.sqrt(T)
    if kind == "call":
        price = S * _ncdf(d1) - K * math.exp(-r * T) * _ncdf(d2)
        delta = _ncdf(d1)
        theta = (-S * _npdf(d1) * vol / (2 * math.sqrt(T)) - r * K * math.exp(-r * T) * _ncdf(d2)) / 365
    else:
        price = K * math.exp(-r * T) * _ncdf(-d2) - S * _ncdf(-d1)
        delta = _ncdf(d1) - 1
        theta = (-S * _npdf(d1) * vol / (2 * math.sqrt(T)) + r * K * math.exp(-r * T) * _ncdf(-d2)) / 365
    return {"price": max(price, 0.05), "delta": delta, "theta": theta, "vega": S * _npdf(d1) * math.sqrt(T) / 100}


def realised_vol(sessions: list[list[dict]]) -> float:
    """Annualised close-to-close volatility from daily closes of the recorded sessions."""
    closes = [s[-1]["c"] for s in sessions if s]
    rets = [math.log(b / a) for a, b in zip(closes, closes[1:]) if a > 0 and b > 0]
    if len(rets) < 5:
        return 0.25
    mu = sum(rets) / len(rets)
    sd = math.sqrt(sum((x - mu) ** 2 for x in rets) / (len(rets) - 1))
    return max(0.08, min(1.2, sd * math.sqrt(252)))


def strike_step(spot: float, index: bool) -> float:
    if index:
        return 50.0
    return 2.5 if spot < 250 else 5 if spot < 500 else 10 if spot < 1000 else 20 if spot < 2500 else 50 if spot < 5000 else 100


def default_lot(spot: float, index: bool) -> int:
    """Assumed lot size: 75 for NIFTY 50; for stocks, NSE sizes lots near a ₹5 lakh contract, rounded to 25 shares."""
    if index:
        return 75
    return max(25, int(round(500000 / spot / 25.0)) * 25)


def legs_for(strategy: str, spot: float, step: float, width: int) -> list[dict]:
    atm = round(spot / step) * step
    w = step * width
    if strategy == "long_call":
        return [{"side": "buy", "kind": "call", "strike": atm}]
    if strategy == "long_put":
        return [{"side": "buy", "kind": "put", "strike": atm}]
    if strategy == "bull_call_spread":
        return [{"side": "buy", "kind": "call", "strike": atm}, {"side": "sell", "kind": "call", "strike": atm + w}]
    if strategy == "bear_put_spread":
        return [{"side": "buy", "kind": "put", "strike": atm}, {"side": "sell", "kind": "put", "strike": atm - w}]
    if strategy == "long_straddle":
        return [{"side": "buy", "kind": "call", "strike": atm}, {"side": "buy", "kind": "put", "strike": atm}]
    if strategy == "iron_condor":
        return [{"side": "buy", "kind": "put", "strike": atm - 2 * w}, {"side": "sell", "kind": "put", "strike": atm - w},
                {"side": "sell", "kind": "call", "strike": atm + w}, {"side": "buy", "kind": "call", "strike": atm + 2 * w}]
    raise OptionsError(f"strategy must be one of {', '.join(STRATEGIES)}")


def analyse(desk, symbol: str, strategy: str, *, days: int = 7, lots: int = 1, width: int = 2, lot_size: int | None = None) -> dict:
    m, cfg = desk.market, desk.cfg
    sym = (symbol or "NIFTY50").upper()
    index = sym == "NIFTY50"
    spot = m.price(sym)
    if not spot:
        raise OptionsError(f"no price for {sym}")
    if not 1 <= days <= 60:
        raise OptionsError("days to expiry must be 1-60")
    if not 1 <= lots <= 20:
        raise OptionsError("lots must be 1-20")
    vol = realised_vol(m.sessions_5m(sym, 60))
    T = days / 365
    step = strike_step(spot, index)
    lot = int(lot_size) if lot_size else default_lot(spot, index)
    qty = lot * lots
    legs = legs_for(strategy, spot, step, max(1, min(6, width)))
    net = 0.0
    greeks = {"delta": 0.0, "theta": 0.0, "vega": 0.0}
    for leg in legs:
        q = bs(leg["kind"], spot, leg["strike"], T, vol)
        sign = 1 if leg["side"] == "buy" else -1
        leg["premium"] = round(q["price"], 2)
        net += sign * q["price"]
        for g in greeks:
            greeks[g] += sign * q[g] * qty
    lo, hi = spot * 0.88, spot * 1.12
    grid = [lo + (hi - lo) * i / 120 for i in range(121)]

    def payoff(S: float) -> float:
        v = 0.0
        for leg in legs:
            intrinsic = max(0.0, S - leg["strike"]) if leg["kind"] == "call" else max(0.0, leg["strike"] - S)
            v += (intrinsic - leg["premium"]) * (1 if leg["side"] == "buy" else -1)
        return v * qty

    curve = [{"s": round(S, 2), "pnl": round(payoff(S), 2)} for S in grid]
    strikes = sorted({leg["strike"] for leg in legs})
    probe = [0.0, *strikes, spot * 5]
    max_profit = max(payoff(S) for S in probe + grid)
    max_loss = min(payoff(S) for S in probe + grid)
    unbounded = strategy in ("long_call", "long_straddle")
    bes = []
    for a, b in zip(curve, curve[1:]):
        if (a["pnl"] <= 0 < b["pnl"]) or (a["pnl"] >= 0 > b["pnl"]):
            t = a["pnl"] / (a["pnl"] - b["pnl"])
            bes.append(round(a["s"] + (b["s"] - a["s"]) * t, 2))
    # probability of profit at expiry under the same lognormal model
    sd = vol * math.sqrt(T)

    def p_below(x: float) -> float:
        return _ncdf((math.log(x / spot) - (RATE - vol * vol / 2) * T) / sd)

    pop = 0.0
    edges = [0.0, *bes, float("inf")]
    for a, b in zip(edges, edges[1:]):
        mid = (a + b) / 2 if b != float("inf") else (a * 1.05 if a else spot)
        if a == 0.0 and b != float("inf"):
            mid = b * 0.95
        if payoff(mid) > 0:
            pop += (p_below(b) if b != float("inf") else 1.0) - (p_below(a) if a > 0 else 0.0)
    limit = float(cfg["max_loss_per_trade_usd"])
    loss = -max_loss
    lots_allowed = int(limit // (loss / lots)) if loss > 0 else lots
    verdict = "PASS" if loss <= limit else "BLOCK"
    return {
        "symbol": sym, "name": m.name(sym), "strategy": strategy, "label": STRATEGIES[strategy], "spot": round(spot, 2),
        "days": days, "lots": lots, "lot_size": lot, "qty": qty, "vol": round(vol * 100, 1), "legs": legs,
        "net_premium": round(net * qty, 2), "type": "debit" if net > 0 else "credit",
        "max_profit": None if unbounded else round(max_profit, 2), "max_loss": round(loss, 2),
        "breakevens": bes, "pop": round(pop * 100, 1),
        "greeks": {k: round(v, 2) for k, v in greeks.items()}, "curve": curve,
        "verdict": verdict, "lots_allowed": max(0, lots_allowed),
        "why": (f"Max loss ₹{loss:,.0f} is within your ₹{limit:,.0f} per-trade limit." if verdict == "PASS" else
                f"Max loss ₹{loss:,.0f} breaks your ₹{limit:,.0f} per-trade limit; at most {max(0, lots_allowed)} lot(s) fit."),
        "note": (f"Modelled premiums (Black-Scholes, realised vol {vol * 100:.1f}%, {days} days, r 6.5%), not a live option "
                 f"chain. Lot size {lot} is {'the assumed NIFTY lot' if index else 'an estimate'}; check NSE's current "
                 "lot sizes. Paper only, nothing is placed."),
    }
