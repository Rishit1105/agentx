"""Read-only import of real broker holdings, for analysis next to the paper desk. No credentials, no live connection.

You export your holdings from the broker yourself (Zerodha Console -> Portfolio -> Holdings -> Download CSV, or any
CSV/JSON with a symbol and quantity column) and paste or upload it. Meridian maps each row to the NSE universe and
shows value, sector concentration and today's move on the replay prices. It never logs in, never stores credentials and
never places anything: the paper exchange stays separate, so imported holdings cannot reach an order path.
(Zerodha's Kite MCP server is the live alternative for AI tools; it is not wired in here.)
"""
from __future__ import annotations

import csv
import io
import json
import re

from ..clock import clock

SCHEMA = """CREATE TABLE IF NOT EXISTS imported_holdings(symbol TEXT PRIMARY KEY, qty REAL, avg_cost REAL, source TEXT,
    imported TEXT);"""

SYM_KEYS = ("instrument", "symbol", "tradingsymbol", "trading symbol", "scrip", "stock")
QTY_KEYS = ("qty.", "qty", "quantity", "shares", "net qty")
AVG_KEYS = ("avg. cost", "avg cost", "average price", "avg_price", "average_price", "buy avg", "avg. price")


class ImportError_(ValueError):
    pass


def _num(x) -> float | None:
    try:
        return float(str(x).replace(",", "").replace("₹", "").strip())
    except (TypeError, ValueError):
        return None


def _pick(row: dict, keys) -> str | None:
    low = {str(k).strip().lower(): v for k, v in row.items()}
    return next((low[k] for k in keys if k in low and str(low[k]).strip()), None)


def parse(text: str) -> list[dict]:
    text = (text or "").strip()
    if not text:
        raise ImportError_("paste a holdings CSV or JSON")
    rows: list[dict]
    if text[0] in "[{":
        data = json.loads(text)
        rows = data if isinstance(data, list) else data.get("holdings") or data.get("data") or []
    else:
        rows = list(csv.DictReader(io.StringIO(text)))
    out = []
    for r in rows:
        sym, qty = _pick(r, SYM_KEYS), _num(_pick(r, QTY_KEYS))
        if not sym or not qty or qty <= 0:
            continue
        sym = re.sub(r"[-.](EQ|BE|NSE|BSE)$", "", str(sym).strip().upper()).replace("NSE:", "")
        out.append({"symbol": sym, "qty": qty, "avg_cost": _num(_pick(r, AVG_KEYS))})
    if not out:
        raise ImportError_("no rows with a symbol and a positive quantity were found")
    return out


class HoldingsImport:
    def __init__(self, desk):
        self.desk = desk
        with desk.db.lock:
            desk.db.conn.executescript(SCHEMA)

    def load(self, text: str, source: str = "csv") -> dict:
        rows = parse(text)
        self.desk.db.execute("DELETE FROM imported_holdings")
        for r in rows:
            self.desk.db.execute("INSERT OR REPLACE INTO imported_holdings VALUES(?,?,?,?,?)",
                                 (r["symbol"], r["qty"], r["avg_cost"], source, clock.now().isoformat()))
        self.desk.audit.append("holdings.imported", rows=len(rows), source=source)
        return self.view()

    def clear(self):
        self.desk.db.execute("DELETE FROM imported_holdings")

    def view(self) -> dict:
        m = self.desk.market
        known = set(m.symbols())
        rows = self.desk.db.query("SELECT * FROM imported_holdings ORDER BY symbol")
        items, unknown = [], []
        for r in rows:
            if r["symbol"] not in known:
                unknown.append(r["symbol"])
                continue
            px, prev = m.price(r["symbol"]), m.prev_close(r["symbol"])
            value = (px or 0) * r["qty"]
            items.append({"symbol": r["symbol"], "name": m.name(r["symbol"]), "sector": m.industries.get(r["symbol"]) or "Other",
                          "qty": r["qty"], "avg_cost": r["avg_cost"], "price": px, "value": round(value, 2),
                          "pnl": round((px - r["avg_cost"]) * r["qty"], 2) if px and r["avg_cost"] else None,
                          "day_chg": round((px / prev - 1) * 100, 2) if px and prev else None})
        total = sum(i["value"] for i in items) or 0.0
        sectors: dict[str, float] = {}
        for i in items:
            i["weight"] = round(i["value"] / total * 100, 1) if total else 0
            sectors[i["sector"]] = sectors.get(i["sector"], 0) + i["value"]
        sect = sorted(({"sector": k, "value": round(v, 2), "weight": round(v / total * 100, 1) if total else 0}
                       for k, v in sectors.items()), key=lambda x: -x["value"])
        top = max(items, key=lambda i: i["value"]) if items else None
        notes = []
        if top and top["weight"] > 25:
            notes.append(f"{top['symbol']} is {top['weight']}% of the portfolio: a single-stock concentration risk")
        if sect and sect[0]["weight"] > 40:
            notes.append(f"{sect[0]['sector']} is {sect[0]['weight']}% of the portfolio")
        return {"items": sorted(items, key=lambda i: -i["value"]), "unknown": unknown, "total": round(total, 2),
                "day_pnl": round(sum((i["value"] - i["value"] / (1 + i["day_chg"] / 100)) for i in items if i["day_chg"] is not None), 2),
                "sectors": sect, "notes": notes,
                "note": "Read-only analysis of a file you exported. Meridian never logs in to your broker or places orders."}
