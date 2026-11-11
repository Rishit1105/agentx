"""India (NSE) edition of day-trader-skill: contract tests on the real recorded NSE session of 11 Nov 2026.

Runs each CLI exactly as Meridian's Skill Adapter does (python -I, --offline, --now in IST) in a temp workdir.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
R = ROOT / "vendor" / "day-trader-skill-in"
F = ROOT / "replay" / "fixtures-in"
NOW = "2026-11-11 09:40"
pytestmark = pytest.mark.skipif(not (F / "charts60" / "ETERNAL.json.gz").exists(), reason="run scripts/record_nse.py first")


def run(wd, skill, script, *args):
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    p = subprocess.run([sys.executable, "-I", str(R / skill / script), *map(str, args)], cwd=wd, capture_output=True, env=env)
    return p.returncode, p.stdout.decode("utf-8"), p.stderr.decode("utf-8")


@pytest.fixture
def wd(tmp_path):
    (tmp_path / "trader" / "state").mkdir(parents=True)
    (tmp_path / "trader" / "config.json").write_text((R / "trader-budget" / "config.example.json").read_text(encoding="utf-8"),
                                                     encoding="utf-8")
    return tmp_path


def chain(wd, sym="ETERNAL", now=NOW):
    code, out, err = run(wd, "trader-entry", "entry.py", "check", sym, "--offline", F / "charts60", "--now", now, "--write", "--json")
    entry = json.loads(out)
    run(wd, "trader-exit", "exit.py", "plan", "--stop", "or-mid", "--target", "1R", "--now", now, "--write", "--json")
    return entry


def test_config_is_inr_and_nse_hours():
    cfg = json.loads((R / "trader-budget" / "config.example.json").read_text(encoding="utf-8"))
    assert (cfg["budget"], cfg["max_loss_per_trade_usd"], cfg["max_daily_loss_usd"]) == (500000, 2500, 7500)
    assert (cfg["no_entries_before"], cfg["no_entries_after"], cfg["flat_by"]) == ("09:30", "15:00", "15:15")
    assert cfg["paper"] is True and cfg["currency"] == "INR"


def test_nse_clock_holiday_and_hours(wd):
    code, out, _ = run(wd, "trader-alerts", "alerts.py", "clock", "--now", "2026-11-10 10:00", "--json")
    d = json.loads(out)
    assert d["open"] is False and "Diwali" in d["reason"] and d["next_open"] == "2026-11-11 09:15"
    code, out, _ = run(wd, "trader-alerts", "alerts.py", "clock", "--now", "2026-11-11 09:20", "--json")
    assert json.loads(out)["open"] is True
    code, out, _ = run(wd, "trader-alerts", "alerts.py", "clock", "--now", "2026-11-11 15:31", "--json")
    assert json.loads(out)["open"] is False


def test_scanner_finds_nse_breakouts(wd):
    code, out, _ = run(wd, "trader-scanner", "scan.py", "orb", "--offline", F / "charts60", "--now", NOW,
                       "--min-price", "0", "--min-volume", "0", "--json")
    d = json.loads(out)
    assert d["scanned"] == 101 and len(d["hits"]) == 26
    assert any(h["symbol"] == "ETERNAL" and h["price"] == 370.75 for h in d["hits"])
    assert d["as_of"].endswith("IST")


def test_entry_exit_on_ist_bars(wd):
    e = chain(wd)
    assert e["status"] == "triggered" and e["opening_range"]["high"] < e["trigger"]["price"]
    plan = json.loads((wd / "trader" / "plan.json").read_text(encoding="utf-8"))
    assert (plan["entry"], plan["stop"], plan["target"], plan["flat_by"]) == (370.75, 365.57, 375.93, "15:15")


def test_symbols_with_ampersand_and_dash(wd):
    for sym in ("M&M", "BAJAJ-AUTO"):
        code, out, err = run(wd, "trader-entry", "entry.py", "check", sym, "--offline", F / "charts60", "--now", NOW, "--json")
        assert json.loads(out)["symbol"] == sym, err


def test_time_machine_uses_real_nse_sessions(wd):
    chain(wd)
    code, out, err = run(wd, "trader-timemachine", "timemachine.py", "run", "--offline", F / "charts60" / "ETERNAL.json.gz",
                         "--now", NOW, "--write", "--json")
    d = json.loads(out)
    assert d["history"]["sessions"] >= 55 and d["mc"]["replays"] == 10000
    assert abs(d["mc"]["p_target"] + d["mc"]["p_stop"] + d["mc"]["p_neither"] - 1) < 0.01


def test_sizing_and_risk_in_rupees(wd):
    chain(wd)
    code, out, _ = run(wd, "trader-budget", "size.py", "--now", NOW, "--write", "--json")
    s = json.loads(out)["sizing"]
    assert (s["qty"], s["bound_by"], s["max_loss"]) == (482, "max loss", 2496.76)
    assert any("₹5,00,000" in l["how"] for l in s["limits"])          # Indian digit grouping
    code, out, _ = run(wd, "trader-risk", "check.py", "--now", NOW, "--json")
    assert json.loads(out)["results"][0]["verdict"] == "PASS"
    code, out, _ = run(wd, "trader-risk", "check.py", "--now", "2026-11-11 15:05", "--json", "--no-write")
    r = json.loads(out)["results"][0]
    assert r["verdict"] == "BLOCK" and any("15:00" in x for x in r["reasons"])


def test_broker_requires_an_explicit_yes(wd):
    chain(wd)
    run(wd, "trader-budget", "size.py", "--now", NOW, "--write", "--json")
    run(wd, "trader-risk", "check.py", "--now", NOW, "--json")
    assert run(wd, "trader-broker", "ticket.py", "approve", "--index", "1", "--reply", "sure go ahead", "--now", NOW)[0] == 1
    assert run(wd, "trader-broker", "ticket.py", "approve", "--index", "1", "--reply", "yes, buy 482 ETERNAL", "--now", NOW)[0] == 0
    state = json.loads((wd / "trader" / "state" / "broker.json").read_text(encoding="utf-8"))
    assert state["orders"][-1]["at"].endswith("+05:30")


def test_analyst_keeps_reported_currency(wd):
    code, out, _ = run(wd, "trader-analyst", "facts.py", "RELIANCE", "INFY", "--offline", F / "fundamentals", "--json")
    d = {x["ticker"]: x["result"] for x in json.loads(out)}
    assert d["RELIANCE"]["currency"] == "INR" and d["RELIANCE"]["rows"][0]["fiscal"].startswith("Q")
    assert d["INFY"]["currency"] == "USD"          # Infosys files in USD: never mislabel it as rupees


def test_bulk_deals(wd):
    code, out, _ = run(wd, "trader-deals", "deals.py", "index", "--offline", F / "nse", "--json", "--limit", "5")
    deals = json.loads(out)
    assert deals and all(d["value_inr"] == round(d["qty"] * d["price"], 2) for d in deals)
    code, out, _ = run(wd, "trader-deals", "deals.py", "new", "--offline", F / "nse", "--json", "--state", "s.json")
    first = len(json.loads(out))
    code, out, _ = run(wd, "trader-deals", "deals.py", "new", "--offline", F / "nse", "--json", "--state", "s.json")
    assert first > 0 and json.loads(out) == []      # alerts once per deal


def test_news_is_point_in_time(wd):
    code, out, _ = run(wd, "trader-news", "news.py", "--tickers", "HDFCBANK", "--hours", "24", "--no-sec", "--no-moves",
                       "--offline", F / "news", "--now", "2026-11-11T09:40:00+05:30", "--json", "--dry-run",
                       "--portfolio", "x", "--watchlist", "x", "--plan", "x")
    items = json.loads(out)["items"]
    assert items and all(i["time"] <= "2026-11-11T04:10:00+00:00" for i in items)   # nothing after the replay clock
