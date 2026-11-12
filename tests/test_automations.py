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


@pytest.mark.parametrize("said, trigger, action", [
    ("every 15 minutes scan for breakouts and watch the best one", {"type": "every", "minutes": 15},
     {"type": "scan", "then": "watch"}),
    ("at 3 pm give me a status update", {"type": "time", "at": "15:00"}, {"type": "summary"}),
    ("at 9:16 good morning briefing", {"type": "time", "at": "09:16"}, {"type": "briefing"}),
    ("if I'm down 5000 lock the desk", {"type": "day_pnl", "value": -5000.0}, {"type": "halt"}),
    ("if I lose 5,000 flatten everything", {"type": "day_pnl", "value": -5000.0}, {"type": "flatten", "symbol": "ALL"}),
])
def test_spoken_automations(said, trigger, action):
    from core.conductor.router import route
    it = route(said, universe={"RELIANCE"}, pending=False)
    assert it.name == "automation_add" and it.slots == {"trigger": trigger, "action": action}


def test_halt_words_still_halt_immediately():
    from core.conductor.router import route
    assert route("stop everything", universe=set(), pending=False).name == "halt"
    assert route("list my automations", universe=set(), pending=False).name == "automations_list"


@pytest.mark.parametrize("said, english", [
    ("Zomato mein trade plan karo", "plan a trade on zomato"),
    ("haan, 482 ETERNAL khareedo", "yes, buy 482 ETERNAL"),
    ("हाँ 482 ETERNAL खरीदो", "yes, buy 482 ETERNAL"),
    ("sab band karo", "stop everything"),
    ("सब बंद करो", "stop everything"),
    ("breakouts scan karo", "scan for breakouts"),
    ("agar main 300 infosys khareedu to?", "what if I buy 300 infosys"),
    ("haan", "yes"),
])
def test_hinglish_commands_normalise_to_the_english_grammar(said, english):
    from core.conductor.hindi import to_english
    assert to_english(said) == (english, True)


def test_english_passes_through_and_replies_localise():
    from core.conductor.hindi import localize, to_english
    assert to_english("plan a trade on zomato") == ("plan a trade on zomato", False)
    assert localize("Ticket cancelled. Nothing was placed.") == "टिकट रद्द। कोई ऑर्डर नहीं लगा।"
    assert localize("Something unexpected") == "Something unexpected"
