"""What-if risk simulator: "what if I buy 300 Infosys?" answered from the rules, with no ticket created.

It mirrors the Budget sizing (smallest of max-loss, position cap, max order and cash buffer wins) and the Risk gate's
daily-loss accounting, adds Indian round-trip charges and a gap-through-stop scenario, and says which limit binds.
Nothing here can place or stage an order; it is a calculator over the same config the gate enforces.
"""
from __future__ import annotations

import math

from ..costs import inr, order_charges


class WhatIfError(ValueError):
    pass


def opening_range(bars: list[dict], n: int = 3) -> tuple[float, float] | None:
    """High/low of the first fifteen minutes (three 5-minute bars), the ORB reference the Exit Planner uses."""
    first = [b for b in bars[:n] if not b.get("forming")]
    if len(first) < n:
        return None
    return max(b["h"] for b in first), min(b["l"] for b in first)


def simulate(desk, symbol: str, qty: int | None = None, stop: float | None = None, entry: float | None = None,
             gap_pct: float = 1.0) -> dict:
    m, cfg = desk.market, desk.cfg
    sym = (symbol or "").upper().strip()
    if not sym or sym not in set(m.symbols()):
        raise WhatIfError(f"{symbol!r} is not in the NSE universe I have bars for")
    px = entry or m.price(sym)
    if not px:
        raise WhatIfError(f"no price for {sym} yet")
    bars = m.bars(sym, include_forming=True)
    stop_rule = "given"
    if stop is None:
        orr = opening_range(bars)
        if orr and orr[0] > orr[1]:
            stop, stop_rule = round((orr[0] + orr[1]) / 2, 2), "opening-range midpoint"
        if stop is None or stop >= px:
            stop, stop_rule = round(px * 0.985, 2), "1.5% below the price"
    if stop >= px:
        raise WhatIfError(f"the stop ({stop}) must be below the entry ({px:.2f}) for a long trade")
    risk_ps = px - stop
    costs = cfg.get("meridian_costs")
    budget = float(cfg["budget"])
    acct = desk.exchange.account()
    ru = desk.risk_used()
    remaining_day = max(0.0, ru["daily_limit"] - ru["committed"])

    caps = {
        "max loss per trade": math.floor(float(cfg["max_loss_per_trade_usd"]) / risk_ps),
        "daily loss left": math.floor(remaining_day / risk_ps),
        "position cap": math.floor(budget * float(cfg.get("max_position_pct", 75)) / 100 / px),
        "max order": math.floor(float(cfg.get("max_order_usd", budget)) / px),
        "cash buffer": math.floor(max(0.0, acct["cash"] - budget * float(cfg.get("cash_buffer_pct", 10)) / 100) / px),
    }
    binding = min(caps, key=caps.get)
    allowed = max(0, caps[binding])
    q = int(qty) if qty else allowed
    if q <= 0:
        raise WhatIfError("quantity must be at least 1")

    def scenario(exit_px: float) -> dict:
        buy, sell = order_charges("buy", px, q, costs), order_charges("sell", exit_px, q, costs)
        gross = (exit_px - px) * q
        return {"exit": round(exit_px, 2), "gross": round(gross, 2), "charges": round(buy["total"] + sell["total"], 2),
                "net": round(gross - buy["total"] - sell["total"], 2)}

    target = round(px + risk_ps * float(cfg.get("min_reward_risk", 1.0)), 2)
    stop_case, gap_case, target_case = scenario(stop), scenario(stop * (1 - gap_pct / 100)), scenario(target)
    max_loss = round(risk_ps * q, 2)
    breaches = [name for name, cap in caps.items() if q > cap]
    trades_left = ru["max_trades"] - ru["trades_used"]
    if trades_left <= 0:
        breaches.append("trades per day")
    verdict = "PASS" if not breaches else "BLOCK"
    why = (f"{q} {sym} risks {inr(max_loss)} to the stop, within every limit." if verdict == "PASS" else
           f"{q} {sym} breaks {', '.join(breaches)}; the most I'd allow is {allowed} shares ({binding} binds).")
    warnings = []
    if stop_case["charges"] > 0.25 * max(max_loss, 1):
        warnings.append(f"charges ({inr(stop_case['charges'])}) are {stop_case['charges'] / max(max_loss, 1) * 100:.0f}% of "
                        f"the risk: the stop is too tight to pay for the round trip")
    if target_case["net"] <= 0:
        warnings.append("even hitting a 1R target loses money after charges")
    if risk_ps / px < 0.003:
        warnings.append(f"the stop is only {risk_ps / px * 100:.2f}% away; normal noise can hit it")
    return {
        "warnings": warnings,
        "symbol": sym, "name": m.name(sym), "qty": q, "entry": round(px, 2), "stop": stop, "stop_rule": stop_rule,
        "target": target, "risk_per_share": round(risk_ps, 2), "max_loss": max_loss,
        "notional": round(px * q, 2), "pct_of_budget": round(px * q / budget * 100, 1),
        "pct_of_daily_limit": round(max_loss / ru["daily_limit"] * 100, 1) if ru["daily_limit"] else None,
        "caps": caps, "binding": binding, "max_allowed": allowed, "verdict": verdict, "breaches": breaches,
        "scenarios": {"stop": stop_case, f"gap {gap_pct:g}% through stop": gap_case, "target (1R)": target_case},
        "why": why, "note": "Simulation only: no ticket was created. The Risk gate re-checks everything at order time.",
    }


def speak(r: dict) -> str:
    gap_key = next(k for k in r["scenarios"] if k.startswith("gap"))
    return (f"What-if {r['qty']} {r['symbol']} at {r['entry']}: stop {r['stop']} ({r['stop_rule']}), max loss "
            f"{inr(r['max_loss'])}, or {inr(-r['scenarios'][gap_key]['net'])} if it gaps through. "
            f"{'It would pass the gate.' if r['verdict'] == 'PASS' else 'The gate would block it: ' + ', '.join(r['breaches']) + '.'} "
            f"Largest size allowed: {r['max_allowed']} shares, {r['binding']} binds. "
            + (f"Careful: {r['warnings'][0]}. " if r.get("warnings") else "") + "Nothing was placed.")
