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
    def __init__(self, base_url: str | None, entry_delay_s: float = 3.0, marks=None):
        self.base_url = (base_url or "").rstrip("/")
        self.entry_delay_s = entry_delay_s   # lets the browser open the Kite page before the entry order lands
        self.marks = marks                   # callable -> {symbol: last price} of open positions
        self.enabled = False
        self.sent = 0
        self.failed = 0
        self.last_error: str | None = None
        self.q: queue.Queue[dict] = queue.Queue(maxsize=1000)
        if self.base_url:
            host = urlparse(self.base_url).hostname or ""
            if host in LOOPBACK:
                self.enabled = True
                threading.Thread(target=self._worker, name="zerodha-clone-mirror", daemon=True).start()
                if self.marks:
                    threading.Thread(target=self._mark_loop, name="zerodha-clone-marks", daemon=True).start()
            else:
                self.last_error = f"refused: {host or self.base_url} is not a local address (paper-only guard)"

    def status(self) -> dict:
        return {"enabled": self.enabled, "url": self.base_url or None, "sent": self.sent, "failed": self.failed,
                "last_error": self.last_error}

    def on_fill(self, ev: dict) -> None:
        """Exchange listener. `ev` is the fill dict plus its order."""
        if not self.enabled or ev.get("symbol") is None or ev.get("qty") is None:
            return
        try:
            self.q.put_nowait({"name": ev["symbol"], "qty": ev["qty"], "price": ev["price"],
                               "mode": "BUY" if ev["side"] == "buy" else "SELL", "source": "meridian",
                               "note": ev.get("leg") or "",
                               "_at": time.time() + (self.entry_delay_s if ev.get("leg") == "entry" else 0.0)})
        except queue.Full:
            self.failed += 1

    def _worker(self) -> None:
        while True:
            body = self.q.get()
            wait = body.pop("_at", 0) - time.time()
            if wait > 0:
                time.sleep(wait)
            try:
                req = urllib.request.Request(f"{self.base_url}/newOrder", data=json.dumps(body).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
                urllib.request.urlopen(req, timeout=5).read()
                self.sent += 1
                self.last_error = None
            except Exception as e:   # clone down / not started: keep trading, report in /api/zerodha
                self.failed += 1
                self.last_error = str(e)

    def _mark_loop(self) -> None:
        """Push last-traded prices of open positions every 2s so the Kite screen's P&L moves with the replay clock."""
        while True:
            time.sleep(2)
            try:
                prices = self.marks()
                if prices:
                    req = urllib.request.Request(f"{self.base_url}/markPrices", data=json.dumps({"prices": prices}).encode(),
                                                 headers={"Content-Type": "application/json"}, method="POST")
                    urllib.request.urlopen(req, timeout=5).read()
            except Exception as e:
                self.last_error = str(e)
