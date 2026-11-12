"""Meridian core: FastAPI + asyncio. REST (blueprint 15.4), WebSocket event stream, voice endpoints, tick loop."""
from __future__ import annotations

import asyncio
import io
import json
import os
import time
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from .clock import clock
from .config import ENV
from .conductor.conductor import Conductor
from .desk import AGENTS, Desk
from .market import market
from .exchange.engine import ExchangeError
from .services import holdings_import, options, review, scorecard, strategy_builder, whatif
from .services.automations import TEMPLATES, AutomationError
from .voice.stt import stt
from .voice.tts_client import TTS_DIR, tts

desk = Desk()
conductor = Conductor(desk)
desk.conductor = conductor
STARTED = time.time()
VOICE_OWNER: dict = {"id": None}   # which browser tab currently speaks (see /ws voice_claim)


async def ticker():
    while True:
        try:
            await desk.tick()
            desk.bus.emit("clock.tick", {**clock.snapshot(desk.cfg), "account": desk.exchange.account(),
                                         "kill": desk.sentinel.state}, actor="clock", persist=False)
        except Exception as e:  # the loop must never die
            print("tick error:", repr(e))
        await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    desk.bus.bind_loop(asyncio.get_running_loop())
    desk.boot()
    if ENV["replay_default"]:
        desk.start_replay(ENV["replay_date"], ENV["replay_start"], ENV["replay_speed"])
        clock.pause(True)   # start paused; the UI presses play
    else:
        desk.start_live()
    stt.load_async()
    asyncio.ensure_future(tts.warm_cache())
    task = asyncio.create_task(ticker())
    yield
    task.cancel()


app = FastAPI(title="Meridian core", version="1.0", lifespan=lifespan)
# UI_ORIGIN may list several origins (comma-separated); UI_ORIGIN_REGEX allows e.g. Vercel preview URLs
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in ENV["ui_origin"].split(",") if o.strip()] + ["http://127.0.0.1:3000"],
                   allow_origin_regex=os.getenv("UI_ORIGIN_REGEX") or None, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def token_guard(request: Request, call_next):
    tok = ENV["session_token"]
    if tok and request.url.path.startswith("/api/") and request.method != "GET":
        if request.headers.get("x-meridian-token") != tok:
            return JSONResponse({"error": "missing or bad session token"}, status_code=401)
    resp = await call_next(request)
    if request.url.path.startswith("/api/") and request.method in ("POST", "PATCH", "DELETE"):
        try:   # SEBI-style audit trail of every state-changing API call
            desk.compliance.log_api(request.method, request.url.path, resp.status_code)
        except Exception:
            pass
    return resp


# ---------------------------------------------------------------- read models
@app.get("/healthz")
async def healthz():
    return {"ok": True, "uptime_s": int(time.time() - STARTED), "paper": desk.paper, "kill": desk.sentinel.state}


@app.get("/metrics")
async def metrics():
    rows = desk.db.query("SELECT tool, COUNT(*) n, AVG(ms) avg_ms, SUM(ok) ok FROM tool_calls GROUP BY tool")
    return {"tools": rows, "events": desk.db.one("SELECT COUNT(*) n FROM events")["n"], "llm": conductor.llm_info(),
            "voice": conductor.voice_info()}


@app.get("/api/state")
async def state():
    await tts.health()
    return desk.state()


@app.get("/api/agents")
async def agents():
    return desk.agents()


@app.get("/api/agents/{agent}")
async def agent_last(agent: str):
    if agent not in {a[0] for a in AGENTS}:
        raise HTTPException(404)
    return {"agent": agent, "last": desk.last_result.get(agent)}


@app.get("/api/orders")
async def orders():
    return {"orders": desk.exchange.orders(), "fills": desk.exchange.fills()}


@app.get("/api/positions")
async def positions():
    return {"positions": desk.exchange.positions(), "account": desk.exchange.account()}


@app.get("/api/zerodha")
async def zerodha_status():
    return desk.zerodha.status()


@app.get("/api/portfolio")
async def portfolio():
    """One-call summary of the paper portfolio: account, holdings with weights and sectors, closed-trade statistics."""
    acct = desk.exchange.account()
    holdings = []
    for p in desk.exchange.positions():
        cost = p["avg_price"] * p["qty"]
        holdings.append({**p, "name": market.name(p["symbol"]), "sector": market.industries.get(p["symbol"], "Other"),
                         "cost": round(cost, 2), "unrealized_pct": round(p["unrealized"] / cost * 100, 2) if cost else 0,
                         "weight_pct": round(p["value"] / acct["equity"] * 100, 2) if acct["equity"] else 0})
    sectors: dict[str, float] = {}
    for h in holdings:
        sectors[h["sector"]] = sectors.get(h["sector"], 0) + h["value"]
    closed = [t for t in desk.journalist.list(None, "trade") if t.get("pnl") is not None]
    wins = [t["pnl"] for t in closed if t["pnl"] > 0]
    losses = [t["pnl"] for t in closed if t["pnl"] <= 0]
    best = max(closed, key=lambda t: t["pnl"], default=None)
    worst = min(closed, key=lambda t: t["pnl"], default=None)
    pick = lambda t: t and {"symbol": t["symbol"], "pnl": t["pnl"], "id": t["id"]}
    invested = sum(h["value"] for h in holdings)
    return {
        "account": acct, "holdings": holdings,
        "invested": round(invested, 2), "invested_pct": round(invested / acct["equity"] * 100, 2) if acct["equity"] else 0,
        "cash_pct": round(acct["cash"] / acct["equity"] * 100, 2) if acct["equity"] else 0,
        "total_return_pct": round((acct["equity"] - acct["start"]) / acct["start"] * 100, 3) if acct["start"] else 0,
        "sectors": sorted(({"sector": k, "value": round(v, 2), "pct": round(v / acct["equity"] * 100, 2) if acct["equity"] else 0}
                           for k, v in sectors.items()), key=lambda r: -r["value"]),
        "trades": {"closed": len(closed), "wins": len(wins), "losses": len(losses),
                   "win_rate": round(len(wins) / len(closed) * 100, 1) if closed else None,
                   "avg_win": round(sum(wins) / len(wins), 2) if wins else None,
                   "avg_loss": round(sum(losses) / len(losses), 2) if losses else None,
                   "profit_factor": round(sum(wins) / abs(sum(losses)), 2) if wins and losses and sum(losses) else None,
                   "best": pick(best), "worst": pick(worst)},
        "recent_fills": desk.exchange.fills()[:8],
    }


@app.get("/api/stories")
async def stories(symbol: str | None = None, kind: str | None = None):
    return desk.journalist.list(symbol, kind)


@app.get("/api/stories/{sid}")
async def story(sid: str):
    s = desk.journalist.get(sid)
    if not s:
        raise HTTPException(404)
    return s


@app.get("/api/evidence")
async def evidence(file: str):
    allowed = {"trader/plan.json", "trader/orders.json", "trader/state/risk.json", "trader/state/broker.json",
               "trader/timemachine.json", "trader/entry.json", "trader/watchlist.json", "trader/meridian/strategy.json",
               "trader/meridian/backtest_report.json", "trader/alerts.json", "trader/prices.json", "trader/portfolio.json"}
    if file not in allowed:
        raise HTTPException(403, "not an evidence file")
    from .config import ROOT
    p = ROOT / file
    if not p.exists():
        raise HTTPException(404)
    return JSONResponse(json.loads(p.read_text(encoding="utf-8")))


@app.get("/api/events")
async def events(after: int = 0, limit: int = 300, types: str | None = None):
    return desk.bus.since(after, limit, types.split(",") if types else None)


@app.get("/api/bars/{symbol}")
async def bars(symbol: str):
    b = market.bars(symbol, include_forming=True)
    return {"symbol": symbol.upper(), "bars": b, "synthetic_from": market.synthetic_from.get(symbol.upper()),
            "prev_close": market.prev_close(symbol)}


@app.get("/api/universe")
async def universe():
    out = []
    for s in market.symbols():
        b = market.bars(s)
        if b:
            out.append({"symbol": s, "price": b[-1]["c"], "chg": round((b[-1]["c"] / b[0]["o"] - 1) * 100, 2)})
    return out


@app.get("/api/timemachine")
async def timemachine():
    from .adapter.skill import read_trader
    d = read_trader("timemachine.json")
    if not d:
        return {}
    return {k: d.get(k) for k in ("plan", "mc", "history", "verdict", "verdict_notes", "warnings")}


@app.get("/api/strategy")
async def strategy():
    from .adapter.skill import read_trader
    return read_trader("meridian/strategy.json") or {}


# ---------------------------------------------------------------- control
@app.post("/api/chat")
async def chat(body: dict = Body(...)):
    return await conductor.handle(body.get("text", ""), source=body.get("source", "chat"),
                                  confidence=body.get("confidence"))


@app.post("/api/mode")
async def set_mode(body: dict = Body(...)):
    mode = body.get("mode")
    d = desk.policy.authorize("set_mode", {"mode": mode}, desk.ctx("ui"))
    if not d.allowed:
        raise HTTPException(409, d.reason)
    desk.set_mode(mode, reason="ui")
    return {"mode": desk.mode}


@app.post("/api/mandate")
async def mandate(body: dict = Body(...)):
    if desk.sentinel.state != "ARMED":
        raise HTTPException(409, "the desk is halted")
    try:
        m = desk.mandates.grant(body.get("minutes", 120), body.get("max_trades", 3), body.get("strategies") or ["orb", "level"],
                                body.get("symbols") or "any", body.get("max_loss_per_trade", desk.cfg["max_loss_per_trade_usd"]),
                                desk.cfg, confirmed_on_screen=bool(body.get("confirmed_on_screen")))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    desk.audit.append("mandate.granted", mandate=m)
    desk.set_mode("autopilot", reason=f"mandate {m['id']}")
    desk.journalist.create("mode", None, {"headline": f"Autopilot granted: mandate {m['id']}, up to {m['max_trades']} trades.",
                                          "why": "Confirmed on screen by the user.", "checked": json.dumps(m["scope"]),
                                          "outcome": f"Expires {m['expires_ts'][11:16]} IST (virtual clock)."}, rewrite=False)
    desk.bus.emit("mandate.granted", m, actor="policy")
    await conductor.say(f"Autopilot is on: up to {m['max_trades']} trades until {m['expires_ts'][11:16]}. Every order "
                        "still needs a risk pass. Say stop everything at any time.", kind="status")
    return m


@app.delete("/api/mandate")
async def revoke_mandate():
    n = desk.mandates.revoke("revoked by user")
    if desk.mode == "autopilot":
        desk.set_mode("advise", reason="mandate revoked")
    desk.bus.emit("mandate.revoked", {"n": n}, actor="policy")
    return {"revoked": n}


@app.post("/api/orders/{index}/approve")
async def approve(index: int, body: dict = Body(default={})):
    t = desk.ticket_view()
    if not t:
        raise HTTPException(404, "no ticket")
    reply = body.get("reply") or t["say"]       # the tap is the on-screen equivalent of the exact yes
    out = await desk.approve(reply, origin="ui", user_yes=True)
    if out.get("ok"):
        f = out["fill"]
        await conductor.say(f"Placed: bought {int(f['qty'])} {f['symbol']} at {f['price']:.2f}.", kind="status")
    conductor.set_state("IDLE")
    return out


@app.post("/api/orders/{index}/decline")
async def decline(index: int):
    out = await desk.decline("no (tapped)")
    conductor.set_state("IDLE")
    return out


@app.post("/api/flatten/{symbol}")
async def flatten(symbol: str):
    return await desk.flatten(symbol, reason="user")


@app.post("/api/kill")
async def kill(body: dict = Body(default={})):
    res = await desk.sentinel.halt(body.get("trigger", "api"), actor=body.get("actor", "user"),
                                   detail={"via": body.get("via", "api")})
    conductor.set_state("HALTED")
    return res


@app.post("/api/rearm")
async def rearm(body: dict = Body(...)):
    out = desk.sentinel.rearm(body.get("reason", ""), actor="ui")
    if out.get("ok"):
        conductor.set_state("IDLE")
        await conductor.say("Re-armed. Entries are allowed again within your limits.", kind="status")
    return out


@app.post("/api/limits")
async def limits(body: dict = Body(...)):
    return desk.tighten(body, origin="ui")


@app.post("/api/tools/{name}")
async def tool(name: str, body: dict = Body(default={})):
    """Run a tool manually (dev/debug); still goes through Policy."""
    return await conductor.exec_tool(name, body)


@app.post("/api/positions/{symbol}/stop")
async def raise_stop(symbol: str, body: dict = Body(...)):
    """Tighten-only: move a position's protective stop up (to breakeven, or any level below the last price)."""
    pos = desk.exchange.position(symbol)
    if not pos:
        raise HTTPException(404, f"no open position in {symbol.upper()}")
    target = pos["avg_price"] if body.get("to") == "breakeven" else body.get("stop")
    if target is None:
        raise HTTPException(400, "give stop: <price> or to: \"breakeven\"")
    try:
        out = desk.exchange.raise_stop(symbol, float(target), reason=body.get("reason", "user"))
    except ExchangeError as e:
        raise HTTPException(400, str(e))
    desk.audit.append("stop.raised", by="user", moves=[out])
    desk.bus.emit("order.update", {"stop_raised": [out]}, actor="exchange")
    return out


@app.post("/api/whatif")
async def what_if(body: dict = Body(...)):
    try:
        return whatif.simulate(desk, body.get("symbol", ""), qty=body.get("qty"), stop=body.get("stop"),
                               entry=body.get("entry"), gap_pct=float(body.get("gap_pct", 1.0)))
    except whatif.WhatIfError as e:
        raise HTTPException(400, str(e))


@app.get("/api/market/map")
async def market_map():
    return desk.marketmap.snapshot()


@app.get("/api/holdings/imported")
async def holdings_imported():
    return desk.holdings.view()


@app.post("/api/holdings/import")
async def holdings_import(body: dict = Body(...)):
    try:
        return desk.holdings.load(body.get("text", ""), body.get("source", "csv"))
    except (holdings_import.ImportError_, ValueError) as e:
        raise HTTPException(400, str(e))


@app.delete("/api/holdings/imported")
async def holdings_clear():
    desk.holdings.clear()
    return {"ok": True}


@app.get("/api/options")
async def options_view(symbol: str = "NIFTY50", strategy: str = "bull_call_spread", days: int = 7, lots: int = 1,
                       width: int = 2, lot_size: int | None = None):
    try:
        return options.analyse(desk, symbol, strategy, days=days, lots=lots, width=width, lot_size=lot_size)
    except options.OptionsError as e:
        raise HTTPException(400, str(e))


@app.get("/api/strategies")
async def strategies_list():
    return {"strategies": desk.builder.list(),
            "examples": ["buy when price closes above the 20-day high with volume over 1.5x, stop 1.5 ATR, target 2R",
                         "buy the opening range breakout of the first 30 minutes, stop at the range midpoint, target 1.5R",
                         "buy a bounce after a 2% gap down, stop at the session low, target 1R after 10:00"]}


@app.post("/api/strategies/test")
async def strategies_test(body: dict = Body(...)):
    try:
        return await asyncio.to_thread(desk.builder.test, body.get("text", ""), body.get("symbol") or "RELIANCE",
                                       body.get("name"))
    except strategy_builder.BuilderError as e:
        raise HTTPException(400, str(e))


@app.post("/api/strategies/{sid}/approve")
async def strategies_approve(sid: str):
    try:
        return desk.builder.approve(sid)
    except strategy_builder.BuilderError as e:
        raise HTTPException(400, str(e))


@app.post("/api/ticket/mood")
async def ticket_mood(body: dict = Body(...)):
    out = desk.set_mood(body.get("mood"), body.get("confidence"))
    if not out.get("ok"):
        raise HTTPException(400, out.get("reason"))
    return out


@app.get("/api/tilt")
async def tilt_view():
    return desk.tilt.snapshot()


@app.get("/api/compliance")
async def compliance_view():
    return desk.compliance.summary()


@app.get("/api/report/compliance.pdf")
async def compliance_pdf():
    return Response(desk.compliance.pdf(), media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=meridian-compliance-report.pdf"})


@app.get("/api/review")
async def review_view():
    return review.summary(desk)


@app.get("/api/report/day.pdf")
async def day_report():
    pdf = review.day_pdf(desk, scorecard.build(desk), desk.journalist.list(limit=40))
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=meridian-day-report.pdf"})


@app.get("/api/scorecard")
async def scorecard_view():
    return scorecard.build(desk)


# ---------------------------------------------------------------- automations ("when X, do Y")
@app.get("/api/automations")
async def automations_list():
    return {"automations": desk.automations.list(), "templates": TEMPLATES, "runs": desk.automations.runs()}


@app.post("/api/automations")
async def automations_create(body: dict = Body(...)):
    try:
        tpl = next((t for t in TEMPLATES if t["key"] == body.get("template")), None)
        src = {**tpl, **{k: v for k, v in body.items() if k != "template"}} if tpl else body
        return desk.automations.create(src.get("name", ""), src.get("trigger") or {}, src.get("action") or {},
                                       cooldown_min=src.get("cooldown_min", 0), enabled=src.get("enabled", True),
                                       template=tpl["key"] if tpl else None)
    except AutomationError as e:
        raise HTTPException(400, str(e))


@app.patch("/api/automations/{aid}")
async def automations_update(aid: str, body: dict = Body(...)):
    try:
        return desk.automations.update(aid, body)
    except AutomationError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/automations/{aid}")
async def automations_delete(aid: str):
    if not desk.automations.delete(aid):
        raise HTTPException(404, "no such automation")
    return {"ok": True}


@app.post("/api/automations/{aid}/run")
async def automations_run(aid: str):
    try:
        return await desk.automations.run_now(aid)
    except AutomationError as e:
        raise HTTPException(404, str(e))


@app.get("/api/backtest/{symbol}")
async def get_backtest(symbol: str, strategy: str = "orb"):
    rep = desk.bt_reports.get(f"{symbol.upper()}:{strategy}")
    return rep or desk.run_backtest(symbol, strategy)


@app.post("/api/backtest/{symbol}")
async def run_backtest(symbol: str, body: dict = Body(default={})):
    return desk.run_backtest(symbol, body.get("strategy", "orb"), int(body.get("sessions", 60)))


@app.get("/api/report/{symbol}.pdf")
async def report_pdf(symbol: str, strategy: str = "orb"):
    from .services.report import backtest_pdf
    rep = desk.bt_reports.get(f"{symbol.upper()}:{strategy}") or desk.run_backtest(symbol, strategy)
    return Response(backtest_pdf(rep, desk.journalist.list(symbol=symbol.upper(), limit=20)), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="meridian-{symbol.upper()}-{strategy}.pdf"'})


@app.post("/api/replay/start")
async def replay_start(body: dict = Body(default={})):
    res = desk.start_replay(body.get("date", ENV["replay_date"]), body.get("start", "09:40"),
                            float(body.get("speed", ENV["replay_speed"])))
    conductor.set_state("IDLE")
    if body.get("paused", False):
        clock.pause(True)
    return res


@app.post("/api/replay/control")
async def replay_control(body: dict = Body(...)):
    if clock.mode != "replay":
        raise HTTPException(409, "not in replay")
    if "speed" in body:
        clock.set_speed(float(body["speed"]))
    if "paused" in body:
        clock.pause(bool(body["paused"]))
    if "jump" in body:
        from datetime import datetime
        from .clock import NY
        h, m = map(int, body["jump"].split(":"))
        target = clock.now().replace(hour=h, minute=m, second=0)
        if target > clock.now():
            clock.jump(target)
        _ = (datetime, NY)
    desk.bus.emit("clock.control", clock.snapshot(desk.cfg), actor="clock")
    return clock.snapshot(desk.cfg)


@app.post("/api/live/start")
async def live_start():
    desk.start_live()
    return clock.snapshot(desk.cfg)


@app.get("/api/audit")
async def audit_tail(n: int = 60):
    return desk.audit.tail(n)


@app.get("/api/audit/verify")
async def audit_verify():
    return desk.audit.verify()


@app.get("/api/kill/events")
async def kill_events():
    return desk.db.query("SELECT * FROM kill_events ORDER BY id DESC LIMIT 50")


@app.get("/api/turns")
async def turns():
    return desk.db.query("SELECT * FROM turns ORDER BY id DESC LIMIT 60")


# ---------------------------------------------------------------- voice
@app.post("/api/voice/stt")
async def voice_stt(request: Request, wake: bool = False):
    data = await request.body()
    res = await asyncio.to_thread(stt.transcribe, data)
    text = res.get("text", "")
    from .conductor.router import HALT, strip_wake
    stripped, had_wake = strip_wake(text)
    res["wake"] = had_wake
    if wake and not had_wake and not HALT.search(text):
        res["ignored"] = True      # always-listening mode: no wake word, no action
        return res
    if text:
        res["reply"] = await conductor.handle(text, source="voice", confidence=res.get("confidence"))
    _ = stripped
    return res


@app.post("/api/voice/state")
async def voice_state(body: dict = Body(...)):
    s = body.get("state", "idle").upper()
    if s in ("LISTENING", "IDLE", "SPEAKING"):
        conductor.set_state(s)
    return {"state": conductor.state}


@app.get("/api/tts/{key}.wav")
async def tts_file(key: str):
    p = TTS_DIR / f"{key}.wav"
    if not p.exists() or not key.isalnum():
        raise HTTPException(404)
    return FileResponse(p, media_type="audio/wav")


@app.post("/api/tts/speak")
async def tts_speak(body: dict = Body(...)):
    """Read any text aloud (e.g. 'read this story')."""
    return await conductor.say(body.get("text", "")[:800], kind=body.get("kind", "reply"))


# ---------------------------------------------------------------- websocket
@app.websocket("/ws")
async def ws(sock: WebSocket):
    tok = ENV["session_token"]
    if tok and sock.query_params.get("token") != tok:
        await sock.close(code=4401)
        return
    await sock.accept()
    q = desk.bus.subscribe()
    my_client = None          # the tab id this socket last claimed the voice with
    try:
        await sock.send_text(json.dumps({"type": "hello", "payload": desk.state()}, default=str))
        await sock.send_text(json.dumps({"type": "voice.owner", "payload": {"owner": VOICE_OWNER["id"]}}))
        while True:
            get = asyncio.ensure_future(q.get())
            recv = asyncio.ensure_future(sock.receive_text())
            done, pending = await asyncio.wait({get, recv}, return_when=asyncio.FIRST_COMPLETED)
            for p in pending:
                p.cancel()
            if get in done:
                await sock.send_text(get.result())
            if recv in done:
                try:
                    msg = json.loads(recv.result())
                except ValueError:
                    continue
                if msg.get("type") == "halt":
                    await desk.sentinel.halt(msg.get("trigger", "ui"), actor="user", detail={"via": "ws"})
                    conductor.set_state("HALTED")
                elif msg.get("type") == "barge_in":
                    desk.bus.emit("voice.barge_in", {}, actor="user", persist=False)
                elif msg.get("type") == "voice_claim" and msg.get("client"):
                    # exactly one tab, in any browser, speaks: the one the user focused last
                    my_client = str(msg["client"])[:40]
                    if VOICE_OWNER["id"] != my_client:
                        VOICE_OWNER["id"] = my_client
                        desk.bus.emit("voice.owner", {"owner": my_client}, actor="user", persist=False)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if my_client and VOICE_OWNER["id"] == my_client:     # the speaking tab closed: let the next tab claim
            VOICE_OWNER["id"] = None
            desk.bus.emit("voice.owner", {"owner": None}, actor="user", persist=False)
        desk.bus.unsubscribe(q)


_ = io
