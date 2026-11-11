#!/usr/bin/env python3
"""trader-analyst (India edition): quarterly results for NSE companies, in INR.

Replaces SEC XBRL company facts (not applicable to NSE issuers) with Yahoo Finance's quarterly fundamentals
time series. Output schema matches the upstream facts.py (ticker -> result.rows[] with revenue, net_income,
eps_diluted, margins and year-on-year growth), so callers do not change.

  python3 facts.py RELIANCE TCS --json
  python3 facts.py INFY --offline replay/fixtures-in/fundamentals --json
Standard library only.
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

TYPES = ["quarterlyTotalRevenue", "quarterlyGrossProfit", "quarterlyOperatingIncome", "quarterlyNetIncome",
         "quarterlyDilutedEPS", "quarterlyBasicEPS", "quarterlyEBITDA"]
URL = ("https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/%s?type=%s"
       "&period1=1640995200&period2=%d")
UA = "Mozilla/5.0 (day-trader-skill India edition)"


class FactsError(Exception):
    pass


def fetch(sym, offline=None):
    if offline:
        p = os.path.join(offline, sym.upper() + ".json")
        if not os.path.exists(p):
            raise FactsError("no offline fundamentals for %s" % sym)
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    y = urllib.parse.quote(sym.upper() + ".NS", safe=".")
    req = urllib.request.Request(URL % (y, ",".join(TYPES), int(time.time()) + 86400 * 60), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        raise FactsError("Yahoo fundamentals unavailable for %s: %s" % (sym, e))


def quarters(doc):
    by_end = {}
    for res in ((doc or {}).get("timeseries") or {}).get("result") or []:
        typ = ((res.get("meta") or {}).get("type") or [None])[0]
        for pt in res.get(typ) or []:
            if not pt or pt.get("periodType") != "3M":
                continue
            v = (pt.get("reportedValue") or {}).get("raw")
            row = by_end.setdefault(pt["asOfDate"], {})
            row[typ] = v
            row.setdefault("currency", pt.get("currencyCode") or "INR")
    return [dict(end=k, **v) for k, v in sorted(by_end.items(), reverse=True)]


def pct(a, b):
    return round((a - b) / abs(b) * 100, 1) if a is not None and b not in (None, 0) else None


def fiscal(end):
    """Indian fiscal year runs April-March: quarter ending 2026-06-30 is Q1 FY27."""
    y, m = int(end[:4]), int(end[5:7])
    q = {6: 1, 9: 2, 12: 3, 3: 4}.get(m)
    fy = y + 1 if m >= 4 else y
    return "Q%s FY%02d" % (q or "?", fy % 100)


def build(sym, doc, n):
    qs = quarters(doc)
    if not qs:
        raise FactsError("no quarterly results for %s" % sym)
    rows = []
    for i, q in enumerate(qs[:n]):
        prev = next((x for x in qs if x["end"][:4] == str(int(q["end"][:4]) - 1) and x["end"][5:] == q["end"][5:]), None)
        rev, ni = q.get("quarterlyTotalRevenue"), q.get("quarterlyNetIncome")
        gp, oi = q.get("quarterlyGrossProfit"), q.get("quarterlyOperatingIncome")
        eps = q.get("quarterlyDilutedEPS") if q.get("quarterlyDilutedEPS") is not None else q.get("quarterlyBasicEPS")
        rows.append({
            "end": q["end"], "fiscal": fiscal(q["end"]), "revenue": rev, "gross_profit": gp, "operating_income": oi,
            "net_income": ni, "eps_diluted": round(eps, 2) if eps is not None else None,
            "gross_margin": round(gp / rev * 100, 1) if gp is not None and rev else None,
            "operating_margin": round(oi / rev * 100, 1) if oi is not None and rev else None,
            "net_margin": round(ni / rev * 100, 1) if ni is not None and rev else None,
            "revenue_yoy": pct(rev, (prev or {}).get("quarterlyTotalRevenue")),
            "net_income_yoy": pct(ni, (prev or {}).get("quarterlyNetIncome")),
            "eps_yoy": pct(eps, (prev or {}).get("quarterlyDilutedEPS")), "form": "quarterly results",
            "filed": None, "currency": q.get("currency", "INR")})
    return {"entity": sym.upper(), "rows": rows, "filings": None, "currency": rows[0]["currency"],
            "source": "Yahoo Finance fundamentals (reported currency as filed; some NSE companies such as Infosys report in USD)"}


def crore(v, cur="INR"):
    if v is None:
        return "n/a"
    if cur == "INR":
        return "₹%s cr" % format(round(v / 1e7), ",")
    return "%s %.2fB" % (cur, v / 1e9)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("tickers", nargs="*")
    ap.add_argument("--quarters", type=int, default=6)
    ap.add_argument("--offline", metavar="DIR")
    ap.add_argument("--metrics", metavar="FILE")
    ap.add_argument("--config", default="trader/config.json")
    ap.add_argument("--user-agent")
    ap.add_argument("--no-filings", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    if not a.tickers:
        print("give one or more NSE symbols, e.g. RELIANCE TCS", file=sys.stderr)
        return 2
    out, failed = [], 0
    for t in a.tickers:
        try:
            out.append({"ticker": t.upper(), "result": build(t, fetch(t, a.offline), a.quarters)})
        except FactsError as e:
            failed += 1
            out.append({"ticker": t.upper(), "error": str(e)})
    if a.metrics:
        try:
            with open(a.metrics, encoding="utf-8") as fh:
                m = json.load(fh)
        except (OSError, ValueError):
            m = {}
        for r in out:
            if r.get("result"):
                m[r["ticker"]] = r["result"]["rows"][0]
        with open(a.metrics, "w", encoding="utf-8") as fh:
            json.dump(m, fh, indent=2)
    if a.json:
        print(json.dumps(out, indent=2))
    else:
        for r in out:
            if r.get("error"):
                print("%s: %s" % (r["ticker"], r["error"]))
                continue
            print(r["ticker"])
            for q in r["result"]["rows"]:
                print("  %-10s revenue %-16s net %-14s EPS %-8s yoy %s%%" % (q["fiscal"], crore(q["revenue"], q["currency"]),
                      crore(q["net_income"], q["currency"]), q["eps_diluted"], q["revenue_yoy"]))
    return 0 if not failed else (1 if failed < len(out) else 2)


if __name__ == "__main__":
    sys.exit(main())
