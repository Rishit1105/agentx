"""Provider-agnostic LLM client over the OpenAI-compatible /chat/completions protocol (with tools).

Default: a local Ollama model (free, offline, private). Works unchanged with any OpenAI-compatible endpoint
(Groq, Google Gemini's OpenAI endpoint, OpenRouter, LM Studio, vLLM) by setting LLM_BASE_URL / LLM_API_KEY /
LLM_MODEL in .env. The LLM is never required: the deterministic grammar handles every core command.
"""
from __future__ import annotations

import json
import time

import httpx

from ..config import ENV


class LLM:
    def __init__(self):
        self.base = ENV["llm_base_url"].rstrip("/")
        self.key = ENV["llm_api_key"]
        self.model = ENV["llm_model"]
        self.enabled = ENV["llm_enabled"]
        self.timeout = ENV["llm_timeout"]
        self._ok: bool | None = None
        self._checked = 0.0
        self.last_error: str | None = None
        self.last_ms: int | None = None

    def info(self) -> dict:
        return {"enabled": self.enabled, "available": bool(self._ok), "model": self.model,
                "provider": "ollama" if ":11434" in self.base else self.base.split("//")[-1].split("/")[0],
                "last_ms": self.last_ms, "last_error": self.last_error}

    async def available(self) -> bool:
        if not self.enabled:
            return False
        if self._ok is not None and time.time() - self._checked < 60:
            return self._ok
        self._checked = time.time()
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                r = await c.get(f"{self.base}/models", headers={"Authorization": f"Bearer {self.key}"})
                self._ok = r.status_code == 200
        except Exception as e:
            self._ok = False
            self.last_error = f"unreachable: {e.__class__.__name__}"
        return self._ok

    async def chat(self, messages: list[dict], tools: list[dict] | None = None, *, max_tokens: int = 600,
                   temperature: float = 0.2, json_mode: bool = False) -> dict:
        body = {"model": self.model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
                "stream": False}
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as c:
                r = await c.post(f"{self.base}/chat/completions", json=body,
                                 headers={"Authorization": f"Bearer {self.key}"})
            self.last_ms = int((time.perf_counter() - t0) * 1000)
            if r.status_code != 200:
                self.last_error = f"HTTP {r.status_code}: {r.text[:200]}"
                raise RuntimeError(self.last_error)
            msg = r.json()["choices"][0]["message"]
            self.last_error = None
            return msg
        except httpx.TimeoutException:
            self.last_error = "timeout"
            self._ok = None
            raise

    @staticmethod
    def tool_calls(msg: dict) -> list[tuple[str, str, dict]]:
        out = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function", {})
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except (ValueError, TypeError):
                args = {}
            out.append((tc.get("id", "call"), fn.get("name", ""), args if isinstance(args, dict) else {}))
        return out


llm = LLM()
