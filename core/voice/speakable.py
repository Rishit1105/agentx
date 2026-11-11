"""Speakable: turns prices, tickers, times and percentages into words the TTS cannot misread.

"$46.88" -> "forty-six dollars eighty-eight", "358.32" -> "three fifty-eight thirty-two", "TSLA" -> "Tesla",
"10:15" -> "ten fifteen", "0.55%" -> "zero point five five percent", "₹2,497.50" -> "two thousand four hundred
ninety-seven rupees and fifty paise", "₹5,00,000" -> "five lakh rupees", "INFY" -> "Infosys".
"""
from __future__ import annotations

import re

ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
        "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

NAMES = {"RELIANCE": "Reliance", "TCS": "T C S", "INFY": "Infosys", "HDFCBANK": "H D F C Bank", "ICICIBANK": "I C I C I Bank",
         "SBIN": "State Bank", "BHARTIARTL": "Bharti Airtel", "ITC": "I T C", "LT": "L and T", "AXISBANK": "Axis Bank",
         "KOTAKBANK": "Kotak Bank", "BAJFINANCE": "Bajaj Finance", "BAJAJFINSV": "Bajaj Finserv", "MARUTI": "Maruti",
         "M&M": "Mahindra", "TATASTEEL": "Tata Steel", "SUNPHARMA": "Sun Pharma", "HCLTECH": "H C L Tech", "WIPRO": "Wipro",
         "TITAN": "Titan", "ASIANPAINT": "Asian Paints", "ULTRACEMCO": "UltraTech Cement", "NTPC": "N T P C",
         "POWERGRID": "Power Grid", "ONGC": "O N G C", "COALINDIA": "Coal India", "ADANIENT": "Adani Enterprises",
         "ADANIPORTS": "Adani Ports", "HINDALCO": "Hindalco", "JSWSTEEL": "J S W Steel", "NESTLEIND": "Nestle India",
         "HINDUNILVR": "Hindustan Unilever", "ETERNAL": "Eternal", "INDIGO": "IndiGo", "HAL": "H A L", "BEL": "B E L",
         "DMART": "D Mart", "TRENT": "Trent", "BAJAJ-AUTO": "Bajaj Auto", "EICHERMOT": "Eicher Motors",
         "HEROMOTOCO": "Hero MotoCorp", "CIPLA": "Cipla", "DRREDDY": "Doctor Reddy's", "TECHM": "Tech Mahindra",
         "BOSCHLTD": "Bosch", "BSE": "B S E", "GODREJCP": "Godrej Consumer", "JINDALSTEL": "Jindal Steel",
         "MAZDOCK": "Mazagon Dock", "VEDL": "Vedanta", "TATAPOWER": "Tata Power", "TVSMOTOR": "T V S Motor",
         "SHRIRAMFIN": "Shriram Finance", "SBILIFE": "S B I Life", "HDFCLIFE": "H D F C Life", "GRASIM": "Grasim",
         "NIFTY50": "the Nifty fifty", "NIFTY": "the Nifty", "NSE": "N S E", "ORB": "opening-range breakout",
         "IST": "India time", "INR": "rupees", "MIS": "intraday", "SEBI": "SEBI", "R": "R"}


def int_words(n: int) -> str:
    if n < 0:
        return "minus " + int_words(-n)
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return ONES[n // 100] + " hundred" + (" " + int_words(n % 100) if n % 100 else "")
    for div, word in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= div:
            return int_words(n // div) + " " + word + (" " + int_words(n % div) if n % div else "")
    return str(n)


def pair(n: int) -> str:
    """Two-digit chunk read the trader's way: 5 -> 'oh-five', 32 -> 'thirty-two'."""
    if n == 0:
        return "hundred"
    if n < 10:
        return "oh-" + ONES[n]
    return int_words(n)


def price_words(x: str) -> str:
    """'358.32' -> 'three fifty-eight thirty-two'; '370.04' -> 'three seventy oh-four'; '2913.44' -> 'twenty-nine thirteen forty-four'."""
    whole, _, cents = x.partition(".")
    w = int(whole.replace(",", "") or 0)
    if 100 <= w < 10000 and w % 100 != 0:
        head = int_words(w // 100) + " " + pair(w % 100)
    else:
        head = int_words(w)
    if cents and int(cents.ljust(2, "0")[:2]):
        return head + " " + pair(int(cents.ljust(2, "0")[:2])).replace("hundred", "")
    return head


def indian_words(n: int) -> str:
    """Indian numbering: 250000 -> 'two lakh fifty thousand', 33060100000 -> 'three thousand three hundred six crore ...'."""
    if n >= 10**7:
        return int_words(n // 10**7) + " crore" + (" " + indian_words(n % 10**7) if n % 10**7 else "")
    if n >= 10**5:
        return int_words(n // 10**5) + " lakh" + (" " + indian_words(n % 10**5) if n % 10**5 else "")
    return int_words(n)


def rupees_words(x: str) -> str:
    whole, _, paise = x.replace(",", "").partition(".")
    w = int(whole or 0)
    s = indian_words(w) + (" rupee" if w == 1 else " rupees")
    p = int(paise.ljust(2, "0")[:2]) if paise else 0
    return s + (" and " + int_words(p) + " paise" if p else "")


dollars_words = rupees_words


def decimal_words(x: str) -> str:
    whole, _, frac = x.partition(".")
    s = int_words(int(whole.replace(",", "") or 0))
    return s + (" point " + " ".join(ONES[int(d)] for d in frac) if frac else "")


def time_words(h: int, m: int) -> str:
    hh = h % 12 or 12
    if m == 0:
        return int_words(hh) + " o'clock"
    return int_words(hh) + " " + (("oh-" + ONES[m]) if m < 10 else int_words(m))


def speakable(text: str, known_tickers: set[str] | None = None) -> str:
    t = text.replace("P&L", "P and L")
    t = re.sub(r"[−-](?=₹)", "minus ", t)
    t = re.sub(r"(?:₹|Rs\.?\s?)(\d[\d,]*)(?:\.\d+)?\s?(?:cr|crore)\b",
               lambda m: indian_words(int(m.group(1).replace(",", ""))) + " crore rupees", t)
    t = re.sub(r"(?:₹|Rs\.?\s?|\$)(\d[\d,]*(?:\.\d+)?)", lambda m: rupees_words(m.group(1)), t)
    t = re.sub(r"−(?=\s?\d)", "minus ", t)
    t = re.sub(r"(-?\d+(?:\.\d+)?)\s?%", lambda m: ("minus " if m.group(1).startswith("-") else "")
               + decimal_words(m.group(1).lstrip("-")) + " percent", t)
    t = re.sub(r"\b(\d{1,2}):(\d{2})\b", lambda m: time_words(int(m.group(1)), int(m.group(2))), t)
    t = re.sub(r"([+-]?\d+(?:\.\d+)?)R\b", lambda m: decimal_words(m.group(1).lstrip("+-")) + " R", t)
    t = re.sub(r"\b(\d{5,})\.00\b", r"\1", t)
    t = re.sub(r"\b(\d{2,4}\.\d{2})\b", lambda m: price_words(m.group(1)), t)
    t = re.sub(r"\b(\d+\.\d+)\b", lambda m: decimal_words(m.group(1)), t)
    t = re.sub(r"\b(\d{1,3}(?:,\d{2,3})+|\d+)\b", lambda m: indian_words(int(m.group(1).replace(",", ""))), t)

    def tick(m):
        w = m.group(0)
        if w in NAMES:
            return NAMES[w]
        if known_tickers and w in known_tickers:
            return " ".join(w)
        return w
    t = re.sub(r"(?<![\w&-])[A-Z][A-Z0-9&-]{0,11}(?![\w&-])", tick, t)   # NSE symbols: M&M, BAJAJ-AUTO
    return re.sub(r"\s+", " ", t).strip()


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p for p in parts if p]
