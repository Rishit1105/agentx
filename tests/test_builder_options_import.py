"""Strategy builder parser, options maths and holdings import parsing: pure functions, no running core."""
import math

import pytest

from core.services import holdings_import as hi
from core.services import options as opt
from core.services.strategy_builder import BuilderError, describe, parse


def test_parse_n_day_high_with_volume_atr_and_target():
    s = parse("buy when price closes above the 20-day high with volume over 1.5x, stop 1.5 ATR, target 2R")
    assert s["entry"] == {"type": "n_day_high", "n": 20}
    assert s["volume_mult"] == 1.5 and s["stop"] == {"type": "atr", "k": 1.5} and s["target_r"] == 2.0


def test_parse_opening_range_minutes_and_gap_percent():
    assert parse("buy the opening range breakout of the first 30 minutes")["entry"] == {"type": "or_breakout", "minutes": 30}
    assert parse("buy a bounce after a 2% gap down, stop at the session low")["entry"] == {"type": "gap_bounce", "gap_pct": 2.0}


def test_parse_refuses_a_rule_without_an_entry():
    with pytest.raises(BuilderError):
        parse("sell everything now")


def test_describe_is_plain_english():
    assert describe(parse("buy above 1500 with stop 1% target 2R")).startswith("Buy on a close above ₹1,500.00")


def test_black_scholes_put_call_parity():
    S, K, T, v = 1000.0, 1000.0, 30 / 365, 0.25
    c, p = opt.bs("call", S, K, T, v)["price"], opt.bs("put", S, K, T, v)["price"]
    assert c - p == pytest.approx(S - K * math.exp(-opt.RATE * T), abs=0.05)


def test_spread_legs_are_defined_risk():
    legs = opt.legs_for("iron_condor", 25000, 50, 2)
    assert [l["side"] for l in legs] == ["buy", "sell", "sell", "buy"]
    with pytest.raises(opt.OptionsError):
        opt.legs_for("naked_short_call", 25000, 50, 2)


def test_import_parses_zerodha_console_csv():
    rows = hi.parse("Instrument,Qty.,Avg. cost\nRELIANCE,40,1250.5\nINFY-EQ,25,\"1,500\"\nBAD,0,1\n")
    assert rows == [{"symbol": "RELIANCE", "qty": 40.0, "avg_cost": 1250.5}, {"symbol": "INFY", "qty": 25.0, "avg_cost": 1500.0}]


def test_import_parses_json_and_rejects_empty():
    assert hi.parse('[{"tradingsymbol": "TCS", "quantity": 3, "average_price": 3000}]')[0]["symbol"] == "TCS"
    with pytest.raises(hi.ImportError_):
        hi.parse("Instrument,Qty.\n")
