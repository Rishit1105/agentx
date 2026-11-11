"""Backtester: replays the strategy rules on the last 60 sessions of 5-minute bars, with costs, against buy-and-hold
of the same symbol and SPY. Applies the edge gate and a chronological split (first 40 select, last 20 confirm).

The ORB rule mirrors trader-entry / trader-exit / trader-timemachine exactly (first 5-minute close above the
15-minute range inside the entry window; stop at the range midpoint rounded down; target n x R; flat by 15:55).
`tests/test_backtester.py` proves equivalence against the Time Machine's own history on the TSLA fixture.
"""
from __future__ import annotations

import math
import statistics
from datetime import datetime

from ..clock import IST as NY
from ..costs import order_charges, slippage
from ..market import market

STRATEGIES = {
    "orb": {"label": "Opening-range breakout", "grid": [{"stop": "or_mid", "target_r": r} for r in (1.0, 1.5, 2.0)]
            + [{"stop": "or_low", "target_r": r} for r in (1.0, 1.5, 2.0)], "default": {"stop": "or_mid", "target_r": 1.0}},
    "level": {"label": "Level breakout (prior-day high)", "grid": [{"atr_k": k, "target_r": r} for k in (1.5, 2.0)
              for r in (1.0, 1.5, 2.0)], "default": {"atr_k": 1.5, "target_r": 1.5}},
    "bounce": {"label": "Oversold bounce", "grid": [{"target_r": r} for r in (1.0, 1.5, 2.0)],
               "default": {"target_r": 1.0}},
}


def _hm(epoch: int, plus: int = 0) -> int:
    d = datetime.fromtimestamp(epoch + plus, NY)
    return d.hour * 60 + d.minute


def _mm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def floor_cent(x: float) -> float:
    return math.floor(x * 100 + 1e-9) / 100.0


def round_cent(x: float) -> float:
    return math.floor(x * 100 + 0.5 + 1e-9) / 100.0


def atr(bars: list[dict], n: int = 14) -> float:
    trs = []
    for i in range(1, len(bars)):
        p = bars[i - 1]["c"]
        b = bars[i]
        trs.append(max(b["h"] - b["l"], abs(b["h"] - p), abs(b["l"] - p)))
    trs = trs[-n:]
    return sum(trs) / len(trs) if trs else 0.0


# ---------------------------------------------------------------- signal generation (one session)
def signal(strategy: str, bars: list[dict], params: dict, cfg: dict, prev: list[dict] | None = None) -> dict | None:
    """Return {i, entry, stop, target, label} for the first trigger in the session, or None."""
    if len(bars) < 4:
        return None
    start, stop_after = _mm(cfg.get("no_entries_before", "09:45")), _mm(cfg.get("no_entries_after", "15:30"))
    or_hi = max(b["h"] for b in bars[:3])
    or_lo = min(b["l"] for b in bars[:3])
    tr = params.get("target_r", 1.0)
    if strategy == "orb":
        for i in range(3, len(bars)):
            close_t = _hm(bars[i]["t"], 300)
            if close_t < start:
                continue
            if close_t > stop_after:
                return None
            if bars[i]["c"] > or_hi:
                entry = round_cent(bars[i]["c"])
                stop = floor_cent((or_hi + or_lo) / 2) if params.get("stop", "or_mid") == "or_mid" else floor_cent(or_lo)
                if stop >= entry:
                    return None
                return {"i": i, "entry": entry, "stop": stop, "target": round_cent(entry + tr * (entry - stop)),
                        "or_high": or_hi, "or_low": or_lo}
        return None
    if strategy == "level":
        if not prev:
            return None
        level = max(b["h"] for b in prev)
        for i in range(3, len(bars)):
            close_t = _hm(bars[i]["t"], 300)
            if close_t < start:
                continue
            if close_t > stop_after:
                return None
            if bars[i]["c"] > level and bars[i - 1]["c"] <= level:
                entry = round_cent(bars[i]["c"])
                a = atr(bars[: i + 1]) or entry * 0.004
                stop = floor_cent(entry - params.get("atr_k", 1.5) * a)
                return {"i": i, "entry": entry, "stop": stop, "target": round_cent(entry + tr * (entry - stop)),
                        "level": level}
        return None
    if strategy == "bounce":
        if not prev:
            return None
        prev_close = prev[-1]["c"]
        if bars[0]["o"] > prev_close * 0.99:   # needs a >=1% gap down (oversold open)
            return None
        low = bars[0]["l"]
        made_ll = False
        for i in range(1, len(bars)):
            close_t = _hm(bars[i]["t"], 300)
            if bars[i]["l"] < low:
                low = bars[i]["l"]
                made_ll = True
                continue
            if close_t < start:
                continue
            if close_t > stop_after:
                return None
            if made_ll and bars[i]["h"] > bars[i - 1]["h"] and bars[i]["c"] > bars[i]["o"]:
                entry = round_cent(bars[i]["c"])
                stop = floor_cent(low - 0.01)
                if stop >= entry:
                    return None
                return {"i": i, "entry": entry, "stop": stop, "target": round_cent(entry + tr * (entry - stop)),
                        "session_low": low}
        return None
    raise ValueError(strategy)


def walk(bars: list[dict], sig: dict, flat_by: str = "15:55") -> dict:
    """Simulate exits bar by bar after the trigger bar. Stop first if one bar touches both."""
    fb = _mm(flat_by)
    for b in bars[sig["i"] + 1:]:
        if _hm(b["t"]) >= fb:
            return {"outcome": "close", "exit": b["o"], "t": b["t"]}
        if b["l"] <= sig["stop"]:
            return {"outcome": "stop", "exit": min(sig["stop"], b["o"]), "t": b["t"]}
        if b["h"] >= sig["target"]:
            return {"outcome": "target", "exit": max(sig["target"], b["o"]) if b["o"] > sig["target"] else sig["target"],
                    "t": b["t"]}
    last = bars[-1]
    return {"outcome": "close", "exit": last["c"], "t": last["t"]}


def size(entry: float, stop: float, cfg: dict, equity: float, small: bool = False) -> int:
    risk = entry - stop
    if risk <= 0:
        return 0
    max_loss = float(cfg["max_loss_per_trade_usd"]) * (0.5 if small else 1.0)
    caps = [math.floor(max_loss / risk + 1e-9),
            math.floor(equity * float(cfg["max_position_pct"]) / 100 / entry + 1e-9),
            math.floor(float(cfg["max_order_usd"]) / entry + 1e-9),
            math.floor(equity * (1 - float(cfg["cash_buffer_pct"]) / 100) / entry + 1e-9)]
    return max(0, min(caps))


# ---------------------------------------------------------------- full run
def simulate(sessions: list[list[dict]], strategy: str, params: dict, cfg: dict, costs: dict, capital: float):
    trades, equity, days = [], capital, []
    slip = slippage(costs)
    bars_in = 0
    for k, s in enumerate(sessions):
        prev = sessions[k - 1] if k > 0 else None
        date = datetime.fromtimestamp(s[0]["t"], NY).strftime("%Y-%m-%d")
        sig = signal(strategy, s, params, cfg, prev)
        pnl = 0.0
        if sig:
            ex = walk(s, sig, cfg.get("flat_by", "15:55"))
            qty = size(sig["entry"], sig["stop"], cfg, equity, small=(strategy == "bounce"))
            if qty > 0:
                fill_in = sig["entry"] * (1 + slip)
                fill_out = ex["exit"] * (1 - slip) if ex["outcome"] != "target" else ex["exit"]
                gross = (fill_out - fill_in) * qty
                fee = order_charges("buy", fill_in, qty, costs)["total"] + order_charges("sell", fill_out, qty, costs)["total"]
                pnl = gross - fee
                risk = (sig["entry"] - sig["stop"]) * qty
                r = round(pnl / risk, 3) if risk > 0 else 0
                held = sum(1 for b in s if s[sig["i"]]["t"] < b["t"] <= ex["t"])
                bars_in += max(1, held)
                trades.append({"date": date, "time": datetime.fromtimestamp(s[sig["i"]]["t"] + 300, NY).strftime("%H:%M"),
                               "entry": sig["entry"], "stop": sig["stop"], "target": sig["target"],
                               "exit": round(ex["exit"], 2), "qty": qty, "pnl": round(pnl, 2), "r": r,
                               "raw_r": round((ex["exit"] - sig["entry"]) / (sig["entry"] - sig["stop"]), 3),
                               "reason": ex["outcome"]})
        equity += pnl
        days.append({"date": date, "equity": round(equity, 2), "pnl": round(pnl, 2)})
    total_bars = sum(len(s) for s in sessions) or 1
    return trades, days, bars_in / total_bars


def metrics(days: list[dict], capital: float, trades: list[dict] | None = None, tim: float | None = None) -> dict:
    eq = [capital] + [d["equity"] for d in days]
    rets = [(eq[i] / eq[i - 1] - 1) for i in range(1, len(eq)) if eq[i - 1]]
    net = (eq[-1] / capital - 1) * 100 if capital else 0
    vol = statistics.pstdev(rets) if len(rets) > 1 else 0
    sharpe = (statistics.mean(rets) / vol * math.sqrt(252)) if vol > 0 else None
    peak, mdd = eq[0], 0.0
    underwater = []
    for v in eq:
        peak = max(peak, v)
        dd = (v / peak - 1) * 100 if peak else 0
        mdd = min(mdd, dd)
        underwater.append(round(dd, 3))
    out = {"net_return_pct": round(net, 3), "volatility_pct": round(vol * 100, 3),
           "sharpe": round(sharpe, 2) if sharpe is not None else None, "max_dd_pct": round(mdd, 3),
           "worst_day": round(min((d["pnl"] for d in days), default=0), 2), "underwater": underwater}
    if trades is not None:
        wins = [t for t in trades if t["pnl"] > 0]
        losses = [t for t in trades if t["pnl"] <= 0]
        gw, gl = sum(t["pnl"] for t in wins), -sum(t["pnl"] for t in losses)
        out.update({"trades": len(trades), "win_rate": round(len(wins) / len(trades) * 100, 1) if trades else None,
                    "profit_factor": round(gw / gl, 2) if gl > 0 else (None if not wins else 99.0),
                    "expectancy_r": round(statistics.mean(t["r"] for t in trades), 3) if trades else None,
                    "avg_win": round(gw / len(wins), 2) if wins else None,
                    "avg_loss": round(-gl / len(losses), 2) if losses else None,
                    "time_in_market_pct": round((tim or 0) * 100, 1),
                    "targets": sum(1 for t in trades if t["reason"] == "target"),
                    "stops": sum(1 for t in trades if t["reason"] == "stop"),
                    "closes": sum(1 for t in trades if t["reason"] == "close")})
    return out


def hold_curve(sessions, capital, costs) -> tuple[list[dict], dict]:
    first = sessions[0][0]["o"]
    qty = math.floor(capital / first)
    cash = capital - qty * first - order_charges("buy", first, qty, costs)["total"]
    days = [{"date": datetime.fromtimestamp(s[0]["t"], NY).strftime("%Y-%m-%d"), "equity": round(cash + qty * s[-1]["c"], 2),
             "pnl": 0} for s in sessions]
    return days, metrics(days, capital)


def run_backtest(symbol: str, strategy: str, cfg: dict, sessions_n: int = 60, params: dict | None = None) -> dict:
    symbol = symbol.upper()
    costs = cfg.get("meridian_costs", {})
    capital = float(cfg["budget"])
    gate_cfg = cfg.get("meridian_backtest_gate", {"min_trades": 30, "min_expectancy_r": 0.0})
    sessions = [s for s in market.sessions_5m(symbol, sessions_n) if len(s) >= 60]
    if len(sessions) < 10:
        return {"symbol": symbol, "error": f"not enough 5-minute history for {symbol} ({len(sessions)} sessions)",
                "verdict": "no data"}
    spec = STRATEGIES[strategy]
    # chronological split: select params on the first 2/3, confirm on the last 1/3; never tune on confirm
    cut = int(len(sessions) * 2 / 3)
    sel, conf = sessions[:cut], sessions[cut:]
    tournament = []
    for p in spec["grid"][:6]:
        t, d, _ = simulate(sel, strategy, p, cfg, costs, capital)
        m = metrics(d, capital, t)
        tournament.append({"params": p, "trades": m["trades"], "expectancy_r": m["expectancy_r"],
                           "net_return_pct": m["net_return_pct"]})
    chosen = params or max(tournament, key=lambda x: (x["expectancy_r"] is not None, x["expectancy_r"] or -9))["params"]
    trades, days, tim = simulate(sessions, strategy, chosen, cfg, costs, capital)
    stats = metrics(days, capital, trades, tim)
    ct, cd, _ = simulate(conf, strategy, chosen, cfg, costs, capital)
    confirm = metrics(cd, capital, ct)
    hold_days, hold = hold_curve(sessions, capital, costs)
    window = {"from": days[0]["date"], "to": days[-1]["date"], "sessions": len(sessions)}
    idx_days = market.daily_closes("NIFTY50", window["from"], window["to"])
    spy = None
    spy_curve = []
    if idx_days and len(idx_days) > 5:
        base = next((c for d, c in idx_days if d >= window["from"]), idx_days[0][1])
        m = {d: c for d, c in idx_days}
        last = base
        for d in days:
            last = m.get(d["date"], last)
            spy_curve.append(round(capital * last / base, 2))
        spy = metrics([{"date": d["date"], "equity": v, "pnl": 0} for d, v in zip(days, spy_curve)], capital)
    # edge gate
    reasons = []
    if stats["trades"] < gate_cfg.get("min_trades", 30):
        reasons.append(f"trades {stats['trades']} < {gate_cfg.get('min_trades', 30)}")
    if (stats["expectancy_r"] or 0) <= gate_cfg.get("min_expectancy_r", 0.0):
        reasons.append(f"expectancy {stats['expectancy_r']}R after costs is not above 0")
    dd_adj = stats["net_return_pct"] / abs(stats["max_dd_pct"]) if stats["max_dd_pct"] else stats["net_return_pct"]
    hold_adj = hold["net_return_pct"] / abs(hold["max_dd_pct"]) if hold["max_dd_pct"] else hold["net_return_pct"]
    if gate_cfg.get("beat_hold_on_dd_adjusted", True) and dd_adj <= hold_adj:
        reasons.append(f"drawdown-adjusted return {dd_adj:.2f} does not beat buy-and-hold {hold_adj:.2f}")
    passed = not reasons
    exp = stats["expectancy_r"] or 0
    if passed:
        verdict = f"demonstrated edge: {stats['trades']} trades, expectancy {exp:+.2f}R after costs, beats buy-and-hold on a drawdown-adjusted basis"
    elif stats["trades"] and abs(exp) < 0.1:
        verdict = f"no demonstrated edge: close to break-even ({exp:+.2f}R per trade over {stats['trades']} trades)"
    elif exp < 0:
        verdict = f"no demonstrated edge: negative expectancy ({exp:+.2f}R per trade over {stats['trades']} trades)"
    else:
        verdict = "no demonstrated edge: " + reasons[0]
    hist = {}
    for t in trades:
        b = max(-1.5, min(2.5, math.floor(t["r"] * 4) / 4))
        hist[b] = hist.get(b, 0) + 1
    return {
        "symbol": symbol, "window": window, "strategy": {"id": strategy, "label": spec["label"], "params": chosen},
        "costs": costs, "capital": capital, "strategy_stats": stats, "buy_hold": hold, "index_hold": spy, "index_name": "NIFTY 50",
        "confirm_segment": {"sessions": len(conf), **{k: confirm.get(k) for k in
                            ("trades", "expectancy_r", "net_return_pct", "win_rate")}},
        "tournament": tournament,
        "equity": {"t": [d["date"] for d in days], "strategy": [d["equity"] for d in days],
                   "buy_hold": [d["equity"] for d in hold_days], "index": spy_curve or None,
                   "underwater": stats["underwater"][1:], "hold_underwater": hold["underwater"][1:]},
        "r_hist": [{"r": k, "n": v} for k, v in sorted(hist.items())],
        "trades": trades,
        "gate": {"min_trades": gate_cfg.get("min_trades", 30), "passed": passed, "reasons": reasons},
        "verdict": verdict,
        "data_note": ("NIFTY 50 benchmark unavailable" if spy is None else "NIFTY 50 (^NSEI) daily closes"),
        "currency": "INR", "market": "NSE",
    }
