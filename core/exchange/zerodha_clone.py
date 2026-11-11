"""Mirror every Paper Exchange fill into a locally-running Zerodha-clone app (apna-college/Zerodha backend).

Meridian stays the single source of truth: it still decides, sizes and fills on its own paper exchange. This module only
*reports* each fill to the clone's POST /newOrder so the clone's Orders / Positions screens show what Meridian did.
Fills only exist after the user approved the ticket (Advise mode) or inside an on-screen mandate (Autopilot).

Safety: disabled unless ZERODHA_CLONE_URL is set, and refuses any host that is not loopback, so this can never be pointed at
a real broker. Delivery is best-effort in a background thread; a clone that is down never blocks or breaks trading.
"""
from __future__ import annotations

import json
import queue
import threading
import time
import urllib.request
from urllib.parse import urlparse

LOOPBACK = {"localhost", "127.0.0.1", "::1"}


class ZerodhaCloneMirror:
    def __init__(self, base_url: str | None, snapshot=None):
        self.base_url = (base_url or "").rstrip("/")
        self.snapshot = snapshot             # callable -> {"account":..., "prices":..., "orders":[...]} pushed every 1.5s
        self.enabled = False
        self.sent = 0
        self.failed = 0
        self.last_error: str | None = None
        self.q: queue.Queue[tuple[str, dict]] = queue.Queue(maxsize=1000)
        if self.base_url:
            host = urlparse(self.base_url).hostname or ""
            if host in LOOPBACK:
                self.enabled = True
                threading.Thread(target=self._worker, name="zerodha-clone-mirror", daemon=True).start()
                if self.snapshot:
                    threading.Thread(target=self._sync_loop, name="zerodha-clone-sync", daemon=True).start()
            else:
                self.last_error = f"refused: {host or self.base_url} is not a local address (paper-only guard)"

    def status(self) -> dict:
        return {"enabled": self.enabled, "url": self.base_url or None, "sent": self.sent, "failed": self.failed,
                "last_error": self.last_error}

    def on_fill(self, ev: dict) -> None:
        """Exchange listener. `ev` is the fill dict plus its order.

        Entries go to the clone as an *intent*: the Kite screen performs the order itself (Buy window, typing, click) and the
        clone falls back to executing it after a grace period if no dashboard is open. Exits are posted straight away."""
        if not self.enabled or ev.get("symbol") is None or ev.get("qty") is None:
            return
        body = {"ref": ev.get("order_id"), "name": ev["symbol"], "qty": ev["qty"], "price": ev["price"],
                "mode": "BUY" if ev["side"] == "buy" else "SELL", "source": "meridian", "note": ev.get("leg") or "",
                "pnl": ev.get("pnl")}
        try:
            self.q.put_nowait(("/intent" if ev.get("leg") == "entry" else "/newOrder", body))
        except queue.Full:
            self.failed += 1

    def _post(self, path: str, body: dict) -> None:
        req = urllib.request.Request(f"{self.base_url}{path}", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        urllib.request.urlopen(req, timeout=5).read()

    def _worker(self) -> None:
        while True:
            path, body = self.q.get()
            try:
                self._post(path, body)
                self.sent += 1
                self.last_error = None
            except Exception as e:   # clone down / not started: keep trading, report in /api/zerodha
                self.failed += 1
                self.last_error = str(e)

    def _sync_loop(self) -> None:
        """Every 1.5s: account (Funds / Summary), last prices (Watchlist, position P&L) and pending stop / target orders."""
        while True:
            time.sleep(1.5)
            try:
                self._post("/meridianSync", self.snapshot())
            except Exception as e:
                self.last_error = str(e)
