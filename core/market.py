"""Market data for Meridian — NSE (India).

Replay: a real NSE session recorded by scripts/record_nse.py (NIFTY 100, 5-minute bars, 60 sessions incl. the
replay day). Every bar shown is real. Yahoo's NSE feed omits some bars, mostly in the 15:15-15:25 closing window;
those slots are carried forward flat at the last close with zero volume and marked "filled" (positions are flat
by 15:15, so a filled bar never produces a fill). The repo tools read the same recorded files with --offline.

Live: Yahoo's public chart endpoint with the '.NS' suffix, cached politely.
"""
from __future__ import annotations

import copy
import gzip
import json
import random
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .clock import IST, clock
from .config import CACHE, FIXTURES, GENERATED, TRADER

BAR = 300
SESSION_BARS = 75                 # NSE 09:15-15:30
OPEN_MIN, CLOSE_MIN = 9 * 60 + 15, 15 * 60 + 30
UA = {"User-Agent": "Mozilla/5.0 (Meridian paper-trading prototype)"}
INDEX = {"NIFTY50": "^NSEI", "NIFTY 50": "^NSEI", "BANKNIFTY": "^NSEBANK"}


def yahoo(sym: str) -> str:
    s = INDEX.get(sym.upper(), sym.upper())
    if not (s.startswith("^") or s.endswith(".NS")):
        s += ".NS"
    return urllib.parse.quote(s, safe="^.-")


def _read(path: Path):
    if str(path).endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return json.load(fh)
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _write(path: Path, doc, gz=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if gz:
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            json.dump(doc, fh)
    else:
        path.write_text(json.dumps(doc), encoding="utf-8")


def chart_to_bars(doc) -> list[dict]:
    r = doc["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    out = []
    for i, t in enumerate(r.get("timestamp") or []):
        o, h, l, c, v = (q[k][i] if i < len(q.get(k) or []) else None for k in ("open", "high", "low", "close", "volume"))
        if None in (o, h, l, c):
            continue
        out.append({"t": int(t), "o": float(o), "h": float(h), "l": float(l), "c": float(c), "v": int(v or 0)})
    return out


def bars_to_chart(meta: dict, bars: list[dict]) -> dict:
    m = copy.deepcopy(meta)
    if bars:
        m["regularMarketPrice"] = bars[-1]["c"]
        m["regularMarketTime"] = bars[-1]["t"] + BAR - 6
        m["regularMarketDayHigh"] = max(b["h"] for b in bars)
        m["regularMarketDayLow"] = min(b["l"] for b in bars)
        m["regularMarketVolume"] = sum(b["v"] for b in bars)
    return {"chart": {"result": [{"meta": m, "timestamp": [b["t"] for b in bars], "indicators": {"quote": [{
        "open": [round(b["o"], 4) for b in bars], "high": [round(b["h"], 4) for b in bars],
        "low": [round(b["l"], 4) for b in bars], "close": [round(b["c"], 4) for b in bars],
        "volume": [b["v"] for b in bars]}]}}], "error": None}}


def session_open_epoch(date: str) -> int:
    return int(datetime.strptime(date, "%Y-%m-%d").replace(hour=9, minute=15, tzinfo=IST).timestamp())


def slot_of(t: int) -> int:
    d = datetime.fromtimestamp(t, IST)
    return ((d.hour * 60 + d.minute) - OPEN_MIN) // 5


def by_session(bars: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for b in bars:
        d = datetime.fromtimestamp(b["t"], IST)
        if OPEN_MIN <= d.hour * 60 + d.minute < CLOSE_MIN:
            out.setdefault(d.strftime("%Y-%m-%d"), []).append(b)
    return out


def fill_session(date: str, bars: list[dict], upto: int = SESSION_BARS) -> list[dict]:
    """Forward-fill missing 5-minute slots (Yahoo NSE gaps) as flat zero-volume bars marked 'filled'."""
    o0 = session_open_epoch(date)
    have = {slot_of(b["t"]): b for b in bars}
    out, last = [], None
    for k in range(upto):
        b = have.get(k)
        if b is None:
            if last is None:
                continue
            b = {"t": o0 + k * BAR, "o": last["c"], "h": last["c"], "l": last["c"], "c": last["c"], "v": 0, "filled": True}
        out.append(b)
        last = b
    return out


class Market:
    def __init__(self):
        self.date: str | None = None
        self.dir: Path | None = None
        self.session: dict[str, list[dict]] = {}
        self.meta: dict[str, dict] = {}
        self.history: dict[str, list[list[dict]]] = {}
        self.names: dict[str, str] = {}
        self.industries: dict[str, str] = {}
        self.synthetic_from: dict[str, str] = {}
        self.filled: dict[str, int] = {}

    # ------------------------------------------------------------------ replay setup
    def prepare_replay(self, date: str = "2026-11-11") -> dict:
        self.date = date
        self.dir = GENERATED / date
        (self.dir / "quotes").mkdir(parents=True, exist_ok=True)
        try:
            man = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
            self.names, self.industries = man.get("names", {}), man.get("industries", {})
        except (OSError, ValueError):
            man = {}
        self.session, self.history, self.meta, self.filled = {}, {}, {}, {}
        for f in sorted((FIXTURES / "charts60").glob("*.json.gz")):
            sym = f.name[: -len(".json.gz")]
            try:
                doc = _read(f)
                bars = chart_to_bars(doc)
            except Exception:
                continue
            days = by_session(bars)
            if date not in days:
                continue
            today = fill_session(date, days[date])
            if len(today) < 3:
                continue
            self.session[sym] = today
            self.filled[sym] = sum(1 for b in today if b.get("filled"))
            self.history[sym] = [fill_session(d, s) for d, s in sorted(days.items()) if d < date and len(s) >= 60]
            m = doc["chart"]["result"][0]["meta"]
            self.meta[sym] = m
        if "NIFTY50" in self.session:
            self.names.setdefault("NIFTY50", "NIFTY 50 index")
        return {"date": date, "symbols": len(self.session), "synthetic_from": None, "market": "NSE",
                "recorded_at": man.get("recorded_at"), "dir": str(self.dir),
                "filled_bars": sum(self.filled.values())}

    def offline_paths(self) -> dict:
        if clock.mode != "replay" or not self.dir:
            return {}
        return {"charts": str(FIXTURES / "charts60"), "wall": str(FIXTURES / "charts60"),
                "tm_dir": str(FIXTURES / "charts60"), "news": str(FIXTURES / "news"),
                "analyst": str(FIXTURES / "fundamentals"), "deals": str(FIXTURES / "nse"), "quotes": str(self.dir / "quotes")}

    # ------------------------------------------------------------------ reads
    def symbols(self) -> list[str]:
        return sorted(s for s in self.session if s != "NIFTY50")

    def name(self, sym: str) -> str:
        return self.names.get(sym.upper(), sym.upper())

    def bars(self, sym: str, include_forming: bool = False) -> list[dict]:
        sym = sym.upper()
        if clock.mode == "replay":
            now = clock.now().timestamp()
            full = self.session.get(sym, [])
            out = [b for b in full if b["t"] + BAR <= now]
            if include_forming:
                f = self._forming(full, now)
                if f:
                    out.append(f)
            return out
        return self._live_bars(sym)

    def _forming(self, full, now):
        for b in full:
            if b["t"] <= now < b["t"] + BAR:
                frac = (now - b["t"]) / BAR
                c = b["o"] + (b["c"] - b["o"]) * frac
                return {"t": b["t"], "o": b["o"], "h": max(b["o"], c, b["o"] + (b["h"] - b["o"]) * frac),
                        "l": min(b["o"], c, b["o"] - (b["o"] - b["l"]) * frac), "c": round(c, 2),
                        "v": int(b["v"] * frac), "forming": True}
        return None

    def price(self, sym: str) -> float | None:
        b = self.bars(sym, include_forming=True)
        return b[-1]["c"] if b else None

    def quote_time(self, sym: str) -> float | None:
        b = self.bars(sym, include_forming=True)
        if not b:
            return None
        return clock.now().timestamp() if clock.mode == "replay" else b[-1]["t"] + BAR

    def prev_close(self, sym: str) -> float | None:
        sym = sym.upper()
        h = self.history.get(sym)
        if h:
            return h[-1][-1]["c"]
        m = self.meta.get(sym) or {}
        return m.get("chartPreviousClose") or m.get("previousClose")

    def is_synthetic(self, sym: str) -> bool:
        return False

    def write_prices(self, symbols: list[str]) -> dict:
        """trader/prices.json in the alerts tool's format: delayed quote = last completed bar's close."""
        path = TRADER / "prices.json"
        try:
            old = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            old = {}
        prices, detail = dict(old.get("prices", {})), dict(old.get("detail", {}))
        stamp = clock.utc_iso()
        for s in symbols:
            done = self.bars(s)
            if not done:
                continue
            prices[s] = round(done[-1]["c"], 2)
            detail[s] = {"prev_close": self.prev_close(s), "time": iso_utc(done[-1]["t"] + BAR),
                         "source": "meridian-replay" if clock.mode == "replay" else "yahoo", "fetched": stamp}
        doc = {"as_of": stamp, "source": "meridian", "note": "Delayed quotes for alerts and sizing checks. "
               "The exchange's price is the one that fills. detail.fetched is when each price was read.",
               "prices": prices, "detail": detail}
        path.write_text(json.dumps(doc, indent=2), encoding="utf-8")
        return doc

    def write_quote_files(self, symbols: list[str]):
        if not self.dir:
            return
        for s in symbols:
            bars = self.bars(s, include_forming=True)
            if bars and s in self.meta:
                _write(self.dir / "quotes" / f"yahoo-{s}.json", bars_to_chart(self.meta[s], bars))

    # ------------------------------------------------------------------ history (backtests)
    def sessions_5m(self, sym: str, n: int = 60) -> list[list[dict]]:
        sym = sym.upper()
        hist = self.history.get(sym) if sym in self.history else self._live_history(sym)
        return (hist or [])[-n:]

    def daily_closes(self, sym: str, start: str, end: str) -> list[tuple[str, float]] | None:
        """Daily closes; 'NIFTY50' is the market benchmark (^NSEI)."""
        sym = sym.upper()
        try:
            if clock.mode == "replay" and sym == "NIFTY50" and (FIXTURES / "daily" / "NIFTY50.json").exists():
                doc = _read(FIXTURES / "daily" / "NIFTY50.json")
            else:
                doc = self._fetch(sym, "1d", "1y", ttl=3600)
            out = []
            for b in chart_to_bars(doc):
                d = datetime.fromtimestamp(b["t"], IST).strftime("%Y-%m-%d")
                if start <= d <= end:
                    out.append((d, b["c"]))
            return out or None
        except Exception:
            return None

    # ------------------------------------------------------------------ live (Yahoo, NSE)
    def _fetch(self, sym: str, interval: str, rng: str, ttl: float = 30) -> dict:
        key = f"{sym}-{interval}-{rng}".replace("^", "_").replace("&", "_")
        path = CACHE / f"yahoo-{key}.json"
        if path.exists() and time.time() - path.stat().st_mtime < ttl:
            return json.loads(path.read_text(encoding="utf-8"))
        url = (f"https://query2.finance.yahoo.com/v8/finance/chart/{yahoo(sym)}?interval={interval}&range={rng}"
               "&includePrePost=false")
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=12) as r:
            doc = json.loads(r.read().decode("utf-8"))
        path.write_text(json.dumps(doc), encoding="utf-8")
        return doc

    def _live_bars(self, sym: str) -> list[dict]:
        try:
            doc = self._fetch(sym, "5m", "1d", ttl=25)
            self.meta[sym] = doc["chart"]["result"][0]["meta"]
            bars = chart_to_bars(doc)
            today = clock.today()
            days = by_session(bars)
            return fill_session(today, days.get(today, []), upto=min(SESSION_BARS, max(0, slot_of(int(time.time())) + 1)))
        except Exception:
            return []

    def _live_history(self, sym: str) -> list[list[dict]]:
        try:
            ss = by_session(chart_to_bars(self._fetch(sym, "5m", "60d", ttl=6 * 3600)))
            return [fill_session(d, s) for d, s in sorted(ss.items()) if d < clock.today() and len(s) >= 60]
        except Exception:
            return []


market = Market()


def fmt_t(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, IST).strftime("%H:%M")


def iso_utc(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


_ = random
