"""Natural-language strategy builder: say a rule, see it backtested honestly, approve it only if it earns it.

"Buy when price closes above the 20-day high with volume over 1.5x, stop 1.5 ATR, target 2R"
    -> a structured, auditable rule spec
    -> replayed on 60 real NSE sessions of 5-minute bars with Indian charges (the same walk, sizing and metrics as the
       Backtest Lab), against buy-and-hold and the NIFTY 50
    -> the same edge gate: enough trades, positive expectancy after costs, beats buy-and-hold drawdown-adjusted
    -> only a strategy that passes the gate can be approved; approval registers it with an algo ID (MRD-CUS-NN)

The parser is deterministic (regular expressions), so the spec it shows is exactly what is tested. No LLM writes rules.
"""
from __future__ import annotations

import json
import math
import re
import uuid
from datetime import datetime

from ..clock import NY, clock
from ..market import market
from . import backtester as bt

SCHEMA = """CREATE TABLE IF NOT EXISTS custom_strategies(id TEXT PRIMARY KEY, created TEXT, name TEXT, text TEXT,
    spec TEXT, symbol TEXT, summary TEXT, status TEXT, algo_id TEXT);"""

NUM = r"(\d+(?:\.\d+)?)"


class BuilderError(ValueError):
    pass


def parse(text: str) -> dict:
    """Plain English -> rule spec. Raises BuilderError when no entry rule is recognised."""
    t = " " + text.lower().replace("×", "x").replace("–", "-") + " "
    spec: dict = {"entry": None, "volume_mult": None, "stop": {"type": "atr", "k": 1.5}, "target_r": 1.5,
                  "window": {"after": "09:30", "before": "15:00"}, "notes": []}
    if m := re.search(rf"(?:close[sd]?|breaks?|goes?|moves?|trades?)\s+(?:above|over|past)\s+(?:the\s+)?(?:prior\s+|previous\s+|last\s+)?{NUM}[-\s]*(?:day|session)s?\s+high", t):
        spec["entry"] = {"type": "n_day_high", "n": int(float(m.group(1)))}
    elif re.search(r"(?:above|over|breaks?)\s+(?:the\s+)?(?:prior|previous|yesterday'?s?)[-\s]*day'?s?\s+high", t):
        spec["entry"] = {"type": "n_day_high", "n": 1}
    elif re.search(rf"opening[-\s]range|first\s+{NUM}\s*min(?:ute)?s?|{NUM}[-\s]*min(?:ute)?\s+range", t):
        mm = re.search(rf"(?:first\s+{NUM}\s*min(?:ute)?s?|{NUM}[-\s]*min(?:ute)?\s+range)", t)
        mins = int(float(next(g for g in mm.groups() if g))) if mm else 15
        spec["entry"] = {"type": "or_breakout", "minutes": max(5, min(60, mins - mins % 5 or 15))}
    elif re.search(r"gap[s]?\s*(?:s|ped)?\s*down|oversold|bounce", t):
        gap = re.search(rf"gap[s]?\s*(?:ped)?\s*down\s+(?:by\s+|more than\s+|over\s+)?{NUM}\s*%", t) or \
            re.search(rf"{NUM}\s*%\s+gap[-\s]*down", t)
        spec["entry"] = {"type": "gap_bounce", "gap_pct": float(gap.group(1)) if gap else 1.0}
    elif m := re.search(rf"(?:above|over|crosses)\s+(?:rs\.?\s*|₹\s*)?{NUM}\b", t):
        spec["entry"] = {"type": "above_price", "price": float(m.group(1))}
    if not spec["entry"]:
        raise BuilderError("I couldn't find an entry rule. Try: 'buy when price closes above the 20-day high', "
                           "'buy the opening-range breakout', 'buy a bounce after a 1% gap down' or 'buy above 1500'")
    if m := re.search(rf"volume\s+(?:over|above|at least|>|of)?\s*{NUM}\s*x", t) or \
            re.search(rf"{NUM}\s*x\s+(?:the\s+)?(?:average\s+)?volume", t):
        spec["volume_mult"] = float(m.group(1))
    if m := re.search(rf"stop\s+(?:at\s+|of\s+|loss\s+)?{NUM}\s*(?:x\s*)?atr", t) or re.search(rf"{NUM}\s*atr\s+stop", t):
        spec["stop"] = {"type": "atr", "k": float(m.group(1))}
    elif m := re.search(rf"stop\s+(?:at\s+|of\s+|loss\s+)?{NUM}\s*%", t) or re.search(rf"{NUM}\s*%\s+stop", t):
        spec["stop"] = {"type": "pct", "pct": float(m.group(1))}
    elif re.search(r"stop\s+(?:at\s+)?(?:the\s+)?(?:range\s+)?mid(?:point)?", t):
        spec["stop"] = {"type": "or_mid"}
    elif re.search(r"stop\s+(?:at\s+|below\s+)?(?:the\s+)?(?:range|session|day'?s?)\s+low", t):
        spec["stop"] = {"type": "low"}
    if m := re.search(rf"target\s+(?:of\s+|at\s+)?{NUM}\s*(?:r\b|x\s*(?:the\s+)?risk|times)", t) or re.search(rf"{NUM}\s*r\s+target", t):
        spec["target_r"] = float(m.group(1))
    if m := re.search(r"after\s+(\d{1,2})[:.](\d{2})", t):
        spec["window"]["after"] = f"{int(m.group(1)):02d}:{m.group(2)}"
    if m := re.search(r"before\s+(\d{1,2})[:.](\d{2})", t):
        h = int(m.group(1))
        spec["window"]["before"] = f"{h + 12 if h < 8 else h:02d}:{m.group(2)}"
    if spec["target_r"] < 1:
        spec["notes"].append("a target below 1R fails the desk's minimum reward:risk; it can't be approved")
    return spec


def describe(spec: dict) -> str:
    e = spec["entry"]
    entry = {"n_day_high": lambda: f"a 5-minute close above the {e['n']}-day high",
             "or_breakout": lambda: f"a close above the first {e['minutes']} minutes' range",
             "gap_bounce": lambda: f"a higher-high bounce after a {e['gap_pct']:g}% gap down",
             "above_price": lambda: f"a close above ₹{e['price']:,.2f}"}[e["type"]]()
    vol = f", with volume over {spec['volume_mult']:g}x the session average" if spec.get("volume_mult") else ""
    st = spec["stop"]
    stop = {"atr": lambda: f"{st['k']:g} ATR below entry", "pct": lambda: f"{st['pct']:g}% below entry",
            "or_mid": lambda: "the opening-range midpoint", "low": lambda: "the session low"}[st["type"]]()
    w = spec["window"]
    return f"Buy on {entry}{vol}, between {w['after']} and {w['before']}. Stop at {stop}; target {spec['target_r']:g}R; flat by close."


# ---------------------------------------------------------------- the rule on bars
def signal(spec: dict, s: list[dict], history: list[list[dict]]) -> dict | None:
    if len(s) < 4:
        return None
    e, st = spec["entry"], spec["stop"]
    after, before = bt._mm(spec["window"]["after"]), bt._mm(spec["window"]["before"])
    vol_avg = None
    if spec.get("volume_mult"):
        vols = [b["v"] for h in history[-5:] for b in h] or [b["v"] for b in s[:6]]
        vol_avg = sum(vols) / max(1, len(vols))
    or_n = (e.get("minutes", 15) // 5) if e["type"] == "or_breakout" else 3
    or_hi, or_lo = max(b["h"] for b in s[:or_n]), min(b["l"] for b in s[:or_n])
    if e["type"] == "n_day_high":
        if len(history) < e["n"]:
            return None
        level = max(b["h"] for h in history[-e["n"]:] for b in h)
    elif e["type"] == "above_price":
        level = e["price"]
    elif e["type"] == "or_breakout":
        level = or_hi
    else:
        level = None
    if e["type"] == "gap_bounce":
        if not history or s[0]["o"] > history[-1][-1]["c"] * (1 - e["gap_pct"] / 100):
            return None
    low, made_ll = s[0]["l"], False
    for i in range(or_n if e["type"] == "or_breakout" else 1, len(s)):
        b = s[i]
        if e["type"] == "gap_bounce" and b["l"] < low:
            low, made_ll = b["l"], True
            continue
        close_t = bt._hm(b["t"], 300)
        if close_t < after:
            continue
        if close_t > before:
            return None
        if vol_avg and b["v"] < spec["volume_mult"] * vol_avg:
            continue
        hit = (made_ll and b["h"] > s[i - 1]["h"] and b["c"] > b["o"]) if e["type"] == "gap_bounce" else \
            (b["c"] > level and s[i - 1]["c"] <= level)
        if not hit:
            continue
        entry = bt.round_cent(b["c"])
        if st["type"] == "atr":
            stop = entry - st["k"] * (bt.atr(s[: i + 1]) or entry * 0.004)
        elif st["type"] == "pct":
            stop = entry * (1 - st["pct"] / 100)
        elif st["type"] == "or_mid":
            stop = (or_hi + or_lo) / 2
        else:
            stop = min(x["l"] for x in s[: i + 1]) - 0.01
        stop = bt.floor_cent(stop)
        if stop >= entry:
            return None
        return {"i": i, "entry": entry, "stop": stop, "target": bt.round_cent(entry + spec["target_r"] * (entry - stop))}
    return None


def run(symbol: str, spec: dict, cfg: dict, sessions_n: int = 60) -> dict:
    symbol = symbol.upper()
    costs, capital = cfg.get("meridian_costs", {}), float(cfg["budget"])
    sessions = [s for s in market.sessions_5m(symbol, sessions_n) if len(s) >= 60]
    if len(sessions) < 10:
        raise BuilderError(f"not enough 5-minute history for {symbol}")
    slip = bt.slippage(costs)
    trades, days, equity = [], [], capital
    for k, s in enumerate(sessions):
        date = datetime.fromtimestamp(s[0]["t"], NY).strftime("%Y-%m-%d")
        sig = signal(spec, s, sessions[max(0, k - 25):k])
        pnl = 0.0
        if sig:
            ex = bt.walk(s, sig, cfg.get("flat_by", "15:15"))
            qty = bt.size(sig["entry"], sig["stop"], cfg, equity)
            if qty > 0:
                fin = sig["entry"] * (1 + slip)
                fout = ex["exit"] * (1 - slip) if ex["outcome"] != "target" else ex["exit"]
                fee = bt.order_charges("buy", fin, qty, costs)["total"] + bt.order_charges("sell", fout, qty, costs)["total"]
                pnl = (fout - fin) * qty - fee
                risk = (sig["entry"] - sig["stop"]) * qty
                trades.append({"date": date, "time": datetime.fromtimestamp(s[sig["i"]]["t"] + 300, NY).strftime("%H:%M"),
                               "entry": sig["entry"], "stop": sig["stop"], "target": sig["target"], "exit": round(ex["exit"], 2),
                               "qty": qty, "pnl": round(pnl, 2), "r": round(pnl / risk, 3) if risk > 0 else 0,
                               "reason": ex["outcome"]})
        equity += pnl
        days.append({"date": date, "equity": round(equity, 2), "pnl": round(pnl, 2)})
    stats = bt.metrics(days, capital, trades)
    hold_days, hold = bt.hold_curve(sessions, capital, costs)
    gate_cfg = cfg.get("meridian_backtest_gate", {"min_trades": 30, "min_expectancy_r": 0.0})
    min_trades = min(gate_cfg.get("min_trades", 30), 10)     # one symbol, 60 sessions: 10 trades is the floor here
    reasons = []
    if stats["trades"] < min_trades:
        reasons.append(f"only {stats['trades']} trades in {len(sessions)} sessions (needs {min_trades})")
    if (stats["expectancy_r"] or 0) <= gate_cfg.get("min_expectancy_r", 0.0):
        reasons.append(f"expectancy {stats['expectancy_r']}R after costs is not above 0")
    dd = stats["net_return_pct"] / abs(stats["max_dd_pct"]) if stats["max_dd_pct"] else stats["net_return_pct"]
    hdd = hold["net_return_pct"] / abs(hold["max_dd_pct"]) if hold["max_dd_pct"] else hold["net_return_pct"]
    if dd <= hdd:
        reasons.append(f"drawdown-adjusted return {dd:.2f} does not beat buy-and-hold {hdd:.2f}")
    if spec["target_r"] < float(cfg.get("min_reward_risk", 1.0)):
        reasons.append(f"target {spec['target_r']}R is below the desk's minimum reward:risk")
    passed = not reasons
    exp = stats["expectancy_r"] or 0
    verdict = (f"demonstrated edge on {symbol}: {stats['trades']} trades, {exp:+.2f}R per trade after costs" if passed else
               f"no demonstrated edge on {symbol}: {reasons[0]}")
    return {"symbol": symbol, "spec": spec, "rule": describe(spec), "window": {"from": days[0]["date"], "to": days[-1]["date"],
            "sessions": len(sessions)}, "stats": {k: stats.get(k) for k in ("trades", "win_rate", "expectancy_r",
            "net_return_pct", "max_dd_pct", "sharpe", "profit_factor")},
            "buy_hold": {k: hold.get(k) for k in ("net_return_pct", "max_dd_pct")},
            "equity": {"t": [d["date"] for d in days], "strategy": [d["equity"] for d in days],
                       "buy_hold": [d["equity"] for d in hold_days]},
            "trades": trades[-25:], "gate": {"passed": passed, "reasons": reasons}, "verdict": verdict}


class Builder:
    def __init__(self, desk):
        self.desk = desk
        with desk.db.lock:
            desk.db.conn.executescript(SCHEMA)

    def test(self, text: str, symbol: str = "RELIANCE", name: str | None = None) -> dict:
        spec = parse(text)
        rep = run(symbol, spec, self.desk.cfg)
        sid = "cs_" + uuid.uuid4().hex[:8]
        status = "tested · passed gate" if rep["gate"]["passed"] else "tested · rejected"
        self.desk.db.execute("INSERT INTO custom_strategies VALUES(?,?,?,?,?,?,?,?,?)",
                             (sid, clock.now().isoformat(), (name or "").strip()[:60] or rep["rule"][:60], text,
                              json.dumps(spec), rep["symbol"], json.dumps({"verdict": rep["verdict"], "stats": rep["stats"],
                              "gate": rep["gate"]}), status, None))
        self.desk.audit.append("strategy.tested", id=sid, symbol=rep["symbol"], passed=rep["gate"]["passed"])
        return {"id": sid, "status": status, **rep}

    def list(self) -> list[dict]:
        rows = self.desk.db.query("SELECT * FROM custom_strategies ORDER BY created DESC")
        for r in rows:
            r["spec"], r["summary"] = json.loads(r["spec"]), json.loads(r["summary"])
            r["rule"] = describe(r["spec"])
        return rows

    def approve(self, sid: str) -> dict:
        r = self.desk.db.one("SELECT * FROM custom_strategies WHERE id=?", (sid,))
        if not r:
            raise BuilderError("no such strategy")
        summ = json.loads(r["summary"])
        if not summ["gate"]["passed"]:
            raise BuilderError("only a strategy that passed the edge gate can be approved: " + "; ".join(summ["gate"]["reasons"]))
        n = self.desk.db.one("SELECT COUNT(*) n FROM custom_strategies WHERE algo_id IS NOT NULL")["n"] + 1
        algo = f"MRD-CUS-{n:02d}"
        self.desk.db.execute("UPDATE custom_strategies SET status=?, algo_id=? WHERE id=?", ("approved (paper)", algo, sid))
        self.desk.audit.append("strategy.approved", id=sid, algo_id=algo)
        return {"id": sid, "status": "approved (paper)", "algo_id": algo}


_ = math
