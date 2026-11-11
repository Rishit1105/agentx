# Meridian features and voice commands

Everything below works by voice (wake phrase "Hey Meridian", hold Space, or click the Orb), by typing in the chat bar,
or from the command palette (⌘K / the top-bar search). Safety words are matched by a deterministic grammar and never
reach a language model.

## Trading flow

| Say | What happens |
| --- | --- |
| "Hey Meridian, good morning" | Market clock, breadth, paper equity, risk budget and trades left |
| "Scan for breakouts" | Scanner runs over the NIFTY 500 for opening-range breakouts and ranks the cleanest |
| "Plan a trade on Zomato" | Strategy → entry check → exit plan → Time Machine odds → sizing → Risk gate → ticket |
| "Yes, buy 482 ETERNAL" | Places the paper bracket order (only a reply that starts with "yes" and matches the ticket counts) |
| "What are the odds?" / "Where's the stop?" | Time Machine verdict / the plan's stop and target |
| "Why did you buy Zomato?" | Reads the trade's Story with its evidence trail |
| "Close Zomato" / "Close everything" | Flattens one position / all positions |
| "Backtest it against buy and hold" | Backtest Lab: strategy vs buy-and-hold vs NIFTY 50, with an honest verdict |

## Market intelligence

| Say | What happens |
| --- | --- |
| "How are sectors doing?" / "Show me the heat map" | Breadth mood, advancers/decliners, strongest and weakest sector |
| "Any bulk deals?" | NSE bulk and block deal disclosures |
| "How did Reliance's earnings look?" | Quarterly results in ₹ crore |
| "What's moving Infosys?" | Google News India headlines |

## Risk

| Say | What happens |
| --- | --- |
| "Move my stop to breakeven" | Raises the stop of open positions to their entry (tighten only) |
| "What if I buy 300 Infosys?" | What-if simulator: max loss, binding limit, max size, charges, gap scenario. No ticket. |
| "What are my guardrails?" | Limits and how much of today's risk budget is committed |
| "Lower my daily loss limit to 5000" | Tightens it (voice can only tighten) |
| "Raise my daily loss limit" | Refused by the Policy engine, spoken back with the reason |
| "Stop everything" / "Halt" | Kill switch: cancel orders, flatten, lock entries, write a Kill Story |

## Automations

| Say | Rule created |
| --- | --- |
| "Every 15 minutes scan for breakouts and watch the best one" | every 15 min → scan, watch the top hit |
| "At 3 pm give me a status update" | at 15:00 → speak a status summary |
| "At 9:16 good morning briefing" | at 09:16 → market briefing |
| "If I'm down 5000 lock the desk" | day P&L ≤ −₹5,000 → halt |
| "If I lose 5000 flatten everything" | day P&L ≤ −₹5,000 → flatten all |
| "List my automations" | Reads the active rules |

Templates on the Automations screen: Opening-bell briefing, Breakout radar, Soft loss guard, Risk budget warning,
Price alert, Momentum day planner, Breakeven guard, Trailing lock-in, Pre-close wrap-up. Automations can brief, scan, plan, flatten and halt; they never
place an order and never replace a ticket that is waiting for your "yes".

## Screens

| Route | Screen |
| --- | --- |
| `/` | Landing page |
| `/deck` | Command Deck: Orb, agent Orrery, Sundial, sector heatmap, risk reservoir, ticket, breakeven button, chat |
| `/markets` | NIFTY 500 sector heatmap, breadth, top gainers and losers |
| `/studio` | Trade Studio: candles, Time Machine fan, What-if simulator, sizing ledger, gate list, ticket |
| `/backtest` | Backtest Lab and PDF export |
| `/portfolio` | Paper positions and P&L |
| `/review` | Trade Review: MAE/MFE post-mortem, charges breakdown, end-of-day PDF |
| `/ledger` | Discipline Scorecard and every Story with its evidence |
| `/automations` | Rule builder, templates, voice rules, activity log |
| `/guardrails` | Limits, five defence layers, kill switch, audit-chain verification |
