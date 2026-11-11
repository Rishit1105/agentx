"""What-if simulator and market map: pure-function checks that need no running core."""
import types

import pytest

from core.services import whatif
from core.services.marketmap import _mood


class FakeMarket:
    def __init__(self, px=100.0, bars=None):
        self.px, self._bars = px, bars or []

    def symbols(self):
        return ["ABC"]

    def price(self, sym):
        return self.px

    def bars(self, sym, include_forming=False):
        return self._bars

    def name(self, sym):
        return "ABC Ltd"


def desk(px=100.0, bars=None, committed=0.0, trades_used=0):
    cfg = {"budget": 500000, "max_loss_per_trade_usd": 2500, "max_position_pct": 75, "max_order_usd": 400000,
           "cash_buffer_pct": 10, "min_reward_risk": 1.0, "meridian_costs": None}
    return types.SimpleNamespace(
        market=FakeMarket(px, bars), cfg=cfg,
        exchange=types.SimpleNamespace(account=lambda: {"cash": 500000.0}),
        risk_used=lambda: {"daily_limit": 7500.0, "committed": committed, "max_trades": 3, "trades_used": trades_used})


ORB = [{"h": 102, "l": 96, "c": 100}, {"h": 101, "l": 97, "c": 100}, {"h": 100, "l": 98, "c": 100}]   # OR mid = 99


def test_orb_stop_and_max_loss_binding():
    r = whatif.simulate(desk(100.0, ORB), "abc")
    assert r["stop"] == 99.0 and r["stop_rule"] == "opening-range midpoint"
    assert r["binding"] == "max loss per trade" and r["max_allowed"] == 2500 and r["verdict"] == "PASS"


def test_oversize_is_blocked_with_the_reason():
    r = whatif.simulate(desk(100.0, ORB), "ABC", qty=3000)
    assert r["verdict"] == "BLOCK" and "max loss per trade" in r["breaches"]
    assert "2500" in r["why"]


def test_daily_budget_left_binds_late_in_the_day():
    r = whatif.simulate(desk(100.0, ORB, committed=7000.0), "ABC")
    assert r["binding"] == "daily loss left" and r["max_allowed"] == 500


def test_tight_stop_warns_that_charges_eat_the_trade():
    r = whatif.simulate(desk(100.0, ORB), "ABC", qty=10, stop=99.9)
    assert any("charges" in w for w in r["warnings"])


def test_unknown_symbol_and_bad_stop_are_refused():
    with pytest.raises(whatif.WhatIfError):
        whatif.simulate(desk(), "NOPE")
    with pytest.raises(whatif.WhatIfError):
        whatif.simulate(desk(), "ABC", stop=101)


@pytest.mark.parametrize("adv, dec, mood", [(0, 0, "waiting for the first bar"), (300, 100, "broad rally"),
                                            (200, 140, "risk-on"), (100, 100, "mixed"), (60, 100, "risk-off"),
                                            (20, 400, "broad sell-off")])
def test_breadth_mood(adv, dec, mood):
    assert _mood(adv, dec) == mood
