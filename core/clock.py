"""Virtual clock on India Standard Time: live wall-clock, or a Replay session that runs at 1x-240x."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
NSE_OPEN, NSE_CLOSE = "09:15", "15:30"


def mm(s: str) -> int:
    h, x = s.split(":")
    return int(h) * 60 + int(x)


class Clock:
    def __init__(self):
        self.mode = "live"
        self.speed = 1.0
        self.paused = False
        self._anchor_v: datetime | None = None
        self._anchor_w: float = 0.0
        self.session_date: str | None = None

    def set_live(self):
        self.mode, self.speed, self.paused, self._anchor_v = "live", 1.0, False, None

    def set_replay(self, start: datetime, speed: float):
        self.mode = "replay"
        self.speed = max(0.25, min(float(speed), 240.0))
        self.paused = False
        self._anchor_v = start.astimezone(IST)
        self._anchor_w = time.monotonic()
        self.session_date = self._anchor_v.strftime("%Y-%m-%d")

    def _rebase(self):
        if self.mode == "replay":
            self._anchor_v = self.now()
            self._anchor_w = time.monotonic()

    def set_speed(self, speed: float):
        self._rebase()
        self.speed = max(0.25, min(float(speed), 240.0))

    def pause(self, paused: bool):
        self._rebase()
        self.paused = paused

    def jump(self, to: datetime):
        if self.mode == "replay":
            self._anchor_v = to.astimezone(IST)
            self._anchor_w = time.monotonic()

    def now(self) -> datetime:
        if self.mode == "live" or self._anchor_v is None:
            return datetime.now(timezone.utc).astimezone(IST)
        if self.paused:
            return self._anchor_v
        return self._anchor_v + timedelta(seconds=(time.monotonic() - self._anchor_w) * self.speed)

    def now_arg(self) -> str | None:
        """--now for the repo tools: India time (the India edition reads naive times as IST)."""
        return self.now().strftime("%Y-%m-%d %H:%M") if self.mode == "replay" else None

    def today(self) -> str:
        return self.now().strftime("%Y-%m-%d")

    def hhmm(self) -> str:
        return self.now().strftime("%H:%M")

    def label(self) -> str:
        return self.now().strftime("%Y-%m-%d %H:%M:%S IST")

    def utc_iso(self) -> str:
        return self.now().astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def minutes(self) -> int:
        n = self.now()
        return n.hour * 60 + n.minute

    def phase(self, cfg: dict) -> str:
        m = self.minutes()
        if m < mm(NSE_OPEN):
            return "pre"
        if m >= mm(NSE_CLOSE):
            return "closed"
        if m >= mm(cfg.get("flat_by", "15:15")):
            return "flat_by"
        if m < mm(cfg.get("no_entries_before", "09:30")):
            return "opening_range"
        if m > mm(cfg.get("no_entries_after", "15:00")):
            return "no_entries"
        return "entry_window"

    def snapshot(self, cfg: dict) -> dict:
        return {"mode": self.mode, "speed": self.speed, "paused": self.paused, "now": self.label(),
                "iso": self.now().isoformat(), "hhmm": self.hhmm(), "date": self.today(),
                "phase": self.phase(cfg), "tz": "IST", "market": "NSE", "open": NSE_OPEN, "close": NSE_CLOSE}


clock = Clock()
NY = IST   # legacy alias (the core used to run on New York time)
