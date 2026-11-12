"""Tilt guard and compliance: pure checks with a fake desk (no running core)."""
import types
from datetime import timedelta

import pytest

from core.clock import clock
from core.services import tilt as tilt_mod
from core.services.compliance import MOODS, registry


def fake_desk(day_pnl=0.0):
    audit = types.SimpleNamespace(append=lambda *a, **k: None)
    bus = types.SimpleNamespace(emit=lambda *a, **k: None)
    return types.SimpleNamespace(audit=audit, bus=bus, cfg={"max_daily_loss_usd": 7500},
                                 exchange=types.SimpleNamespace(account=lambda: {"day_pnl": day_pnl}))


def closed(symbol, net, leg, minutes_ago):
    ts = (clock.now() - timedelta(minutes=minutes_ago)).isoformat()
    return {"symbol": symbol, "net": net, "exit_leg": leg, "exit_ts": ts}


@pytest.fixture
def guard(monkeypatch):
    def make(trades, risks=(), day_pnl=0.0):
        g = tilt_mod.TiltGuard(fake_desk(day_pnl))
        monkeypatch.setattr(g, "_closed", lambda: list(trades))
        monkeypatch.setattr(g, "_session_risks", lambda: list(risks))
        return g
    return make


def test_clean_session_is_ok(guard):
    assert guard([]).assess("INFY", 2000)["level"] == "ok"


def test_same_symbol_after_a_loss_starts_a_cooldown(guard):
    g = guard([closed("ETERNAL", -2000, "stop", 5)])
    r = g.assess("ETERNAL", 2400)
    assert r["level"] == "cooldown" and r["signals"][0]["kind"] == "revenge"
    assert g.gate() and "tilt cool-down" in g.gate()


def test_any_entry_right_after_a_stop_is_revenge(guard):
    r = guard([closed("SUNTV", -1500, "stop", 4)]).assess("INFY", 2000)
    assert r["level"] == "cooldown"


def test_size_jump_alone_only_warns(guard):
    r = guard([closed("SUNTV", 900, "target", 90)], risks=[1000, 1200]).assess("INFY", 2400)
    assert r["level"] == "warn" and r["signals"][0]["kind"] == "size"


def test_two_signals_escalate_to_cooldown(guard):
    r = guard([closed("A", -500, "flatten", 90), closed("B", -600, "flatten", 80)], day_pnl=-4000).assess("INFY", 1000)
    kinds = {s["kind"] for s in r["signals"]}
    assert {"streak", "chase"} <= kinds and r["level"] == "cooldown"


def test_registry_has_ids_and_a_param_hash():
    reg = registry({"max_loss_per_trade_usd": 2500})
    assert {a["algo_id"] for a in reg} == {"MRD-ORB-01", "MRD-LVL-01", "MRD-BNC-01"}
    assert all(len(a["params_hash"]) == 12 for a in reg)
    assert registry({"max_loss_per_trade_usd": 2000})[0]["params_hash"] != reg[0]["params_hash"]


def test_moods_include_the_honest_ones():
    assert {"calm", "fomo", "revenge"} <= set(MOODS)
