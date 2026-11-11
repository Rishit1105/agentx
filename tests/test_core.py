"""Unit tests for Meridian's safety-critical core: policy, audit chain, exchange, costs, journalist validator,
Speakable and the intent grammar (blueprint T-02, T-04, T-05, T-13, T-14)."""
import os
import sys
from datetime import datetime
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MERIDIAN_DB", "test-meridian.db")

from core.audit import Audit  # noqa: E402
from core.clock import IST, clock  # noqa: E402
from core.conductor.router import number, route  # noqa: E402
from core.costs import inr, order_charges  # noqa: E402
from core.db import DB  # noqa: E402
from core.exchange.engine import ExchangeError, PaperExchange  # noqa: E402
from core.market import market  # noqa: E402
from core.policy import Mandates, Policy  # noqa: E402
from core.services.journalist import validate  # noqa: E402
from core.voice.speakable import speakable  # noqa: E402

LIMITS = {"max_loss_per_trade_usd": 2500, "max_daily_loss_usd": 7500, "max_trades_per_day": 3, "min_reward_risk": 1.0,
          "cash_buffer_pct": 10, "max_position_pct": 75, "max_order_usd": 400000}


@pytest.fixture
def db(tmp_path):
    return DB(tmp_path / "t.db")


@pytest.fixture
def policy(db):
    p = Policy(db, Mandates(db), Audit(db))
    p.paper_ok = True
    return p


def ctx(mode="advise", kill="ARMED", origin="user"):
    return {"mode": mode, "kill_state": kill, "limits": LIMITS, "origin": origin, "paused_reason": None}


# ---------------------------------------------------------------- policy (T-05)
@pytest.mark.parametrize("key,val,verdict", [
    ("max_daily_loss_usd", 20000, "deny"), ("max_daily_loss_usd", 5000, "allow"), ("max_loss_per_trade_usd", 2600, "deny"),
    ("max_loss_per_trade_usd", 1000, "allow"), ("max_trades_per_day", 5, "deny"), ("max_trades_per_day", 2, "allow"),
    ("min_reward_risk", 0.5, "deny"), ("min_reward_risk", 1.5, "allow"), ("cash_buffer_pct", 5, "deny"),
    ("cash_buffer_pct", 20, "allow"), ("max_position_pct", 90, "deny"), ("allow_short", 1, "deny"),
    ("max_daily_loss_usd", 0, "deny"), ("paper", 0, "deny")])
def test_limits_are_tighten_only(policy, key, val, verdict):
    assert policy.authorize("set_limits", {key: val}, ctx()).verdict == verdict


@pytest.mark.parametrize("mode,kill,origin,user_yes,verdict", [
    ("observe", "ARMED", "user", True, "deny"), ("advise", "ARMED", "user", False, "need_confirm"),
    ("advise", "ARMED", "user", True, "allow"), ("advise", "LOCKED", "user", True, "deny"),
    ("advise", "HALTING", "user", True, "deny"), ("autopilot", "ARMED", "scheduler", False, "deny"),   # no mandate
    ("advise", "ARMED", "untrusted", True, "deny")])
def test_order_gate(policy, mode, kill, origin, user_yes, verdict):
    args = {"symbol": "ETERNAL", "side": "buy", "strategy": "orb", "max_loss": 2496.76, "user_yes": user_yes}
    assert policy.authorize("approve_order", args, ctx(mode, kill, origin)).verdict == verdict


def test_exits_always_allowed_even_when_locked(policy):
    assert policy.authorize("approve_order", {"side": "sell"}, ctx("observe", "LOCKED")).verdict == "allow"


def test_paper_assertion_failure_denies_everything(policy):
    policy.paper_ok = False
    assert policy.authorize("scan_market", {}, ctx()).verdict == "deny"


def test_mandate_needs_on_screen_confirm_and_never_loosens(db):
    m = Mandates(db)
    clock.set_replay(datetime(2026, 11, 11, 9, 40, tzinfo=IST), 1)
    with pytest.raises(PermissionError):
        m.grant(60, 3, ["orb"], "any", 2500, {**LIMITS}, confirmed_on_screen=False)
    g = m.grant(60, 9, ["orb"], "any", 99999, {**LIMITS}, confirmed_on_screen=True)
    assert g["max_trades"] == 3 and g["scope"]["max_loss_per_trade"] == 2500
    assert Mandates.covers(g, "ETERNAL", "orb", 2400)[0] and not Mandates.covers(g, "ETERNAL", "bounce", 100)[0]


# ---------------------------------------------------------------- audit chain (T-02)
def test_audit_chain_detects_tampering(db):
    a = Audit(db)
    for i in range(100):
        a.append("tool", i=i)
    assert a.verify()["ok"]
    db.execute("UPDATE audit SET event=replace(event, '\"i\":42', '\"i\":43') WHERE id=43")
    v = a.verify()
    assert not v["ok"] and v["broken_at"] == 43


# ---------------------------------------------------------------- exchange (T-04)
@pytest.fixture
def ex(db):
    market.prepare_replay("2026-11-11")
    clock.set_replay(datetime(2026, 11, 11, 9, 40, tzinfo=IST), 1)
    clock.pause(True)
    return PaperExchange(db, 500000, {})


def bracket(qty=482, stop=365.57, target=375.93):
    return {"symbol": "ETERNAL", "side": "buy", "qty": str(qty), "type": "market", "time_in_force": "day",
            "order_class": "bracket", "take_profit_limit_price": f"{target}", "stop_loss_stop_price": f"{stop}"}


def test_bracket_creates_oco_and_target_cancels_stop(ex):
    ex.place_stock_order(bracket(target=370.0))      # target just above: the next bars reach it
    legs = [o for o in ex.orders("open") if o["order_class"] == "oco"]
    assert {l["leg"] for l in legs} == {"stop", "target"}
    clock.jump(datetime(2026, 11, 11, 15, 10, tzinfo=IST))
    fills = ex.on_tick()
    assert len(fills) == 1 and not ex.positions()
    assert not ex.orders("open")                     # the sibling leg was cancelled


def test_stop_gap_fills_at_the_worse_price(ex):
    ex.place_stock_order(bracket(stop=369.0, target=999.0))
    clock.jump(datetime(2026, 11, 11, 15, 10, tzinfo=IST))
    f = ex.on_tick()[0]
    assert f["leg"] == "stop" and f["price"] <= 369.0


def test_flatten_all_and_cancel_all(ex):
    ex.place_stock_order(bracket())
    assert ex.cancel_all() == 2
    ex.flatten_all()
    assert not ex.positions() and ex.account()["positions"] == 0


def test_no_shorting_and_whole_shares(ex):
    with pytest.raises(ExchangeError):
        ex.place_stock_order({"symbol": "ETERNAL", "side": "sell", "qty": "5", "type": "market"})
    with pytest.raises(ExchangeError):
        ex.place_stock_order(bracket(qty=1.5))


# ---------------------------------------------------------------- costs & formatting
def test_indian_intraday_charges():
    buy = order_charges("buy", 370.0, 482)
    sell = order_charges("sell", 375.0, 482)
    assert buy["brokerage"] == 20.0 and buy["stt"] == 0 and buy["stamp"] > 0
    assert sell["stt"] == round(375 * 482 * 0.00025, 2) and sell["stamp"] == 0
    assert inr(500000) == "₹5,00,000.00" and inr(-2497.5) == "−₹2,497.50" and inr(123456789, 0) == "₹12,34,56,789"


# ---------------------------------------------------------------- journalist validator (T-13)
def test_validator_rejects_invented_numbers():
    ev = {"qty": 482, "entry": 370.75, "stop": 365.57, "max_loss": 2496.76, "symbol": "ETERNAL"}
    assert validate("I bought 482 ETERNAL at 370.75 risking ₹2,496.76.", ev, {"ETERNAL", "INFY"}) == []
    errs = validate("I bought 500 ETERNAL at 371.00 and INFY looked strong.", ev, {"ETERNAL", "INFY"})
    assert any("500" in e for e in errs) and any("INFY" in e for e in errs)


# ---------------------------------------------------------------- speakable (T-14)
@pytest.mark.parametrize("text,spoken", [
    ("₹2,497.50", "two thousand four hundred ninety-seven rupees and fifty paise"),
    ("₹5,00,000", "five lakh rupees"), ("10:15", "ten fifteen"), ("INFY", "Infosys"), ("M&M", "Mahindra"),
    ("−₹1,928.00", "minus one thousand nine hundred twenty-eight rupees")])
def test_speakable(text, spoken):
    assert speakable(text) == spoken


# ---------------------------------------------------------------- intent grammar
U = {"ETERNAL", "INFY", "M&M", "BAJAJ-AUTO", "HDFCBANK", "RELIANCE"}


@pytest.mark.parametrize("text,intent,slots", [
    ("Hey Meridian, stop everything", "halt", {}), ("halt", "halt", {}),
    ("plan a trade on zomato", "plan", {"symbol": "ETERNAL"}), ("buy 600 zomato", "plan", {"symbol": "ETERNAL", "qty": 600}),
    ("close m&m", "flatten", {"symbol": "M&M"}), ("plan BAJAJ-AUTO", "plan", {"symbol": "BAJAJ-AUTO"}),
    ("raise my daily loss limit to twenty thousand", "set_limits", {"value": 20000.0}),
    ("tighten the daily limit to five thousand rupees", "set_limits", {"value": 5000.0}),
    ("any bulk deals", "deals", {}), ("go autopilot for two hours, max three trades", "autopilot", {"minutes": 120})])
def test_router(text, intent, slots):
    i = route(text, universe=U, pending=False)
    assert i.name == intent and all(i.slots.get(k) == v for k, v in slots.items())


def test_confirmation_grammar():
    assert route("yes, buy 482 ETERNAL", universe=U, pending=True).name == "confirm_yes"
    assert route("sure", universe=U, pending=True).name == "confirm_invalid"
    assert route("no", universe=U, pending=True).name == "confirm_no"


@pytest.mark.parametrize("s,n", [("five hundred", 500), ("two lakh", 200000), ("one crore", 10000000),
                                 ("three seventy", 370), ("₹7,500", 7500), ("two and a half", 2.5)])
def test_numbers(s, n):
    assert number(s) == n
