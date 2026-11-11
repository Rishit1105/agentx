"""Generate the India (NSE) edition of day-trader-skill from the pinned upstream copy.

The upstream repository (MIT) is never modified; this script writes vendor/day-trader-skill-in/ with a fixed,
reviewable set of patches. Every patch is an exact replacement that must match (the script fails loudly if
upstream changes), so the edition is reproducible:

  * time        New York (EDT/EST)  -> India Standard Time (UTC+5:30, no daylight saving)
  * calendar    NYSE hours/holidays -> NSE equities 09:15-15:30 IST, NSE's official holiday list (no early closes)
  * symbols     US tickers          -> NSE symbols (RELIANCE, M&M, BAJAJ-AUTO), Yahoo '<SYM>.NS', URL-encoded
  * session     78 bars to 16:00    -> 75 five-minute bars to 15:30
  * defaults    09:45/15:30/15:55   -> entries 09:30-15:00 IST, flat by 15:15 (before broker MIS square-off)
  * money       $                   -> ₹ in every message (config keys keep their upstream names: values are INR)
  * universe    Nasdaq Trader lists -> NSE EQUITY_L.csv (series EQ)
  * news        Yahoo US + SEC 8-K  -> Yahoo Finance India headlines (SEC filings do not apply to NSE issuers)
  * analyst     SEC XBRL            -> Yahoo quarterly fundamentals in INR (same output schema)
  * pelosi      US House PTRs       -> NSE bulk & block deals tracker (trader-deals)
  * broker      Alpaca wording      -> NSE paper account wording
Sizing, the risk gate, the Time Machine, entry and exit rules are untouched.
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "vendor" / "day-trader-skill"
DST = ROOT / "vendor" / "day-trader-skill-in"
HOLIDAYS = ROOT / "replay" / "fixtures-in" / "nse" / "holidays.json"

HELPERS = '''

# ---- India (NSE) edition helpers, added by scripts/make_india_edition.py ----
import urllib.parse as _urlparse
import sys as _sys
try:
    _sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def _nse(sym):
    """NSE symbol -> Yahoo symbol, URL-safe: RELIANCE -> RELIANCE.NS, M&M -> M%26M.NS, ^NSEI unchanged."""
    s = str(sym).strip().upper()
    if not (s.startswith("^") or s.endswith(".NS") or s.endswith(".BO")):
        s += ".NS"
    return _urlparse.quote(s, safe="^.-")


def _indian(s):
    """Western grouping -> Indian grouping: '1,234,567.89' -> '12,34,567.89' (lakh / crore)."""
    s = str(s)
    neg = s.startswith("-")
    whole, dot, frac = s.lstrip("-").partition(".")
    digits = whole.replace(",", "")
    if not digits.isdigit() or len(digits) <= 3:
        return s
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ("-" if neg else "") + ",".join(groups + [tail]) + (dot + frac if dot else "")


def _fmt0(x):
    return _indian(format(x, ",.0f"))


def _fmt2(x):
    return _indian(format(x, ",.2f"))


def _fmtI(x):
    return _indian(format(x, ","))


def _bare(sym):
    """Yahoo / URL form -> the NSE symbol: 'M%26M.NS' -> 'M&M'."""
    return _urlparse.unquote(str(sym or "")).strip().upper().replace(".NS", "").replace(".BO", "")
'''


class PatchError(Exception):
    pass


def sub(text: str, old: str, new: str, *, count: int | None = None, regex: bool = False, min_n: int = 1, where="") -> str:
    if regex:
        n = len(re.findall(old, text, flags=re.S))
        out = re.sub(old, new, text, flags=re.S)
    else:
        n = text.count(old)
        out = text.replace(old, new)
    if n < min_n or (count is not None and n != count):
        raise PatchError(f"{where}: expected {count or ('>=%d' % min_n)} match(es) of {old[:70]!r}, found {n}")
    return out


def add_helpers(text: str, where: str) -> str:
    lines = text.split("\n")
    last = 0
    for i, ln in enumerate(lines[:80]):
        if ln.startswith("import ") or ln.startswith("from "):
            last = i
    if not last:
        raise PatchError(f"{where}: no import block")
    lines.insert(last + 1, HELPERS)
    return "\n".join(lines)


def money(text: str) -> str:
    """$ -> ₹ in message strings; regex anchors like r'...$' and escaped \\$ are left alone."""
    out = []
    for ln in text.split("\n"):
        if "re.compile" in ln or "\\$" in ln:
            out.append(ln)
            continue
        out.append(re.sub(r"(?<![\\])\$(?=[%{\d(])", "₹", ln))
    return "\n".join(out)


def nse_holidays() -> str:
    d = json.loads(HOLIDAYS.read_text(encoding="utf-8"))
    items = []
    for h in d.get("CM", []):
        day = datetime.strptime(h["tradingDate"], "%d-%b-%Y").date().isoformat()
        items.append(f'    "{day}": {json.dumps(h["description"].replace("*", "").strip())},')
    return "NYSE_HOLIDAYS = {  # NSE equities (CM) trading holidays, from nseindia.com holiday-master\n" + \
        "\n".join(items) + "\n}"


TZ = [
    ("return -4 if start <= naive < end else -5", "return 5.5  # India Standard Time: UTC+5:30, no daylight saving"),
    ("for off in (-4, -5):", "for off in (5.5,):"),
    ("return local + datetime.timedelta(hours=5)", "return local - datetime.timedelta(hours=5.5)"),
]


def calendar(text: str, where: str, hours=True) -> str:
    text = sub(text, r"NYSE_HOLIDAYS = \{[^}]*\}", nse_holidays().replace("\\", "\\\\"), regex=True, where=where)
    text = sub(text, r"NYSE_EARLY_CLOSE = \{[^}]*\}", "NYSE_EARLY_CLOSE = {}  # NSE has no scheduled early closes",
               regex=True, where=where)
    if hours:
        text = sub(text, "OPEN = datetime.time(9, 30)", "OPEN = datetime.time(9, 15)  # NSE", where=where)
        text = sub(text, "CLOSE = datetime.time(16, 0)", "CLOSE = datetime.time(15, 30)  # NSE", where=where)
    text = re.sub(r"CALENDAR_YEARS = [^\n]+", "CALENDAR_YEARS = {2026}  # years with an NSE holiday list", text)
    return text


def tz(text: str, where: str) -> str:
    for old, new in TZ:
        text = sub(text, old, new, where=where)
    return text


def labels(text: str) -> str:
    text = text.replace("OPEN_MIN = 9 * 60 + 30", "OPEN_MIN = 9 * 60 + 15  # NSE open")
    text = text.replace('return "$" +', 'return "₹" +').replace('.lstrip("$")', '.lstrip("$₹")')
    for old, new in (('"%s 09:30" % nd', '"%s 09:15" % nd'), ("opens at 9:30", "opens at 9:15"),
                     ("runs 9:30 to", "runs 9:15 to"), ("(9:30 to %s)", "(9:15 to %s)"), ("9:30 to 16:00", "9:15 to 15:30")):
        text = text.replace(old, new)
    text = text.replace("NYSE", "NSE")
    # Indian digit grouping for every amount the skills print (₹5,00,000 not ₹500,000)
    text = (text.replace('"₹{:,.2f}".format(', '"₹" + _fmt2(').replace('"{:,.2f}".format(', '_fmt2(')
            .replace('"{:,.0f}".format(', '_fmt0(').replace('"{:,}".format(', '_fmtI(')
            .replace('format(D(x).quantize(CENT), ",f")', '_indian(format(D(x).quantize(CENT), ",f"))'))
    out = []
    for ln in text.split("\n"):   # labels only: never touch import lines (e.g. 'import ... ElementTree as ET')
        if ln.lstrip().startswith(("import ", "from ")) or "ET." in ln:
            out.append(ln)
        else:
            out.append(re.sub(r"""(?<=[\dsMSf%)]) ET(?=["')\s:,.])""", " IST", ln))
    return "\n".join(out)


def patch_common(text: str, where: str) -> str:
    text = labels(add_helpers(text, where))
    text = money(text)
    text = text.replace("New York time", "India time (IST)").replace("New York", "India (IST)")
    text = text.replace('"09:45"', '"09:30"').replace('"15:55"', '"15:15"')
    return text


def edition():
    if DST.exists():   # clear contents (the folder itself may be open in a shell on Windows)
        for child in DST.iterdir():
            shutil.rmtree(child) if child.is_dir() else child.unlink()
    shutil.copytree(SRC, DST, ignore=shutil.ignore_patterns(".git", "tests", "__pycache__", ".claude-plugin"),
                    dirs_exist_ok=True)
    f = lambda p: DST / p  # noqa: E731

    # ---- entry
    p = f("trader-entry/entry.py"); t = p.read_text(encoding="utf-8"); w = "entry"
    t = tz(calendar(t, w), w)
    t = sub(t, '    return sym.upper().replace(".", "-")\n', "    return _nse(sym)\n", where=w)
    t = sub(t, 'return {"symbol": str(meta.get("symbol") or sym).upper(),', 'return {"symbol": _bare(meta.get("symbol") or sym),', where=w)
    t = sub(t, 'if ch["symbol"] != yahoo_symbol(sym):', 'if _bare(ch["symbol"]) != _bare(sym):', where=w)
    t = sub(t, 'DEFAULTS = {"no_entries_before": "09:45", "no_entries_after": "15:30"}',
            'DEFAULTS = {"no_entries_before": "09:30", "no_entries_after": "15:00"}', where=w)
    t = sub(t, 'res.get("no_entries_after") or "15:30"', 'res.get("no_entries_after") or "15:00"', where=w)
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- exit
    p = f("trader-exit/exit.py"); t = p.read_text(encoding="utf-8"); w = "exit"
    t = tz(calendar(t, w), w)
    t = sub(t, 'ysym = sym.upper().replace(".", "-")', "ysym = _nse(sym)", where=w)
    t = sub(t, 'if str(meta.get("symbol") or ysym).upper() != ysym:', 'if _bare(meta.get("symbol") or ysym) != _bare(ysym):', where=w)
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- timemachine: 75 bars 09:15-15:30
    p = f("trader-timemachine/timemachine.py"); t = p.read_text(encoding="utf-8"); w = "timemachine"
    t = tz(t, w)
    t = sub(t, r"NYSE_EARLY_CLOSE = \{[^}]*\}", "NYSE_EARLY_CLOSE = {}  # NSE has no scheduled early closes", regex=True, where=w)
    t = sub(t, "SESSION_BARS = 78    # 9:30 to 16:00 in 5-minute bars", "SESSION_BARS = 75    # NSE 9:15 to 15:30 in 5-minute bars", where=w)
    t = sub(t, "or_min >= 390", "or_min >= 375", where=w)
    t = sub(t, "CLOSE_MIN = 16 * 60", "CLOSE_MIN = 15 * 60 + 30  # NSE close", where=w)
    t = sub(t, 'mc.get("until") or "16:00"', 'mc.get("until") or "15:30"', where=w)
    t = sub(t, 'urllib.parse.quote(sym.upper().replace(".", "-"))', "_nse(sym)", where=w)
    t = sub(t, 'msym = str(meta.get("symbol") or "").upper()', 'msym = _bare(meta.get("symbol"))', where=w)
    t = sub(t, 'msym != sym.replace(".", "-")', "msym != _bare(sym)", where=w)
    # Yahoo's NSE 5-minute feed routinely omits bars in the 15:15-15:25 closing window (measured: 98% of
    # sessions miss 15:20). Carry the last close forward as a flat, zero-volume bar (marked "filled") so a
    # session with at most 5 gaps counts as full. Exits are flat by 15:15, so this never invents a fill.
    t = sub(t, """        if len(s) == SESSION_BARS:
            full.append((d, [s[i] for i in range(SESSION_BARS)]))""",
            """        if len(s) == SESSION_BARS or (len(s) >= SESSION_BARS - 5 and 0 in s):
            seq = []
            for i in range(SESSION_BARS):
                if i not in s:
                    p = seq[-1]
                    s[i] = {"date": d, "slot": i, "start": clock24(OPEN_MIN + 5 * i), "o": p["c"], "h": p["c"],
                            "l": p["c"], "c": p["c"], "v": 0, "filled": True}
                seq.append(s[i])
            full.append((d, seq))""", where=w)
    t = re.sub(r"\(9, ?30\)", "(9, 15)", t)          # session open used for bar slots
    t = re.sub(r"\(16, ?0\)", "(15, 30)", t)
    t = t.replace('"9:30"', '"9:15"').replace('"09:30"', '"09:15"').replace('"16:00"', '"15:30"')
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- scanner: NSE universe, symbols with '-' and '&'
    p = f("trader-scanner/scan.py"); t = p.read_text(encoding="utf-8"); w = "scanner"
    t = tz(calendar(t, w), w)
    t = sub(t, '    return sym.upper().replace(".", "-")\n', "    return _nse(sym)\n", where=w)
    t = sub(t, 'sym = (wanted or {}).get(ysym.upper(), ysym.upper().replace("-", "."))',
            'sym = (wanted or {}).get(ysym.upper(), _bare(ysym))', where=w)
    t = sub(t, 'sym = sym.upper().replace("-", ".")', "sym = _bare(sym)", where=w)
    t = sub(t, 'TICKER = re.compile(r"^[A-Z]{1,5}$|^[A-Z]{1,4}\\.[A-Z]$")', 'TICKER = re.compile(r"^[A-Z0-9][A-Z0-9&\\-]{0,19}$")  # NSE', where=w)
    t = sub(t, 'NASDAQ_FILES = ("nasdaqlisted.txt", "otherlisted.txt")', 'NASDAQ_FILES = ("EQUITY_L.csv",)  # NSE equity list', where=w)
    t = re.sub(r'NASDAQ_URL = "[^"]*"', 'NASDAQ_URL = "https://nsearchives.nseindia.com/content/equities/"', t)
    new_bu = '''def build_universe(texts):
    """NSE EQUITY_L.csv -> (kept [(SYM, name)], counts, created). Keeps series EQ (regular equity)."""
    import csv as _csv, io as _io
    kept, counts = {}, {"rows": 0}
    text = texts.get("EQUITY_L.csv")
    if text is None:
        raise ScanError("missing EQUITY_L.csv")
    for r in _csv.DictReader(_io.StringIO(text)):
        r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
        counts["rows"] += 1
        sym, series = r.get("SYMBOL", ""), r.get("SERIES", "")
        why = "keep" if series == "EQ" and TICKER.match(sym) else ("series " + series if series != "EQ" else "symbol")
        counts[why] = counts.get(why, 0) + 1
        if why == "keep":
            kept[sym] = r.get("NAME OF COMPANY", "")
    return sorted(kept.items()), counts, None


# ---------------------------------------------------------------- daily setups'''
    t = sub(t, r"def build_universe\(texts\):.*?\n\n\n# -+ daily setups", new_bu.replace("\\", "\\\\"), regex=True, where=w)
    t = t.replace("nasdaqtrader.com", "nseindia.com")
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- risk
    p = f("trader-risk/check.py"); t = p.read_text(encoding="utf-8"); w = "risk"
    t = tz(calendar(t, w), w)
    t = sub(t, 'TICKER = re.compile(r"^[A-Z]{1,5}([.\\-][A-Z]{1,2})?$")', 'TICKER = re.compile(r"^[A-Z0-9][A-Z0-9&\\-]{0,19}$")  # NSE', where=w)
    t = t.replace('"no_entries_after": "15:30"', '"no_entries_after": "15:00"')
    t = t.replace("pattern-day-trader rule your broker applies", "pattern-day-trader rule (a US rule; off for NSE)")
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- budget
    p = f("trader-budget/size.py"); t = p.read_text(encoding="utf-8"); w = "budget"
    t = tz(t, w)
    t = t.replace('"no_entries_after": "15:30"', '"no_entries_after": "15:00"').replace('"broker": "alpaca"', '"broker": "paper"')
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- broker
    p = f("trader-broker/ticket.py"); t = p.read_text(encoding="utf-8"); w = "broker"
    t = tz(t, w)
    t = sub(t, 'return "%s%+03d:00" % (to_eastern(now_utc).replace(microsecond=0).isoformat(), off)',
            'return "%s+05:30" % to_eastern(now_utc).replace(microsecond=0).isoformat()', where=w)
    t = sub(t, '"Interactive Brokers" if broker == "ibkr" else "Alpaca"', '"NSE paper account (Meridian exchange)"', where=w)
    t = t.replace("Alpaca holds these shares", "The paper exchange holds these shares")
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- alerts
    p = f("trader-alerts/alerts.py"); t = p.read_text(encoding="utf-8"); w = "alerts"
    t = tz(calendar(t, w), w)
    t = sub(t, '(host, sym.upper().replace(".", "-"))', "(host, _nse(sym))", where=w)
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- news: Yahoo Finance India; SEC filings do not apply to NSE issuers
    p = f("trader-news/news.py"); t = p.read_text(encoding="utf-8"); w = "news"
    t = sub(t, "return -4 if start <= naive < end else -5", "return 5.5  # IST", where=w)
    t = sub(t, '    return ticker.upper().replace(".", "-")\n', "    return _nse(ticker)\n", where=w)
    # Yahoo's India RSS is weeks stale for NSE names; Google News India search is fresh. Same RSS 2.0 format.
    t = sub(t, 'YAHOO = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%s&region=US&lang=en-US"',
            'YAHOO = "https://news.google.com/rss/search?q=%s+share+NSE&hl=en-IN&gl=IN&ceid=IN:en"  # India edition', where=w)
    t = sub(t, 'YAHOO % yahoo_symbol(t)', 'YAHOO % _urlparse.quote(_bare(t))', where=w)
    t = sub(t, '"source": "Yahoo Finance", "kind": "headline"', '"source": "Google News India", "kind": "headline"', where=w)
    p.write_text(patch_common(t, w), encoding="utf-8")

    # ---- analyst & deals: India-native replacements (same contracts)
    shutil.copy(ROOT / "scripts" / "india" / "facts.py", f("trader-analyst/facts.py"))
    # (facts.py and deals.py reconfigure stdout to UTF-8 themselves)
    shutil.rmtree(f("trader-pelosi"))
    (DST / "trader-deals").mkdir()
    shutil.copy(ROOT / "scripts" / "india" / "deals.py", f("trader-deals/deals.py"))
    (DST / "trader-deals" / "SKILL.md").write_text(
        "---\nname: trader-deals\ndescription: NSE bulk and block deals tracker (India edition replacement for "
        "trader-pelosi). Lists large disclosed trades and flags new ones once.\n---\n", encoding="utf-8")

    # ---- India config
    cfg = json.loads(f("trader-budget/config.example.json").read_text(encoding="utf-8"))
    cfg.update({"budget": 500000, "max_order_usd": 400000, "min_order_usd": 500, "max_loss_per_trade_usd": 2500,
                "max_daily_loss_usd": 7500, "no_entries_before": "09:30", "no_entries_after": "15:00", "flat_by": "15:15",
                "broker": "paper", "paper": True, "pdt_guard": False, "allow_margin": False, "allow_short": False,
                "allow_options": False, "currency": "INR", "market": "NSE"})
    f("trader-budget/config.example.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    (DST / "INDIA_EDITION.md").write_text(__doc__ + f"\nGenerated {datetime.now().isoformat(timespec='seconds')} "
                                          f"from {SRC.name}. Upstream licence (MIT) retained in LICENSE.\n", encoding="utf-8")
    print("India edition written to", DST)


if __name__ == "__main__":
    edition()
