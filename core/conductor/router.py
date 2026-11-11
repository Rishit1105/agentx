"""Deterministic intent grammar. Safety words never reach an LLM; the whole voice catalogue (blueprint 12.5)
is covered here so Meridian works with no language model at all."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

WAKE = re.compile(r"^\s*(hey|hi|ok|okay|yo)?[\s,]*(meridian|meridien|miridian|meridians|meredian|the meridian)\b[\s,.!?]*",
                   re.I)
HALT = re.compile(r"\b(stop everything|halt|kill ?switch|emergency stop|stop all trading|stop trading|abort|panic)\b", re.I)

NAME_TO_TICKER = {   # how people say NSE names out loud -> NSE symbol
    "reliance": "RELIANCE", "infosys": "INFY", "infy": "INFY", "tcs": "TCS", "tata consultancy": "TCS",
    "hdfc bank": "HDFCBANK", "hdfc": "HDFCBANK", "icici bank": "ICICIBANK", "icici": "ICICIBANK", "state bank": "SBIN",
    "sbi": "SBIN", "airtel": "BHARTIARTL", "bharti airtel": "BHARTIARTL", "itc": "ITC", "l and t": "LT", "l&t": "LT",
    "larsen": "LT", "axis bank": "AXISBANK", "axis": "AXISBANK", "kotak": "KOTAKBANK", "kotak bank": "KOTAKBANK",
    "bajaj finance": "BAJFINANCE", "bajaj finserv": "BAJAJFINSV", "bajaj auto": "BAJAJ-AUTO", "maruti": "MARUTI",
    "mahindra": "M&M", "m and m": "M&M", "m&m": "M&M", "tata steel": "TATASTEEL", "tata power": "TATAPOWER",
    "sun pharma": "SUNPHARMA", "hcl": "HCLTECH", "hcl tech": "HCLTECH", "wipro": "WIPRO", "titan": "TITAN",
    "asian paints": "ASIANPAINT", "ultratech": "ULTRACEMCO", "ntpc": "NTPC", "power grid": "POWERGRID", "ongc": "ONGC",
    "coal india": "COALINDIA", "adani enterprises": "ADANIENT", "adani ports": "ADANIPORTS", "adani": "ADANIENT",
    "hindalco": "HINDALCO", "jsw steel": "JSWSTEEL", "jsw": "JSWSTEEL", "nestle": "NESTLEIND",
    "hindustan unilever": "HINDUNILVR", "hul": "HINDUNILVR", "zomato": "ETERNAL", "eternal": "ETERNAL",
    "indigo": "INDIGO", "interglobe": "INDIGO", "hal": "HAL", "hindustan aeronautics": "HAL", "bel": "BEL",
    "bharat electronics": "BEL", "dmart": "DMART", "d mart": "DMART", "trent": "TRENT", "eicher": "EICHERMOT",
    "hero": "HEROMOTOCO", "hero motocorp": "HEROMOTOCO", "cipla": "CIPLA", "dr reddy": "DRREDDY", "doctor reddy": "DRREDDY",
    "tech mahindra": "TECHM", "bosch": "BOSCHLTD", "godrej consumer": "GODREJCP", "jindal steel": "JINDALSTEL",
    "mazagon dock": "MAZDOCK", "mazagon": "MAZDOCK", "vedanta": "VEDL", "tvs": "TVSMOTOR", "shriram finance": "SHRIRAMFIN",
    "sbi life": "SBILIFE", "hdfc life": "HDFCLIFE", "grasim": "GRASIM", "bse": "BSE", "nifty": "NIFTY50",
    "nifty fifty": "NIFTY50", "nifty 50": "NIFTY50",
}
WORD_NUM = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
            "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40,
            "fifty": 50, "sixty": 60, "a hundred": 100, "one hundred": 100, "hundred": 100, "two hundred": 200,
            "a couple": 2, "an": 1, "a": 1}
STOP_TICKERS = {"IST", "NSE", "INR", "MIS", "SEBI", "RS", "A", "I", "IT", "THE", "AND", "OR", "TO", "ON", "IN", "OF", "IS", "BE", "ME", "MY", "AT", "IF", "SO",
                "DO", "GO", "UP", "NO", "YES", "OK", "BUY", "ALL", "ANY", "FOR", "HOW", "WHY", "WHAT", "ORB", "PNL",
                "ET", "AM", "PM", "R", "AN", "BY", "AS", "WAS", "ARE", "CAN", "YOU", "NOW", "DAY", "HIT"}


@dataclass
class Intent:
    name: str
    slots: dict = field(default_factory=dict)
    text: str = ""
    wake: bool = False


def strip_wake(text: str) -> tuple[str, bool]:
    m = WAKE.match(text)
    if m:
        return text[m.end():].strip(), True
    return text.strip(), False


UNITS = {"zero": 0, "one": 1, "a": 1, "an": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
         "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
         "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
         "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "couple": 2, "half": 0.5}


def number(s: str) -> float | None:
    """'500'->500, 'five hundred'->500, 'one fifty'->150, 'three seventy'->370, 'three fifty-eight'->358,
    'one hundred fifty'->150, 'twenty five'->25, 'two and a half'->2.5."""
    s = s.strip().lower().replace(",", "").replace("$", "").replace("₹", "")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if m:
        return float(m.group(0))
    words = [w for w in re.split(r"[\s-]+", s) if w and w not in ("and", "dollars", "dollar", "bucks", "of", "rupees",
                                                                    "rupee", "rs", "inr")]
    cur, total, seen = 0.0, 0.0, False
    hundreds = False      # cur already carries an explicit 'hundred' (or trader shorthand)
    fresh = False         # right after 'thousand': the next word starts a new group
    words = [w for i, w in enumerate(words) if not (w in ("a", "an") and i + 1 < len(words) and words[i + 1] == "half")]
    for w in words:
        if w in ("a", "an") and not seen:
            cur, seen = 1.0, True
            continue
        if w in UNITS:
            v = float(UNITS[w])
            if v == 0.5:
                cur += 0.5
            elif not seen or fresh:
                cur, fresh = v, False
            elif hundreds:
                cur += v
            elif cur < 10 and v >= 10:          # trader shorthand: 'three seventy' = 370
                cur, hundreds = cur * 100 + v, True
            elif cur >= 20 and cur % 10 == 0 and v < 10:   # 'twenty five'
                cur += v
            else:
                break
            seen = True
        elif w == "hundred":
            cur, hundreds, seen = (cur or 1) * 100, True, True
        elif w in ("lakh", "lakhs", "lac"):
            total, cur, hundreds, seen, fresh = total + (cur or 1) * 100000, 0.0, False, True, True
        elif w in ("crore", "crores"):
            total, cur, hundreds, seen, fresh = total + (cur or 1) * 10000000, 0.0, False, True, True
        elif w == "thousand":
            total, cur, hundreds, seen, fresh = total + (cur or 1) * 1000, 0.0, False, True, True
        elif seen:
            break
    return float(total + cur) if seen else None


# --- NIFTY 500 support: spoken-name aliases are generated from company names; short tickers outside the original
# NIFTY 100 (ACE, SAIL, CAMS...) look like English words, so they only match when typed in capitals.
_AUTO: list[tuple[str, str]] = []
_LOWER_OK: set[str] = set()
_AUTO_KEY: tuple = ()
_SUFFIX = re.compile(r"\b(limited|ltd|corporation|corp|company|co|pvt|private|incorporated|inc|the|of)\b\.?", re.I)
_GENERIC = {"india", "indian", "national", "global", "general", "universal", "united", "bharat", "international", "power",
            "industries", "finance", "financial", "bank", "capital", "energy", "infra", "technologies", "services", "life",
            "gas", "steel", "motors", "housing", "systems", "holdings", "foods", "chemicals", "pharma", "new", "first",
            "great", "star", "blue", "green", "gold", "sun", "one", "max", "home", "city", "state", "central", "east", "west"}


def ensure_aliases(names: dict[str, str], core: set[str]) -> None:
    """Build lowercase spoken aliases from {SYMBOL: company name}. Full cleaned name always; first word only when it is
    distinctive (>=5 letters, unique across companies, not a generic word)."""
    global _AUTO, _LOWER_OK, _AUTO_KEY
    key = (len(names), len(core))
    if key == _AUTO_KEY:
        return
    _AUTO_KEY, _LOWER_OK = key, set(core)
    clean: dict[str, str] = {}
    for sym, full in names.items():
        c = re.sub(r"[^a-z0-9&\- ]", " ", _SUFFIX.sub(" ", full.lower()))
        clean[sym] = re.sub(r"\s+", " ", c).strip()
    first_count: dict[str, int] = {}
    for c in clean.values():
        w = c.split(" ")[0] if c else ""
        first_count[w] = first_count.get(w, 0) + 1
    out: dict[str, str] = {}
    for sym, c in clean.items():
        if not c or sym == "NIFTY50":
            continue
        if len(c) >= 4:
            out[c] = sym
        w = c.split(" ")[0]
        if len(w) >= 5 and w not in _GENERIC and first_count.get(w) == 1:
            out.setdefault(w, sym)
    _AUTO = sorted(out.items(), key=lambda kv: -len(kv[0]))


def find_ticker(text: str, universe: set[str]) -> str | None:
    low = text.lower()
    for name, t in sorted(NAME_TO_TICKER.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{re.escape(name)}\b", low):
            return t
    for name, t in _AUTO:
        if t in universe and re.search(rf"(?<![\w&-]){re.escape(name)}(?![\w&-])", low):
            return t
    # NSE symbols can be long and contain digits, '&' and '-': HDFCBANK, BAJAJ-AUTO, M&M
    for tok in re.findall(r"(?<![\w&-])[A-Za-z][A-Za-z0-9&-]{0,11}(?![\w&-])", text):
        up = tok.upper()
        if up in STOP_TICKERS:
            continue
        if up in universe and (tok.isupper() or (len(up) >= 3 and (not _LOWER_OK or up in _LOWER_OK))):
            return up
    spelled = re.search(r"\b((?:[a-z]\s){1,4}[a-z])\b", low)
    if spelled:
        cand = spelled.group(1).replace(" ", "").upper()
        if cand in universe:
            return cand
    return None


def _auto_action(rest: str) -> dict | None:
    """The 'do Y' half of a spoken automation."""
    if re.search(r"\b(scan|breakouts?|setups?)\b", rest):
        then = "plan" if re.search(r"\bplan\b", rest) else "watch" if re.search(r"\b(watch|track)\b", rest) else "notify"
        return {"type": "scan", "then": then}
    if re.search(r"\b(brief|briefing|good morning)\b", rest):
        return {"type": "briefing"}
    if re.search(r"\b(status|summary|update|recap|how am i doing|p ?& ?l)\b", rest):
        return {"type": "summary"}
    if re.search(r"\b(flatten|close everything|close all|exit all)\b", rest):
        return {"type": "flatten", "symbol": "ALL"}
    if re.search(r"\b(lock|freeze)\b", rest):
        return {"type": "halt"}
    return None


def automation_intent(t: str, universe: set[str]):
    """Spoken automations, e.g. 'every 15 minutes scan for breakouts and watch the best one',
    'at 3 pm give me a status update', 'if I'm down 5000 lock the desk', 'list my automations'.
    Orders are never an automation action; halt words keep their own meaning and are matched before this."""
    if re.search(r"\b(list|show|what are|read)\b.*\bautomations?\b|\bmy automations\b", t):
        return "automations_list"
    m = re.match(r"^(?:every|each)\s+(\w+)\s*min(?:ute)?s?\b,?\s*(.+)$", t)
    if m:
        act = _auto_action(m.group(2))
        mins = number(m.group(1))
        if act and mins:
            return ("automation_add", {"trigger": {"type": "every", "minutes": int(mins)}, "action": act})
    m = re.match(r"^(?:at|by)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b,?\s*(.+)$", t)
    if m:
        h, mm, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
        if ap == "pm" and h < 12:
            h += 12
        if ap is None and 1 <= h <= 3:     # market hours: "at 3" means 15:00
            h += 12
        act = _auto_action(m.group(4))
        if act and h < 24 and mm < 60:
            return ("automation_add", {"trigger": {"type": "time", "at": f"{h:02d}:{mm:02d}"}, "action": act})
    m = re.search(r"\b(?:if|when|once) (?:i'?m|i am|we'?re|i get|i go) down (?:by )?(?:rs\.? ?|rupees? |₹)?([\w,]+)"
                  r"|\b(?:if|when) i lose (?:rs\.? ?|₹)?([\w,]+)", t)
    if m:
        val = number((m.group(1) or m.group(2)).replace(",", ""))
        act = _auto_action(t) or {"type": "halt"}
        if val:
            return ("automation_add", {"trigger": {"type": "day_pnl", "value": -abs(float(val))}, "action": act})
    return None


def route(raw: str, *, universe: set[str], pending: bool) -> Intent:
    text, wake = strip_wake(raw)
    t = text.lower().strip(" .!?")
    I = lambda name, **slots: Intent(name, slots, text, wake)  # noqa: E731
    if not t:
        return I("wake_only")
    if HALT.search(t):
        return I("halt")
    if re.match(r"^(yes|yeah|yep|yup)\b", t):
        return I("confirm_yes") if pending else I("yes_no_ticket")
    if pending and re.match(r"^(no|nope|nah|cancel|don'?t|do not|decline|skip it|not now)\b", t):
        return I("confirm_no")
    if re.match(r"^(ok|okay|sure|go ahead|do it|go|fine|alright)\b", t) and len(t.split()) <= 3:
        return I("confirm_invalid") if pending else I("yes_no_ticket")
    m = re.search(r"\bwhat (?:if|happens if) i (?:buy|bought|get)\s+(\w+(?:\s\w+)?)\s+(?:shares? (?:of )?)?(.+)$", t)
    if m and number(m.group(1)) is not None:
        return I("whatif", symbol=find_ticker(m.group(2), universe), qty=int(number(m.group(1))))
    if re.search(r"\b(sectors?|heat ?map|market breadth|breadth|advancers|which sectors)\b", t):
        return I("sectors")
    auto = automation_intent(t, universe)
    if auto:
        return I(auto) if isinstance(auto, str) else I(auto[0], **auto[1])
    if re.search(r"\b(re-?arm)\b", t):
        return I("rearm")
    if re.search(r"\b(help|what can you do|commands)\b", t):
        return I("help")
    if re.search(r"\b(good morning|morning briefing|briefing|what'?s the market doing|is the market open|market clock"
                 r"|how'?s the market)\b", t):
        return I("briefing")
    m = re.search(r"\b(?:go |switch to |turn on |start )?auto ?pilot\b(.*)", t)
    if m and not re.search(r"\b(off|stop|end|disable)\b", t):
        rest = m.group(1)
        hrs = re.search(r"(\w+(?:\s\w+)?)\s*hours?", rest)
        mins = re.search(r"(\w+)\s*min", rest)
        trades = re.search(r"(?:max(?:imum)?|up to|at most)?\s*(\w+)\s*trades?", rest)
        minutes = 120
        if hrs:
            minutes = int((number(hrs.group(1)) or 2) * 60)
        elif mins:
            minutes = int(number(mins.group(1)) or 30)
        return I("autopilot", minutes=minutes, max_trades=int(number(trades.group(1)) or 3) if trades else 3)
    if re.search(r"\b(back to |switch to |go to )?(advise|advisor|advice) mode\b|\bautopilot off\b|\bstop autopilot\b", t):
        return I("set_mode", mode="advise")
    if re.search(r"\bobserve mode\b|\bjust watch\b|^pause$|\bpause trading\b", t):
        return I("set_mode", mode="observe")
    # loosening / tightening limits
    lim = re.search(r"\b(raise|increase|loosen|bump|lift|tighten|lower|reduce|decrease|cut|set|change)\b.*?\b(daily (loss )?limit|"
                    r"loss limit|max(imum)? loss|per[- ]trade|trades? (a|per) day|max(imum)? trades|reward to risk|"
                    r"reward[- ]risk)\b(.*)", t)
    if lim:
        verb, what, rest = lim.group(1), lim.group(2), lim.group(lim.lastindex)
        num_m = re.search(r"(?:to|at)\s+\$?([\w\s.,-]+)$", rest) or re.search(r"\$?([\d.,]+|\w+(?:\s\w+)?)\s*(?:dollars)?$", rest)
        val = number(num_m.group(1)) if num_m else None
        key = ("max_daily_loss_usd" if "daily" in what or what.startswith("loss limit") else
               "max_trades_per_day" if "trade" in what and "per-trade" not in what and "per trade" not in what else
               "min_reward_risk" if "reward" in what else "max_loss_per_trade_usd")
        return I("set_limits", key=key, value=val, verb=verb)
    if re.search(r"\b(how much (have i |did i |am i )?risk(ed|ing)?|risk (used )?today|risk budget|what are my "
                 r"(guard ?rails|limits)|guard ?rails|my limits)\b", t):
        return I("risk_state")
    if re.search(r"\b(balance|p ?& ?l|p and l|profit|how am i doing|positions?|account|equity|portfolio)\b", t) and \
            not re.search(r"\b(close|sell|flatten)\b", t):
        return I("account")
    m = re.search(r"\b(?:alert|tell|ping|notify) me (?:if|when) (.+?) (?:hits|reaches|goes above|crosses|trades above|"
                  r"is above|goes below|drops below|falls below|is below) \$?([\w\s.]+)$", t)
    if m:
        below = bool(re.search(r"below|drops|falls", t))
        return I("alert_add", symbol=find_ticker(m.group(1), universe), price=number(m.group(2)), below=below)
    m = re.search(r"\bremind me at ([\d:]+|[\w\s-]+)", t)
    if m:
        return I("alert_time", at=m.group(1))
    if re.search(r"\b(show|open|go to|take me to)\b.*\b(backtest|ledger|journal|guard ?rails|studio|trade studio|deck|"
                 r"command deck|home|portfolio|holdings)\b", t):
        scr = re.search(r"(backtest|ledger|journal|guard ?rails|studio|deck|home|portfolio|holdings)", t).group(1)
        scr = {"journal": "ledger", "home": "deck", "guard rails": "guardrails", "holdings": "portfolio"}.get(scr, scr)
        if scr == "backtest":
            return I("backtest", symbol=find_ticker(text, universe), strategy=None)
        return I("navigate", screen=scr, symbol=find_ticker(text, universe))
    if re.search(r"\bzoom (in)?(to|on)\b", t):
        return I("navigate", screen="studio", symbol=find_ticker(text, universe))
    if re.search(r"\bbacktest\b|against buy[- ]and[- ]hold|buy and hold", t):
        strat = "level" if "level" in t else "bounce" if "bounce" in t else "orb" if ("orb" in t or "opening" in t) else None
        return I("backtest", symbol=find_ticker(text, universe), strategy=strat)
    if re.search(r"\bwhich strategy\b|\bstrategy (fits|is best)|\bbest strategy\b", t):
        return I("pick_strategy", symbol=find_ticker(text, universe))
    if re.search(r"\b(why did you|why'?d you|explain (the|your)|what happened with|why .* (buy|skip|block|sell))\b", t):
        kind = "trade" if re.search(r"\bbuy|bought|trade\b", t) else "skip" if "skip" in t else "block" if "block" in t else None
        return I("why", symbol=find_ticker(text, universe), kind=kind)
    if re.search(r"\b(read|what'?s in) (me )?(today'?s )?(journal|ledger|stories)\b", t):
        return I("journal")
    if re.search(r"\b(bulk|block) deals?\b|\bbig (trades|deals)\b|\binsider|\bsmart money\b|\bwho (bought|sold)\b", t):
        return I("deals", symbol=find_ticker(text, universe))
    if re.search(r"\b(earnings|report(ed)?|revenue|eps|fundamentals|financials|quarter)\b", t) and \
            find_ticker(text, universe):
        return I("facts", symbol=find_ticker(text, universe))
    if re.search(r"\b(news|headlines|what'?s moving|why is .* (up|down|moving))\b", t):
        return I("news", symbol=find_ticker(text, universe))
    m = re.search(r"\b(close|sell|flatten|exit|get out of)\b\s+(?:my |the |all )?(.+)", t)
    if m:
        if re.search(r"\b(all|everything|every position)\b", m.group(2)):
            return I("flatten_all")
        return I("flatten", symbol=find_ticker(m.group(2), universe))
    m = re.search(r"^(?:buy|purchase|get me|place)\s+(\w+(?:\s\w+)?)\s+(?:shares? (?:of )?)?(.+)$", t)
    if m and number(m.group(1)) is not None:
        return I("plan", symbol=find_ticker(m.group(2), universe), qty=int(number(m.group(1))))
    if re.search(r"\b(scan|breakouts?|find (me )?(a )?setups?|oversold|what should i look at|movers|any setups)\b", t) \
            and not re.search(r"\bplan\b", t):
        both = re.search(r"\b(and|then) (trade|plan|buy) (it|the best|the top)", t)
        return I("scan", then_plan=bool(both), mode="daily" if "oversold" in t or "daily" in t else "orb")
    if re.search(r"\b(plan|trade|set ?up|analy[sz]e|look at|prepare)\b", t) or re.search(r"\bbuy\b", t):
        sym = find_ticker(text, universe)
        best = bool(re.search(r"\b(best|top|first|it|that)( one)?\b", t)) and not sym
        return I("plan", symbol=sym, best=best)
    if re.search(r"\b(size it|how many shares|size the|position size)\b", t):
        return I("size")
    if re.search(r"\b(does it pass|pass risk|break my rules|risk check)\b", t):
        return I("risk_check")
    if re.search(r"\b(odds|time machine|chances|probability)\b", t):
        return I("odds")
    if re.search(r"\b(where'?s the stop|stop loss|the target|the stop)\b", t):
        return I("where_stop")
    sym = find_ticker(text, universe)
    if sym and len(t.split()) <= 2:
        return I("plan", symbol=sym)
    return I("unknown")
