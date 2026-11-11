"""Append-only event stream (SQLite) + WebSocket fan-out. The UI is a projection of these events."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from .clock import clock
from .db import DB


class EventBus:
    def __init__(self, db: DB):
        self.db = db
        self.subscribers: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.subscribers.discard(q)

    def emit(self, type_: str, payload: dict | None = None, actor: str = "conductor", persist: bool = True) -> dict:
        ev = {"ts": datetime.now(timezone.utc).isoformat(), "vclock": clock.label(), "type": type_,
              "actor": actor, "payload": payload or {}}
        if persist:
            cur = self.db.execute("INSERT INTO events(ts,vclock,type,actor,payload) VALUES(?,?,?,?,?)",
                                  (ev["ts"], ev["vclock"], type_, actor, json.dumps(ev["payload"], default=str)))
            ev["id"] = cur.lastrowid
        self._fanout(ev)
        return ev

    def _fanout(self, ev: dict):
        data = json.dumps(ev, default=str)
        for q in list(self.subscribers):
            try:
                if self.loop and self.loop.is_running():
                    self.loop.call_soon_threadsafe(self._put, q, data)
                else:
                    q.put_nowait(data)
            except Exception:
                pass

    @staticmethod
    def _put(q: asyncio.Queue, data: str):
        if q.full():
            try:
                q.get_nowait()
            except Exception:
                pass
        q.put_nowait(data)

    def since(self, after: int = 0, limit: int = 500, types: list[str] | None = None) -> list[dict]:
        sql = "SELECT * FROM events WHERE id>?"
        params: list[Any] = [after]
        if types:
            sql += " AND type IN (%s)" % ",".join("?" * len(types))
            params += types
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        rows = self.db.query(sql, params)
        for r in rows:
            r["payload"] = json.loads(r["payload"] or "{}")
        return list(reversed(rows))
