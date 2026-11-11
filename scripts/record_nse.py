"""Record a real NSE session for Meridian's Replay mode (stdlib only, polite).

Saves under replay/fixtures-in/:
  charts60/<SYMBOL>.json.gz   Yahoo 5-minute chart, last 60 sessions incl. the recorded day (NIFTY 500 + ^NSEI)
  daily/NIFTY50.json          ^NSEI daily bars, 1 year (buy-and-hold market benchmark)
  news/yahoo-<SYMBOL>.xml     Yahoo Finance India headlines RSS
  fundamentals/<SYMBOL>.json  Yahoo quarterly fundamentals (revenue, net income, EPS, margins inputs) in INR
  nse/EQUITY_L.csv, nse/ind_nifty100list.csv, nse/bulk.csv, nse/block.csv, nse/holidays.json
  manifest.json               what was recorded, when, from where

Usage:  .venv/Scripts/python scripts/record_nse.py [--limit N]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "replay" / "fixtures-in"
UA = {"User-Agent": "Mozilla/5.0 (Meridian paper-trading prototype; replay recorder)", "Accept": "*/*"}
NSE = "https://nsearchives.nseindia.com/content"
FUND_TYPES = ",".join("quarterly" + t for t in ("TotalRevenue", "GrossProfit", "OperatingIncome", "NetIncome",
                                                "DilutedEPS", "BasicEPS", "EBITDA"))


def get(url: str, timeout=20) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save(path: Path, data: bytes, gz=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if gz:
        with gzip.open(path, "wb") as fh:
            fh.write(data)
    else:
        path.write_bytes(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--index", default="nifty500", choices=["nifty100", "nifty500"])
    ap.add_argument("--skip-existing", action="store_true", help="keep already-recorded symbols, only fetch new ones")
    ap.add_argument("--pause", type=float, default=0.25)
    a = ap.parse_args()
    manifest = {"recorded_at": datetime.now(timezone.utc).isoformat(), "source": "Yahoo Finance (unofficial chart API), NSE archives",
                "symbols": [], "errors": {}}
    nifty = get(f"{NSE}/indices/ind_{a.index}list.csv")
    save(OUT / "nse" / f"ind_{a.index}list.csv", nifty)
    rows = list(csv.DictReader(io.StringIO(nifty.decode("utf-8"))))
    names = {r["Symbol"].strip(): r["Company Name"].strip() for r in rows}
    industries = {r["Symbol"].strip(): r["Industry"].strip() for r in rows}
    syms = list(names)[: a.limit]
    old = {}
    if a.skip_existing and (OUT / "manifest.json").exists():
        old = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
        manifest["symbols"] = list(old.get("symbols", []))
        manifest["errors"] = {k: v for k, v in old.get("errors", {}).items() if k.split(":")[0] not in syms}
        syms = [s for s in syms if s not in set(manifest["symbols"])]
    for name, url in (("EQUITY_L.csv", f"{NSE}/equities/EQUITY_L.csv"), ("bulk.csv", f"{NSE}/equities/bulk.csv"),
                      ("block.csv", f"{NSE}/equities/block.csv"),
                      ("holidays.json", "https://www.nseindia.com/api/holiday-master?type=trading")):
        try:
            save(OUT / "nse" / name, get(url))
        except Exception as e:
            manifest["errors"][name] = str(e)
    for idx, (sym, rng, iv, path) in enumerate([] if a.skip_existing else [("^NSEI", "60d", "5m", OUT / "charts60" / "NIFTY50.json.gz"),
                                                 ("^NSEI", "1y", "1d", OUT / "daily" / "NIFTY50.json")]):
        save(path, get(f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}?interval={iv}&range={rng}"),
             gz=str(path).endswith(".gz"))
    for i, s in enumerate(syms):
        y = urllib.request.quote(s + ".NS")
        try:
            doc = get(f"https://query2.finance.yahoo.com/v8/finance/chart/{y}?interval=5m&range=60d&includePrePost=false")
            save(OUT / "charts60" / f"{s}.json.gz", doc, gz=True)
            manifest["symbols"].append(s)
        except Exception as e:
            manifest["errors"][s] = str(e)
        for kind, url, path in (
                ("news", f"https://news.google.com/rss/search?q={urllib.request.quote(s)}+share+NSE&hl=en-IN&gl=IN&ceid=IN:en", OUT / "news" / f"yahoo-{s}.xml"),
                ("fund", f"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{y}"
                         f"?type={FUND_TYPES}&period1=1640995200&period2=1830000000", OUT / "fundamentals" / f"{s}.json")):
            try:
                save(path, get(url))
            except Exception as e:
                manifest["errors"][f"{s}:{kind}"] = str(e)
        time.sleep(a.pause)
        print(f"\r{i + 1}/{len(syms)} {s:<12}", end="", flush=True)
    manifest["names"] = {**old.get("names", {}), **names}
    manifest["industries"] = {**old.get("industries", {}), **industries}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nrecorded {len(manifest['symbols'])} symbols, {len(manifest['errors'])} errors -> {OUT}")


if __name__ == "__main__":
    main()
