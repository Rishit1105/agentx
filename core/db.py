"""SQLite (WAL) store: events, tool calls, orders, fills, stories, mandates, kill events, audit."""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, vclock TEXT, type TEXT,
    actor TEXT, payload TEXT);
CREATE TABLE IF NOT EXISTS tool_calls(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, tool TEXT, args TEXT,
    result_digest TEXT, ok INTEGER, status TEXT, ms INTEGER, decision TEXT, origin TEXT);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, parent_id TEXT, fingerprint TEXT, symbol TEXT, side TEXT,
    qty REAL, type TEXT, order_class TEXT, leg TEXT, stop REAL, target REAL, limit_price REAL, status TEXT,
    mandate_id TEXT, created_ts TEXT, updated_ts TEXT, fill_price REAL, reason TEXT);
CREATE TABLE IF NOT EXISTS fills(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, ts TEXT, symbol TEXT,
    side TEXT, price REAL, qty REAL, leg TEXT, fee REAL);
CREATE TABLE IF NOT EXISTS positions(symbol TEXT PRIMARY KEY, qty REAL, avg_price REAL, stop REAL, target REAL,
    opened_ts TEXT, story_id TEXT, max_loss REAL, setup TEXT);
CREATE TABLE IF NOT EXISTS account(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS stories(id TEXT PRIMARY KEY, ts TEXT, vclock TEXT, kind TEXT, symbol TEXT,
    headline TEXT, why TEXT, checked TEXT, if_wrong TEXT, outcome TEXT, spoken TEXT, evidence TEXT, pnl REAL,
    r REAL, status TEXT, writer TEXT, meta TEXT);
CREATE TABLE IF NOT EXISTS mandates(id TEXT PRIMARY KEY, granted_ts TEXT, expires_ts TEXT, scope TEXT,
    max_trades INTEGER, used INTEGER, status TEXT);
CREATE TABLE IF NOT EXISTS kill_events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, trig TEXT, actor TEXT,
    state_from TEXT, state_to TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, event TEXT, prev_hash TEXT,
    hash TEXT);
CREATE TABLE IF NOT EXISTS turns(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, role TEXT, text TEXT);
CREATE TABLE IF NOT EXISTS order_tags(order_id TEXT PRIMARY KEY, ts TEXT, symbol TEXT, origin TEXT, algo_id TEXT,
    client_id TEXT, mandate_id TEXT, mood TEXT, confidence INTEGER, tilt TEXT);
CREATE TABLE IF NOT EXISTS compliance_log(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, vclock TEXT, kind TEXT,
    method TEXT, path TEXT, status INTEGER, detail TEXT);
CREATE INDEX IF NOT EXISTS ix_events_type ON events(type);
CREATE INDEX IF NOT EXISTS ix_stories_symbol ON stories(symbol);
"""


class DB:
    def __init__(self, path=DB_PATH):
        self.path = str(path)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.executescript(SCHEMA)

    def execute(self, sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
        with self.lock:
            return self.conn.execute(sql, params)

    def query(self, sql: str, params: tuple | list = ()) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.conn.execute(sql, params).fetchall()]

    def one(self, sql: str, params: tuple | list = ()) -> dict | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def reset_trading_day(self) -> None:
        """Clear per-session trading state (used when a new Replay session starts)."""
        with self.lock:
            for t in ("orders", "fills", "positions", "account", "mandates", "events", "tool_calls",
                      "stories", "kill_events", "turns", "order_tags"):
                self.conn.execute(f"DELETE FROM {t}")

    # account key/value
    def kv_get(self, k: str, default: Any = None) -> Any:
        r = self.one("SELECT v FROM account WHERE k=?", (k,))
        return json.loads(r["v"]) if r else default

    def kv_set(self, k: str, v: Any) -> None:
        self.execute("INSERT INTO account(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
                     (k, json.dumps(v)))


def dumps(o: Any) -> str:
    return json.dumps(o, sort_keys=True, separators=(",", ":"), default=str)
