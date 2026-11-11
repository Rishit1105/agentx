"""Strategist: picks or adapts the strategy (blueprint 8.3).

score(s) = 0.45*evidence(s) + 0.25*fit(s, features) + 0.15*risk_headroom - 0.15*news_penalty
evidence(s) = clamp(expectancy_R(s, last 60 sessions) / 0.5, -1, 1), only when N >= 30 trades (else 0, flagged)
Choose argmax score(s) such that the gate passes; if none passes -> "no trade today".
"""
from __future__ import annotations

from datetime import datetime

from ..clock import NY, clock
from ..market import market
from . import backtester as bt


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


class Strategist:
    def __init__(self):
        self.cache: dict[tuple, dict] = {}
        self.demoted: dict[str, str] = {}   # strategy -> reason (for today)
        self.active: str | None = None

    def evidence(self, symbol: str, strategy: str, cfg: dict) -> dict:
        key = (symbol, strategy, clock.today())
        if key not in self.cache:
            self.cache[key] = bt.run_backtest(symbol, strategy, cfg)
        return self.cache[key]

    def features(self, symbol: str, scan_hit: dict | None, news_tags: list[str], recent_stops: int) -> dict:
        bars = market.bars(symbol)
        prev_close = market.prev_close(symbol)
        f = {"hit_type": (scan_hit or {}).get("setups", ["orb"])[0] if scan_hit else None,
             "gap_pct": None, "atr_pct": None, "rel_volume": None, "news_tags": news_tags,
             "minutes_since_open": max(0, clock.minutes() - (9 * 60 + 30)), "recent_stops": recent_stops,
             "market_trend": self.breadth()}
        if bars:
            if prev_close:
                f["gap_pct"] = round((bars[0]["o"] / prev_close - 1) * 100, 2)
            f["atr_pct"] = round(bt.atr(bars) / bars[-1]["c"] * 100, 3)
            hist = market.sessions_5m(symbol, 20)
            if hist:
                lvl = max(b["h"] for b in hist[-1])
                f["prior_high"] = round(lvl, 2)
                f["dist_to_level_pct"] = round((lvl / bars[-1]["c"] - 1) * 100, 2)
            n = len(bars)
            if hist:
                avg = sum(sum(b["v"] for b in s[:n]) for s in hist) / len(hist)
                f["rel_volume"] = round(sum(b["v"] for b in bars) / avg, 2) if avg else None
            elif n > 3:
                or_avg = sum(b["v"] for b in bars[:3]) / 3
                f["rel_volume"] = round((sum(b["v"] for b in bars[3:]) / (n - 3)) / or_avg * 2, 2) if or_avg else None
        return f

    def breadth(self) -> dict:
        """Market trend proxy: share of the replay universe trading above its open (SPY is not in the fixtures)."""
        up = total = 0
        for s in market.symbols()[:250]:
            b = market.bars(s)
            if b:
                total += 1
                up += b[-1]["c"] > b[0]["o"]
        pct = round(up / total * 100, 1) if total else None
        return {"pct_above_open": pct, "regime": None if pct is None else "risk-on" if pct >= 60 else
                "risk-off" if pct <= 40 else "mixed"}

    def fit(self, s: str, f: dict) -> tuple[float, list[str]]:
        why, x = [], 0.0
        late = f["minutes_since_open"] > 120  # after 11:15 IST the opening range is stale
        if s == "orb":
            if f.get("hit_type") == "orb":
                x += 0.4; why.append("the scanner flagged an opening-range breakout")
            if (f.get("gap_pct") or 0) >= 1:
                x += 0.3; why.append(f"gap {f['gap_pct']:+.1f}%")
            if (f.get("rel_volume") or 0) >= 1.5:
                x += 0.3; why.append(f"relative volume {f['rel_volume']}x")
            if late:
                x -= 0.6; why.append("after 11:30 the opening range is stale")
        elif s == "level":
            if f.get("hit_type") in ("breakout", "20d_high", "level"):
                x += 0.5; why.append("near a prior high")
            x += 0.2 if late else 0.0
            if late:
                why.append("later in the day, levels beat the opening range")
            if (f.get("atr_pct") or 0) > 0.25:
                x += 0.2; why.append("enough range to clear a level")
            dist = f.get("dist_to_level_pct")
            if dist is not None and dist > 1.0:
                x -= 0.5; why.append(f"the prior high is {dist:.1f}% away")
            elif dist is not None and -0.5 <= dist <= 0.5:
                x += 0.3; why.append("price is at the prior high")
        elif s == "bounce":
            if (f.get("gap_pct") or 0) <= -1:
                x += 0.6; why.append(f"gapped down {f['gap_pct']:.1f}%")
            else:
                x -= 0.5; why.append("no oversold gap today")
        if (f.get("market_trend") or {}).get("regime") == "risk-off" and s != "bounce":
            x -= 0.2; why.append("breadth is risk-off")
        return clamp(x, -1, 1), why

    def pick(self, symbol: str, cfg: dict, *, scan_hit: dict | None = None, news_tags: list[str] | None = None,
             committed: float = 0.0, recent_stops: int = 0) -> dict:
        symbol = symbol.upper()
        f = self.features(symbol, scan_hit, news_tags or [], recent_stops)
        headroom = clamp(1 - committed / float(cfg["max_daily_loss_usd"]), 0, 1)
        unresolved = any(t in ("earnings", "deal", "offering", "guidance") for t in (news_tags or []))
        rows = []
        for s in ("orb", "level", "bounce"):
            rep = self.evidence(symbol, s, cfg)
            st = rep.get("strategy_stats") or {}
            n = st.get("trades") or 0
            exp = st.get("expectancy_r")
            ev = clamp((exp or 0) / 0.5, -1, 1) if n >= 30 else 0.0
            ft, why = self.fit(s, f)
            pen = 0.3 if unresolved else 0.0
            score = round(0.45 * ev + 0.25 * ft + 0.15 * headroom - 0.15 * pen, 3)
            gate_ok, gate_why = True, ""
            if rep.get("error"):
                gate_ok, gate_why = (s == "orb"), "no history; evidence unknown"
            elif n >= 30 and exp is not None and exp < -0.1:
                gate_ok, gate_why = False, f"negative expectancy {exp:+.2f}R over {n} trades"
            elif n < 10:
                gate_ok, gate_why = (s == "orb" and f.get("hit_type") == "orb"), f"only {n} past signals"
            if s in self.demoted:
                gate_ok, gate_why = False, self.demoted[s]
            rows.append({"id": s, "label": bt.STRATEGIES[s]["label"], "score": score, "evidence": round(ev, 3),
                         "fit": ft, "risk_headroom": round(headroom, 3), "news_penalty": pen,
                         "trades": n, "expectancy_r": exp, "gate": gate_ok, "gate_reason": gate_why,
                         # live plans use the documented defaults; tuned params stay evidence in the report only
                         "fit_reasons": why, "params": bt.STRATEGIES[s]["default"],
                         "tuned_params": (rep.get("strategy") or {}).get("params"),
                         "verdict": rep.get("verdict")})
        rows.sort(key=lambda r: r["score"], reverse=True)
        chosen = next((r for r in rows if r["gate"]), None)
        self.active = chosen["id"] if chosen else None
        reason = (f"{chosen['label']}: score {chosen['score']:+.2f}; " + ", ".join(chosen["fit_reasons"][:3])
                  if chosen else "no strategy passes its gate today, so the honest answer is no trade")
        return {"symbol": symbol, "as_of": clock.label(), "features": f, "ranked": rows,
                "chosen": chosen["id"] if chosen else None, "params": chosen["params"] if chosen else None,
                "reason": reason, "demoted": dict(self.demoted)}

    def after_exit(self, leg: str, consecutive_stops: int):
        if leg == "stop" and consecutive_stops >= 2 and self.active:
            self.demoted[self.active] = f"demoted for today after {consecutive_stops} stops in a row (regime says chop)"
            return self.active
        return None


_ = (datetime, NY)
