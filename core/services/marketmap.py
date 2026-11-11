"""Market map: sector heatmap + breadth for the NIFTY 500, computed from the same bars the agents trade on.

Feeds the Command Deck heatmap and the Conductor's "how are sectors doing?" answer. Recomputed at most once per
virtual minute (the replay can run at 60x), so the UI can poll it cheaply.
"""
from __future__ import annotations

from statistics import median

from ..clock import clock


class MarketMap:
    def __init__(self, market):
        self.market = market
        self._key: tuple | None = None
        self._cache: dict | None = None

    def snapshot(self) -> dict:
        now = clock.now()
        key = (clock.today(), now.hour, now.minute)
        if key == self._key and self._cache:
            return self._cache
        self._cache = self._build()
        self._key = key
        return self._cache

    def _build(self) -> dict:
        m = self.market
        rows = []
        for sym in m.symbols():
            bars = m.bars(sym, include_forming=True)
            prev = m.prev_close(sym)
            if not bars or not prev:
                continue
            px = bars[-1]["c"]
            value = sum(b["c"] * b["v"] for b in bars)            # traded value so far today, ₹
            rows.append({"symbol": sym, "name": m.name(sym), "sector": m.industries.get(sym) or "Other",
                         "price": round(px, 2), "chg": round((px / prev - 1) * 100, 2), "value": round(value)})
        sectors: dict[str, list[dict]] = {}
        for r in rows:
            sectors.setdefault(r["sector"], []).append(r)
        out = []
        for name, items in sectors.items():
            items.sort(key=lambda r: -r["value"])
            chgs = [r["chg"] for r in items]
            tot = sum(r["value"] for r in items) or 1
            out.append({
                "sector": name, "count": len(items), "value": sum(r["value"] for r in items),
                "chg": round(sum(r["chg"] * r["value"] for r in items) / tot, 2),   # value-weighted move
                "median": round(median(chgs), 2), "adv": sum(1 for c in chgs if c > 0),
                "dec": sum(1 for c in chgs if c < 0),
                "leader": max(items, key=lambda r: r["chg"])["symbol"], "laggard": min(items, key=lambda r: r["chg"])["symbol"],
                "stocks": items[:12],
            })
        out.sort(key=lambda s: -s["value"])
        adv = sum(1 for r in rows if r["chg"] > 0)
        dec = sum(1 for r in rows if r["chg"] < 0)
        idx = m.price("NIFTY50")
        idx_prev = m.prev_close("NIFTY50")
        movers = sorted(rows, key=lambda r: -r["chg"])
        return {
            "as_of": clock.label(), "stocks": len(rows), "advancers": adv, "decliners": dec,
            "unchanged": len(rows) - adv - dec, "ad_ratio": round(adv / dec, 2) if dec else None,
            "nifty": {"price": idx, "chg": round((idx / idx_prev - 1) * 100, 2) if idx and idx_prev else None},
            "sectors": out, "gainers": movers[:6], "losers": movers[-6:][::-1],
            "mood": _mood(adv, dec),
        }


def _mood(adv: int, dec: int) -> str:
    if not adv and not dec:
        return "waiting for the first bar"
    r = adv / max(dec, 1)
    return ("broad rally" if r >= 2.5 else "risk-on" if r >= 1.3 else "mixed" if r >= 0.77 else
            "risk-off" if r >= 0.4 else "broad sell-off")
