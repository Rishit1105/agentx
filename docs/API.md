# Meridian core REST API

Base URL `http://localhost:8000`. JSON in and out. If `MERIDIAN_TOKEN` is set, POST/PATCH/DELETE under `/api/` need
the `x-meridian-token` header. Live events stream over `ws://localhost:8000/ws`.

## State and read models
| Method | Path | Returns |
| --- | --- | --- |
| GET | `/healthz` | uptime, paper assertion, kill state |
| GET | `/api/state` | full desk snapshot (mode, clock, limits, risk, account, positions, ticket, agents) |
| GET | `/api/agents`, `/api/agents/{agent}` | the 16 agents and their last results |
| GET | `/api/orders`, `/api/positions`, `/api/portfolio` | paper exchange state |
| GET | `/api/stories`, `/api/stories/{id}` | journal Stories |
| GET | `/api/evidence?file=` | a tool evidence file behind a Story |
| GET | `/api/bars/{symbol}`, `/api/universe` | 5-minute bars, the NSE universe |
| GET | `/api/timemachine`, `/api/strategy` | last Time Machine verdict, Strategist choice |
| GET | `/api/market/map` | sector heatmap, breadth, gainers/losers, mood |
| GET | `/api/review` | closed trades with MAE/MFE in R, verdicts, charges breakdown |
| GET | `/api/report/day.pdf` | end-of-day report PDF |
| GET | `/api/scorecard` | Discipline Scorecard (score, grade, five pillars, counts) |
| GET | `/api/audit`, `/api/audit/verify` | hash-chained audit log and its verification |

## Actions
| Method | Path | Body | Does |
| --- | --- | --- | --- |
| POST | `/api/chat` | `{text}` | sends a command to the Conductor |
| POST | `/api/mode` | `{mode}` | observe / advise / autopilot |
| POST | `/api/mandate` | scope, minutes, max_trades | grants a time-boxed autopilot Mandate |
| POST | `/api/orders/{i}/approve`, `/decline` | | approve or decline the pending ticket |
| POST | `/api/flatten/{symbol}` | | close a position |
| POST | `/api/kill`, `/api/rearm` | `{reason}` for rearm | kill switch / re-arm |
| POST | `/api/limits` | `{key: value}` | tighten limits (loosening is refused) |
| POST | `/api/positions/{symbol}/stop` | `{stop}` or `{to:"breakeven"}` | raise a stop (tighten only) |
| POST | `/api/whatif` | `{symbol, qty?, stop?, entry?, gap_pct?}` | risk simulation, no ticket |
| GET/POST | `/api/backtest/{symbol}` | | run or fetch a backtest |
| GET | `/api/report/{symbol}.pdf` | | backtest report PDF |

## Behaviour, compliance, labs
| Method | Path | Body / query | Does |
| --- | --- | --- | --- |
| POST | `/api/ticket/mood` | `{mood, confidence}` | pre-entry check-in on the waiting ticket |
| GET | `/api/tilt` | | tilt cool-down and recent signals |
| GET | `/api/compliance` | | algo registry, tagged orders, API activity, checks |
| GET | `/api/report/compliance.pdf` | | compliance report PDF |
| GET | `/api/strategies` | | saved custom rules and examples |
| POST | `/api/strategies/test` | `{text, symbol?, name?}` | parse and backtest a plain-English rule |
| POST | `/api/strategies/{id}/approve` | | approve a rule that passed the edge gate |
| GET | `/api/options` | `symbol, strategy, days, lots, width, lot_size?` | paper options analysis |
| GET/POST/DELETE | `/api/holdings/imported`, `/api/holdings/import` | `{text}` (CSV or JSON) | read-only holdings import |

## Automations
| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/automations` | rules, templates and recent runs |
| POST | `/api/automations` | `{template}` or `{name, trigger, action, cooldown_min, enabled}` |
| PATCH | `/api/automations/{id}` | any of name, enabled, trigger, action, cooldown_min |
| DELETE | `/api/automations/{id}` | |
| POST | `/api/automations/{id}/run` | runs the action now |

Triggers: `{type:"time", at:"HH:MM"}`, `{type:"every", minutes}`, `{type:"price", symbol, op:"above"|"below", price}`,
`{type:"day_pnl", value:<negative ₹>}`, `{type:"risk_used", pct}`, `{type:"scan_hits", min}`, `{type:"position_r", r}`.
Actions: `say {text}`, `briefing`, `summary`, `scan {then: notify|watch|plan}`, `watch {symbol}`, `plan {symbol}`,
`flatten {symbol|ALL}`, `halt`, `breakeven`, `trail {lock}`.

## Replay
| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/replay/start` | `{date, start, speed, paused}` |
| POST | `/api/replay/control` | `{paused?, speed?, jump?: "HH:MM"}` |
| POST | `/api/live/start` | switch to live Yahoo `.NS` data |
