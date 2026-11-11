#!/usr/bin/env python3
"""trader-deals (India edition): NSE bulk and block deals, the disclosed large trades.

Replaces trader-pelosi (US House periodic transaction reports, not applicable in India). Same spirit: read
public disclosures, list them, and alert once per new one. Disclosures are information, not signals.

  python3 deals.py index --symbol RELIANCE --json
  python3 deals.py new --json                      # deals not seen at the last check (updates the state file)
  python3 deals.py index --offline replay/fixtures-in/nse --json
Standard library only.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import sys
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "https://nsearchives.nseindia.com/content/equities/"
UA = "Mozilla/5.0 (day-trader-skill India edition)"


class DealsError(Exception):
    pass


def load(kind, offline=None):
    fname = kind + ".csv"
    if offline:
        p = os.path.join(offline, fname)
        if not os.path.exists(p):
            raise DealsError("no offline %s in %s" % (fname, offline))
        with open(p, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    else:
        try:
            req = urllib.request.Request(BASE + fname, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                text = r.read().decode("utf-8", "replace")
        except Exception as e:
            raise DealsError("NSE archives unavailable for %s: %s" % (fname, e))
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
        try:
            qty = int(float(r.get("Quantity Traded", "0").replace(",", "")))
            price = float(r.get("Trade Price / Wght. Avg. Price", "0").replace(",", ""))
        except ValueError:
            continue
        d = {"kind": kind, "date": r.get("Date"), "symbol": r.get("Symbol", "").upper(), "name": r.get("Security Name"),
             "client": r.get("Client Name"), "side": r.get("Buy/Sell", "").upper(), "qty": qty, "price": price,
             "value_inr": round(qty * price, 2), "remarks": r.get("Remarks") or None}
        d["id"] = hashlib.sha1(json.dumps(d, sort_keys=True).encode()).hexdigest()[:12]
        rows.append(d)
    return rows


def crore(v):
    return "₹%.1f cr" % (v / 1e7)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("index", "new"):
        p = sub.add_parser(name)
        p.add_argument("--symbol", action="append")
        p.add_argument("--member", "--client", dest="client", action="append", help="client name contains")
        p.add_argument("--kind", choices=["bulk", "block", "both"], default="both")
        p.add_argument("--min-value", type=float, default=0, help="minimum deal value in INR")
        p.add_argument("--limit", type=int, default=50)
        p.add_argument("--offline", metavar="DIR")
        p.add_argument("--year", type=int, help="ignored (compatibility)")
        p.add_argument("--json", action="store_true")
        if name == "new":
            p.add_argument("--state", default="trader/state/deals.json")
            p.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    try:
        rows = []
        for k in (["bulk", "block"] if a.kind == "both" else [a.kind]):
            rows += load(k, a.offline)
    except DealsError as e:
        print(str(e), file=sys.stderr)
        return 2
    if a.symbol:
        want = {s.upper() for s in a.symbol}
        rows = [r for r in rows if r["symbol"] in want]
    if a.client:
        rows = [r for r in rows if any(c.lower() in (r["client"] or "").lower() for c in a.client)]
    rows = [r for r in rows if r["value_inr"] >= a.min_value]
    rows.sort(key=lambda r: -r["value_inr"])
    if a.cmd == "new":
        try:
            with open(a.state, encoding="utf-8") as fh:
                seen = set(json.load(fh).get("seen", []))
        except (OSError, ValueError):
            seen = set()
        rows = [r for r in rows if r["id"] not in seen]
        if not a.dry_run:
            os.makedirs(os.path.dirname(a.state) or ".", exist_ok=True)
            with open(a.state, "w", encoding="utf-8") as fh:
                json.dump({"seen": sorted(seen | {r["id"] for r in rows})}, fh)
    rows = rows[: a.limit]
    if a.json:
        print(json.dumps(rows, indent=2))
    else:
        for r in rows:
            print("%s  %-5s %-12s %-4s %12s @ %10.2f  %-12s %s" % (r["date"], r["kind"], r["symbol"], r["side"],
                  format(r["qty"], ","), r["price"], crore(r["value_inr"]), r["client"]))
        if not rows:
            print("no deals")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
