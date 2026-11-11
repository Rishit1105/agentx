"""Paper Exchange: a deterministic mock matching engine.

* Market orders fill at the current price +/- slippage (bps) plus a per-share fee.
* Bracket orders (exactly the `place_stock_order` payload produced by ticket.py) create two OCO children:
  a stop-loss and a take-profit. When one fills the other is cancelled.
* Stops fill at the stop, or at the bar's open if the bar gapped through it (the worse of the two).
  If one bar touches both stop and target, the stop is assumed first (conservative).
* Partial fills off. Long-only. Paper money only.
"""
from __future__ import annotations

import itertools
import threading
from datetime import datetime, timezone
from typing import Callable

from ..clock import clock
from ..db import DB
from ..market import market
from ..costs import order_charges, slippage

_ids = itertools.count(1)


class ExchangeError(Exception):
    pass


class PaperExchange:
    def __init__(self, db: DB, starting_cash: float, costs: dict):
        self.db = db
        self.lock = threading.RLock()
        self.costs = costs
        self.listeners: list[Callable[[dict], None]] = []
        self.last_checked: dict[str, int] = {}
        if self.db.kv_get("cash") is None:
            self.reset(starting_cash)

    # ------------------------------------------------------------ account
    def reset(self, starting_cash: float):
        with self.lock:
            for t in ("orders", "fills", "positions"):
                self.db.execute(f"DELETE FROM {t}")
            self.db.kv_set("cash", round(starting_cash, 2))
            self.db.kv_set("start_cash", round(starting_cash, 2))
            self.db.kv_set("realized", 0.0)
            self.db.kv_set("fees", 0.0)
            self.db.kv_set("peak_equity", round(starting_cash, 2))
            self.last_checked = {}

    def on_fill(self, fn: Callable[[dict], None]):
        self.listeners.append(fn)

    def _emit(self, fill: dict):
        for fn in self.listeners:
            try:
                fn(fill)
            except Exception as e:  # listener errors never break matching
                print("exchange listener error:", e)

    def _now(self) -> str:
        return clock.now().isoformat()

    def _new_id(self, prefix="mx") -> str:
        return f"{prefix}-{clock.now().strftime('%H%M%S')}-{next(_ids)}"

    # ------------------------------------------------------------ orders
    def place_stock_order(self, payload: dict, *, fingerprint: str = "", mandate_id: str | None = None,
                          meta: dict | None = None) -> dict:
        """Accepts the exact `tool_input` produced by ticket.py (strings for numbers, Alpaca's signature)."""
        with self.lock:
            sym = str(payload["symbol"]).upper()
            side = payload["side"].lower()
            qty = float(payload["qty"])
            if payload.get("type", "market") != "market":
                raise ExchangeError("only market parents are supported in the paper exchange")
            if qty <= 0 or qty != int(qty):
                raise ExchangeError("whole shares only")
            px = market.price(sym)
            if px is None:
                raise ExchangeError(f"no price for {sym}")
            pos = self.position(sym)
            if side == "sell":
                held = pos["qty"] if pos else 0
                if qty > held + 1e-9:
                    raise ExchangeError(f"cannot sell {qty:g} {sym}: holding {held:g} (no shorting)")
            slip = slippage(self.costs)
            fill_px = round(px * (1 + slip) if side == "buy" else px * (1 - slip), 2)
            fee = order_charges(side, fill_px, qty, self.costs)["total"]   # brokerage, STT, exchange, SEBI, GST, stamp
            cash = self.db.kv_get("cash")
            if side == "buy" and fill_px * qty + fee > cash + 1e-6:
                raise ExchangeError(f"insufficient paper cash: need {fill_px * qty + fee:.2f}, have {cash:.2f}")
            oid = self._new_id()
            now = self._now()
            bracket = payload.get("order_class") == "bracket"
            stop = float(payload["stop_loss_stop_price"]) if bracket else None
            target = float(payload["take_profit_limit_price"]) if bracket else None
            self.db.execute(
                "INSERT INTO orders(id,parent_id,fingerprint,symbol,side,qty,type,order_class,leg,stop,target,"
                "status,mandate_id,created_ts,updated_ts,fill_price,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (oid, None, fingerprint, sym, side, qty, "market", payload.get("order_class", "simple"),
                 "entry" if side == "buy" else "exit", stop, target, "filled", mandate_id, now, now, fill_px,
                 (meta or {}).get("reason", "")))
            fill = self._fill(oid, sym, side, fill_px, qty, "entry" if side == "buy" else "flatten", fee)
            if side == "buy":
                self._open_position(sym, qty, fill_px, stop, target, meta or {})
                if bracket:
                    for leg, price in (("stop", stop), ("target", target)):
                        self.db.execute(
                            "INSERT INTO orders(id,parent_id,fingerprint,symbol,side,qty,type,order_class,leg,stop,"
                            "target,limit_price,status,mandate_id,created_ts,updated_ts) "
                            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (f"{oid}-{leg}", oid, fingerprint, sym, "sell", qty, "stop" if leg == "stop" else "limit",
                             "oco", leg, stop if leg == "stop" else None, target if leg == "target" else None, price,
                             "open", mandate_id, now, now))
                    bars = market.bars(sym)
                    self.last_checked[sym] = bars[-1]["t"] if bars else 0
            else:
                self._close_position(sym, qty, fill_px, fill, reason=(meta or {}).get("reason", "flatten"))
                if not self.position(sym):
                    self.cancel_symbol(sym, reason="position closed")
            self._mark_peak()
            order = self.order(oid)
            self._emit({**fill, "order": order})
            return {"order": order, "fill": fill}

    def _fill(self, oid, sym, side, px, qty, leg, fee) -> dict:
        now = self._now()
        cur = self.db.execute("INSERT INTO fills(order_id,ts,symbol,side,price,qty,leg,fee) VALUES(?,?,?,?,?,?,?,?)",
                              (oid, now, sym, side, px, qty, leg, fee))
        cash = self.db.kv_get("cash")
        cash = cash - px * qty - fee if side == "buy" else cash + px * qty - fee
        self.db.kv_set("cash", round(cash, 2))
        self.db.kv_set("fees", round(self.db.kv_get("fees", 0) + fee, 2))
        return {"id": cur.lastrowid, "order_id": oid, "ts": now, "symbol": sym, "side": side, "price": px,
                "qty": qty, "leg": leg, "fee": fee}

    def _open_position(self, sym, qty, px, stop, target, meta):
        pos = self.position(sym)
        if pos:
            nq = pos["qty"] + qty
            avg = (pos["avg_price"] * pos["qty"] + px * qty) / nq
            self.db.execute("UPDATE positions SET qty=?, avg_price=?, stop=?, target=? WHERE symbol=?",
                            (nq, round(avg, 4), stop, target, sym))
        else:
            self.db.execute("INSERT INTO positions(symbol,qty,avg_price,stop,target,opened_ts,story_id,max_loss,setup) "
                            "VALUES(?,?,?,?,?,?,?,?,?)",
                            (sym, qty, px, stop, target, self._now(), meta.get("story_id"), meta.get("max_loss"),
                             meta.get("setup")))

    def _close_position(self, sym, qty, px, fill, reason):
        pos = self.position(sym)
        if not pos:
            return
        pnl = (px - pos["avg_price"]) * qty
        self.db.kv_set("realized", round(self.db.kv_get("realized", 0) + pnl, 2))
        fill["pnl"] = round(pnl, 2)
        fill["entry_price"] = pos["avg_price"]
        fill["story_id"] = pos.get("story_id")
        fill["reason"] = reason
        risk_ps = (pos["avg_price"] - pos["stop"]) if pos.get("stop") else None
        fill["r"] = round((px - pos["avg_price"]) / risk_ps, 2) if risk_ps and risk_ps > 0 else None
        left = pos["qty"] - qty
        if left <= 1e-9:
            self.db.execute("DELETE FROM positions WHERE symbol=?", (sym,))
        else:
            self.db.execute("UPDATE positions SET qty=? WHERE symbol=?", (left, sym))

    # ------------------------------------------------------------ matching loop
    def on_tick(self) -> list[dict]:
        """Check open OCO legs against new bars (and the forming bar) for every symbol with exposure."""
        out = []
        with self.lock:
            legs = self.db.query("SELECT * FROM orders WHERE status='open' AND order_class='oco'")
            by_sym: dict[str, list[dict]] = {}
            for l in legs:
                by_sym.setdefault(l["symbol"], []).append(l)
            for sym, sl in by_sym.items():
                stop_leg = next((l for l in sl if l["leg"] == "stop"), None)
                tgt_leg = next((l for l in sl if l["leg"] == "target"), None)
                since = self.last_checked.get(sym, 0)
                bars = [b for b in market.bars(sym, include_forming=True) if b["t"] > since or b.get("forming")]
                for b in bars:
                    hit = None
                    if stop_leg and b["l"] <= stop_leg["limit_price"]:
                        hit = ("stop", min(stop_leg["limit_price"], b["o"]), stop_leg)
                    elif tgt_leg and b["h"] >= tgt_leg["limit_price"]:
                        hit = ("target", max(tgt_leg["limit_price"], b["o"]) if b["o"] > tgt_leg["limit_price"]
                               else tgt_leg["limit_price"], tgt_leg)
                    if not b.get("forming"):
                        self.last_checked[sym] = b["t"]
                    if hit:
                        leg, px, order = hit
                        out.append(self._fill_leg(order, round(px, 2), leg))
                        break
        for f in out:
            self._emit(f)
        return out

    def _fill_leg(self, order, px, leg) -> dict:
        sym = order["symbol"]
        pos = self.position(sym)
        qty = min(order["qty"], pos["qty"]) if pos else order["qty"]
        fee = order_charges("sell", px, qty, self.costs)["total"]
        now = self._now()
        self.db.execute("UPDATE orders SET status='filled', fill_price=?, updated_ts=? WHERE id=?", (px, now, order["id"]))
        self.db.execute("UPDATE orders SET status='cancelled', reason='oco sibling filled', updated_ts=? "
                        "WHERE parent_id=? AND id<>? AND status='open'", (now, order["parent_id"], order["id"]))
        fill = self._fill(order["id"], sym, "sell", px, qty, leg, fee)
        self._close_position(sym, qty, px, fill, reason=leg)
        self._mark_peak()
        return {**fill, "order": self.order(order["id"])}

    # ------------------------------------------------------------ stop management (tighten only)
    def stop_leg(self, sym: str) -> dict | None:
        return self.db.one("SELECT * FROM orders WHERE symbol=? AND leg='stop' AND status='open' AND order_class='oco'",
                           (sym.upper(),))

    def raise_stop(self, sym: str, new_stop: float, reason: str = "tighten") -> dict:
        """Move an open position's protective stop UP (never down, never above the last price).
        positions.stop keeps the original stop, so R multiples stay measured against the risk actually taken."""
        sym = sym.upper()
        with self.lock:
            leg = self.stop_leg(sym)
            if not leg:
                raise ExchangeError(f"no open stop order for {sym}")
            cur = float(leg["limit_price"])
            px = market.price(sym)
            new_stop = round(float(new_stop), 2)
            if new_stop <= cur:
                raise ExchangeError(f"stops only move up: {new_stop} is not above the current stop {cur}")
            if px is not None and new_stop >= px:
                raise ExchangeError(f"the new stop {new_stop} must stay below the last price {px:.2f}")
            self.db.execute("UPDATE orders SET limit_price=?, stop=?, updated_ts=?, reason=? WHERE id=?",
                            (new_stop, new_stop, self._now(), reason, leg["id"]))
        return {"symbol": sym, "from": cur, "to": new_stop, "order": leg["id"], "reason": reason}

    # ------------------------------------------------------------ kill switch primitives
    def cancel_symbol(self, sym: str, reason: str = "cancelled") -> int:
        with self.lock:
            cur = self.db.execute("UPDATE orders SET status='cancelled', reason=?, updated_ts=? "
                                  "WHERE symbol=? AND status='open'", (reason, self._now(), sym))
            return cur.rowcount

    def cancel_all(self, reason: str = "kill switch") -> int:
        with self.lock:
            cur = self.db.execute("UPDATE orders SET status='cancelled', reason=?, updated_ts=? WHERE status='open'",
                                  (reason, self._now()))
            return cur.rowcount

    def flatten(self, sym: str, reason: str = "flatten") -> dict | None:
        pos = self.position(sym)
        if not pos:
            return None
        self.cancel_symbol(sym, reason=reason)
        return self.place_stock_order({"symbol": sym, "side": "sell", "qty": str(int(pos["qty"])), "type": "market",
                                       "time_in_force": "day"}, meta={"reason": reason})

    def flatten_all(self, reason: str = "kill switch") -> list[dict]:
        return [r for r in (self.flatten(p["symbol"], reason) for p in self.positions()) if r]

    # ------------------------------------------------------------ reads
    def order(self, oid) -> dict | None:
        return self.db.one("SELECT * FROM orders WHERE id=?", (oid,))

    def orders(self, status: str | None = None) -> list[dict]:
        if status:
            return self.db.query("SELECT * FROM orders WHERE status=? ORDER BY created_ts DESC", (status,))
        return self.db.query("SELECT * FROM orders ORDER BY created_ts DESC LIMIT 200")

    def fills(self) -> list[dict]:
        return self.db.query("SELECT * FROM fills ORDER BY id DESC LIMIT 200")

    def position(self, sym) -> dict | None:
        return self.db.one("SELECT * FROM positions WHERE symbol=?", (sym.upper(),))

    def positions(self) -> list[dict]:
        out = []
        for p in self.db.query("SELECT * FROM positions ORDER BY opened_ts"):
            px = market.price(p["symbol"]) or p["avg_price"]
            p["last"] = round(px, 2)
            p["unrealized"] = round((px - p["avg_price"]) * p["qty"], 2)
            p["value"] = round(px * p["qty"], 2)
            risk = p["avg_price"] - (p["stop"] or 0)
            p["r_now"] = round((px - p["avg_price"]) / risk, 2) if p.get("stop") and risk > 0 else None
            leg = self.stop_leg(p["symbol"])
            p["working_stop"] = float(leg["limit_price"]) if leg else p.get("stop")
            p["at_breakeven"] = bool(leg and float(leg["limit_price"]) >= p["avg_price"])
            out.append(p)
        return out

    def _mark_peak(self):
        eq = self.equity()
        if eq > (self.db.kv_get("peak_equity") or 0):
            self.db.kv_set("peak_equity", round(eq, 2))

    def equity(self) -> float:
        return round(self.db.kv_get("cash", 0) + sum(p["value"] for p in self.positions()), 2)

    def account(self) -> dict:
        pos = self.positions()
        cash = self.db.kv_get("cash", 0)
        unreal = sum(p["unrealized"] for p in pos)
        equity = round(cash + sum(p["value"] for p in pos), 2)
        start = self.db.kv_get("start_cash", equity)
        peak = max(self.db.kv_get("peak_equity", equity) or equity, equity)
        realized = self.db.kv_get("realized", 0)
        fees = self.db.kv_get("fees", 0)
        return {"cash": round(cash, 2), "equity": equity, "start": start, "realized": round(realized, 2),
                "unrealized": round(unreal, 2), "fees": fees, "day_pnl": round(equity - start, 2),
                "day_pnl_pct": round((equity - start) / start * 100, 3) if start else 0,
                "peak": peak, "drawdown_pct": round((peak - equity) / peak * 100, 3) if peak else 0,
                "open_orders": len(self.orders("open")), "positions": len(pos),
                "ts": datetime.now(timezone.utc).isoformat()}
