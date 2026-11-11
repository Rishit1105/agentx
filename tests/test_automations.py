"""Automations: rule validation and the plain-English description shown in the UI."""
import pytest

from core.services.automations import TEMPLATES, AutomationError, describe, validate


def test_every_template_is_valid():
    for tpl in TEMPLATES:
        t, a = validate(tpl["trigger"], tpl["action"])
        assert describe(t, a)


@pytest.mark.parametrize("trigger, action, why", [
    ({"type": "time", "at": "9:5"}, {"type": "briefing"}, "HH:MM"),
    ({"type": "every", "minutes": 1}, {"type": "summary"}, "between 5 and 240"),
    ({"type": "price", "symbol": "INFY", "op": "near", "price": 10}, {"type": "say", "text": "x"}, "above|below"),
    ({"type": "day_pnl", "value": 500}, {"type": "halt"}, "negative"),
    ({"type": "risk_used", "pct": 120}, {"type": "halt"}, "between 1 and 100"),
    ({"type": "time", "at": "10:00"}, {"type": "buy", "symbol": "INFY"}, "action type"),
    ({"type": "time", "at": "10:00"}, {"type": "plan"}, "needs a symbol"),
    ({"type": "time", "at": "10:00"}, {"type": "say", "text": ""}, "message"),
])
def test_bad_rules_are_refused(trigger, action, why):
    with pytest.raises(AutomationError, match=why.replace("|", r"\|")):
        validate(trigger, action)


def test_there_is_no_order_placing_action():
    # automations may plan (a ticket that still needs a yes) but can never place an order themselves
    for verb in ("buy", "sell", "approve", "place", "approve_order"):
        with pytest.raises(AutomationError):
            validate({"type": "time", "at": "10:00"}, {"type": verb, "symbol": "INFY"})


def test_price_rule_plans_its_own_symbol_and_reads_well():
    t, a = validate({"type": "price", "symbol": "reliance", "op": "above", "price": 1500}, {"type": "plan"})
    assert a["symbol"] == "RELIANCE"
    assert describe(t, a) == "When RELIANCE goes above ₹1,500.00 → plan a trade on RELIANCE"
