"""End-to-end acceptance run against a live core — NSE replay of 11 Nov 2026 (blueprint section 19 + 20).

Usage:  .venv/Scripts/python scripts/e2e_replay.py            (core must be running on :8000)
Exit code 0 only if every check passes. All expected numbers come from the recorded real NSE session.
"""
from __future__ import annotations

import json
import sys
import time

import httpx

BASE = "http://127.0.0.1:8000"
c = httpx.Client(base_url=BASE, timeout=300)
results: list[tuple[str, bool, str]] = []
DATE = "2026-11-11"


def check(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))


def say(text: str) -> dict:
    r = c.post("/api/chat", json={"text": text}).json()
    print(f"   you> {text}\n   meridian> {r.get('reply')}")
    return r


def ctl(**kw):
    return c.post("/api/replay/control", json=kw).json()


def fresh(start="09:40"):
    c.post("/api/replay/start", json={"date": DATE, "start": start, "speed": 20, "paused": True})


def main():
    fresh()
    st = c.get("/api/state").json()
    check("paper-only assertion passed at boot", st["paper"].get("ok") is True)
    check("market is NSE / INR / IST", st["market"] == {"exchange": "NSE", "currency": "INR", "tz": "IST", "index": "NIFTY 50"})
    check("limits are INR (₹5,00,000 budget, ₹2,500 per trade, ₹7,500 a day)",
          (st["limits"]["budget"], st["limits"]["max_loss_per_trade_usd"], st["limits"]["max_daily_loss_usd"]) == (500000, 2500, 7500))
    check("NSE session phases (entry window at 09:40 IST)", st["clock"]["phase"] == "entry_window" and st["clock"]["tz"] == "IST")

    r = say("Hey Meridian, scan for breakouts")
    check("scan finds NIFTY 100 opening-range breakouts", "of the NIFTY 100 closed above" in (r.get("reply") or ""), r.get("reply", "")[:60])

    r = say("plan a trade on zomato")          # spoken name -> ETERNAL
    t = c.get("/api/state").json()["ticket"] or {}
    check("ticket: BUY 482 ETERNAL, stop 365.57, target 375.93, max loss ₹2,496.76",
          (t.get("symbol"), t.get("qty"), t.get("stop"), t.get("target"), t.get("max_loss")) == ("ETERNAL", 482, 365.57, 375.93, 2496.76),
          json.dumps({k: t.get(k) for k in ("symbol", "qty", "stop", "target", "max_loss")}))
    check("Time Machine ran on 60 real NSE sessions", bool(t.get("odds", {}).get("target")), t.get("tm_verdict"))

    r = say("sure, go ahead")
    check("'sure, go ahead' is rejected (repo parse_yes rules)", r.get("intent") == "confirm_invalid")
    r = say("yes, buy 482 ETERNAL")
    pos = c.get("/api/positions").json()
    p = (pos["positions"] or [{}])[0]
    check("spoken yes places the paper bracket", p.get("qty") == 482 and p.get("stop") == 365.57)
    check("Indian charges applied (brokerage/STT/stamp/exchange/GST)", 0 < pos["account"]["fees"] < 100, f"₹{pos['account']['fees']}")
    broker = json.load(open("trader/state/broker.json", encoding="utf-8"))
    check("repo approval log has the user's words", any(o.get("reply") == "yes, buy 482 ETERNAL" for o in broker["orders"]))

    r = say("buy 600 zomato")
    check("600 shares BLOCKED with the ₹ max-loss reason", "₹3,108" in (r.get("reply") or ""))
    r = say("raise my daily loss limit to twenty thousand")
    check("voice cannot loosen limits", "can't loosen" in (r.get("reply") or ""))
    r = say("why did you buy zomato")
    check("why -> the trade Story", "bought 482 ETERNAL" in (r.get("reply") or ""))
    r = say("any bulk deals")
    check("Bulk Deals agent (NSE disclosures)", "deals" in (r.get("reply") or ""), (r.get("reply") or "")[:80])
    r = say("how did reliance report")
    check("Analyst reads quarterly results in ₹ crore", "crore" in (r.get("reply") or ""), (r.get("reply") or "")[:80])

    rep = c.post("/api/backtest/ETERNAL", json={"strategy": "orb"}).json()
    check("backtest vs buy-and-hold vs NIFTY 50", rep["strategy_stats"]["trades"] > 0 and rep["buy_hold"]["net_return_pct"] is not None
          and rep.get("index_hold") is not None, rep.get("verdict"))
    pdf = c.get("/api/report/ETERNAL.pdf")
    check("PDF report exports", pdf.status_code == 200 and pdf.content[:4] == b"%PDF")

    ctl(speed=120, paused=False)
    time.sleep(12)
    ctl(jump="15:13", speed=4)
    t0 = time.time()
    while time.time() - t0 < 90 and c.get("/api/positions").json()["positions"]:
        time.sleep(2)
    ctl(paused=True)
    st = c.get("/api/state").json()
    check("Sentinel did not false-trigger during the session", st["kill"]["state"] == "ARMED")
    trade = next((s for s in c.get("/api/stories").json() if s["kind"] == "trade"), None)
    check("position exited (stop/target/15:15 flat-by) and the Story closed with ₹ P&L",
          bool(trade and trade["status"] == "closed"), trade and trade["outcome"][-110:])

    fresh()
    say("plan a trade on zomato")
    say("yes, buy 482 ETERNAL")
    check("second session: position open before halt", bool(c.get("/api/positions").json()["positions"]))
    say("stop everything")
    st = c.get("/api/state").json()
    check("halt: LOCKED, flat, no open orders", st["kill"]["state"] == "LOCKED" and not st["positions"] and not st["orders"])
    r = say("plan a trade on infosys")
    check("entries refused while locked", "locked" in (r.get("reply") or "").lower() or "re-arm" in (r.get("reply") or "").lower())
    v = c.get("/api/audit/verify").json()
    check("audit hash chain verifies", v["ok"], f"{v['rows']} rows")
    halt_story = next(s for s in c.get("/api/stories").json() if s["kind"] == "halt")
    check("Kill Story records the flatten", "ETERNAL" in halt_story["checked"], halt_story["checked"])

    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
