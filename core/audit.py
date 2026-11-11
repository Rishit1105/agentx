"""Hash-chained, append-only audit log: hash = sha256(prev_hash || canonical_json(event))."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from .db import DB, dumps

GENESIS = "0" * 64


class Audit:
    def __init__(self, db: DB):
        self.db = db

    def _last_hash(self) -> str:
        r = self.db.one("SELECT hash FROM audit ORDER BY id DESC LIMIT 1")
        return r["hash"] if r else GENESIS

    def append(self, kind: str, **data) -> dict:
        with self.db.lock:
            event = {"kind": kind, "ts": datetime.now(timezone.utc).isoformat(), **data}
            canon = dumps(event)
            prev = self._last_hash()
            h = hashlib.sha256((prev + canon).encode()).hexdigest()
            cur = self.db.execute("INSERT INTO audit(ts,event,prev_hash,hash) VALUES(?,?,?,?)",
                                  (event["ts"], canon, prev, h))
            return {"id": cur.lastrowid, "hash": h, "prev_hash": prev, "event": event}

    def verify(self) -> dict:
        prev = GENESIS
        rows = self.db.query("SELECT id,event,prev_hash,hash FROM audit ORDER BY id")
        for r in rows:
            if r["prev_hash"] != prev:
                return {"ok": False, "rows": len(rows), "broken_at": r["id"], "why": "prev_hash mismatch"}
            h = hashlib.sha256((prev + r["event"]).encode()).hexdigest()
            if h != r["hash"]:
                return {"ok": False, "rows": len(rows), "broken_at": r["id"], "why": "hash mismatch"}
            prev = h
        return {"ok": True, "rows": len(rows), "head": prev}

    def tail(self, n: int = 50) -> list[dict]:
        import json
        rows = self.db.query("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (n,))
        for r in rows:
            r["event"] = json.loads(r["event"])
        return rows
