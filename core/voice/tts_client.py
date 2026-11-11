"""Client for the OmniVoice service (voice-tts/server.py) with the blueprint's fallback ladder:
(1) OmniVoice live  ->  (2) pre-rendered / cached WAV  ->  (3) browser speechSynthesis (captions always shown)."""
from __future__ import annotations

import asyncio
import os
import hashlib
import time

import httpx

from ..config import CACHE, ENV

TTS_DIR = CACHE / "tts"
TTS_DIR.mkdir(parents=True, exist_ok=True)

# (text, speed) exactly as the Conductor will say them; rendered once in the real OmniVoice voice
COMMON = [("Stopped. Orders cancelled, positions flat, autopilot off. I've written up what happened.", 0.95),
          ("Scanning now.", 1.05), ("Listening.", 1.0), ("Ticket cancelled. Nothing was placed.", 1.0),
          ("One moment, I'm still working on the last request.", 1.05), ("Re-armed. Entries are allowed again within your limits.", 1.05),
          ("The autopilot mandate has ended. Back to advise mode.", 1.05)]


class TTS:
    def __init__(self):
        self.url = ENV["tts_url"].rstrip("/")
        self.up = False
        self.info: dict = {}
        self.rtf: float | None = None
        self._checked = 0.0
        self._queue: asyncio.Queue | None = None

    @staticmethod
    def key(text: str, speed: float) -> str:
        return hashlib.sha1(f"meridian-v1|{speed:.2f}|{text}".encode()).hexdigest()[:20]

    def cached(self, text: str, speed: float) -> str | None:
        k = self.key(text, speed)
        return k if (TTS_DIR / f"{k}.wav").exists() else None

    async def health(self) -> bool:
        if time.time() - self._checked < 15:
            return self.up
        self._checked = time.time()
        try:
            async with httpx.AsyncClient(timeout=2) as c:
                r = await c.get(f"{self.url}/health")
                self.info = r.json()
                self.up = r.status_code == 200 and self.info.get("ready", False)
                self.rtf = self.info.get("rtf")
        except Exception:
            self.up = False
        return self.up

    def engine(self) -> str:
        """The single voice used for every reply. VOICE_ENGINE=auto (default) picks OmniVoice only when it can speak
        every sentence live (RTF < 0.6, i.e. a GPU); otherwise the browser voice speaks everything. 'omnivoice' or
        'browser' force one (forced OmniVoice still falls back to the browser if the service is down)."""
        mode = os.getenv("VOICE_ENGINE", "auto").lower()
        if mode == "browser":
            return "browser"
        if mode == "omnivoice":
            return "omnivoice" if self.up else "browser"
        return "omnivoice" if self.live_ok() else "browser"

    def live_ok(self) -> bool:
        """Use live OmniVoice only when it is fast enough on this machine (RTF < 0.6)."""
        return self.up and (self.rtf is None or self.rtf < 0.6)

    async def render(self, text: str, speed: float = 1.0, steps: int | None = None) -> str | None:
        k = self.key(text, speed)
        path = TTS_DIR / f"{k}.wav"
        if path.exists():
            return k
        if not await self.health():
            return None
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(f"{self.url}/tts", json={"text": text, "speed": speed, "steps": steps})
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("audio"):
                path.write_bytes(r.content)
                rtf = r.headers.get("x-rtf")
                if rtf:
                    self.rtf = float(rtf) if self.rtf is None else 0.7 * self.rtf + 0.3 * float(rtf)
                return k
        except Exception:
            self.up = False
        return None

    async def warm_cache(self, phrases: list[tuple[str, float]] | None = None):
        """Pre-render the most common phrases (the blueprint's 'phrase cache'), sentence by sentence, exactly as
        say() will request them. Waits for the TTS service to come up (model load can take minutes on CPU)."""
        from .speakable import sentences, speakable
        for _ in range(60):
            if await self.health():
                break
            self._checked = 0
            await asyncio.sleep(20)
        else:
            return
        for text, speed in phrases or COMMON:
            for s in sentences(speakable(text)):
                if not await self.health():
                    return
                await self.render(s, speed)

    def should_prerender(self) -> bool:
        """Background-render arbitrary replies only when the hardware is fast enough to make it worthwhile."""
        return self.up and (self.rtf is None or self.rtf < 3)

    def state(self) -> dict:
        return {"service": self.up, "rtf": self.rtf, "mode": "omnivoice" if self.live_ok() else
                ("cache+browser" if self.up else "browser"), "device": self.info.get("device"),
                "model": self.info.get("model"), "cached": len(list(TTS_DIR.glob("*.wav")))}


tts = TTS()
