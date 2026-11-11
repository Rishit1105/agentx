"""Local speech recognition (faster-whisper). Audio never leaves the machine.

The browser captures 16 kHz mono PCM (AudioWorklet), endpoints on silence, and posts a WAV per utterance.
A trading-term prompt biases recognition toward tickers and desk vocabulary.
"""
from __future__ import annotations

import io
import threading
import time
import wave

import numpy as np

from ..config import ENV

PROMPT = ("Meridian, NSE trading desk. Reliance, Infosys, TCS, HDFC Bank, ICICI Bank, State Bank, Bharti Airtel, ITC, "
          "L&T, Bajaj Finance, Tata Steel, Mahindra, Nifty, opening-range breakout, stop-loss, R-multiple, lakh, crore, "
          "rupees, backtest, buy and hold, bulk deals, autopilot, halt, stop everything, yes, buy two hundred Infosys.")


class STT:
    def __init__(self):
        self.model = None
        self.loading = False
        self.error: str | None = None
        self.name = ENV["stt_model"]
        self.lock = threading.Lock()

    def load(self):
        if self.model or self.loading or not ENV["stt_enabled"]:
            return
        self.loading = True
        try:
            from faster_whisper import WhisperModel
            self.model = WhisperModel(self.name, device="cpu", compute_type="int8")
            self.error = None
        except Exception as e:
            self.error = f"{e.__class__.__name__}: {e}"[:300]
        finally:
            self.loading = False

    def load_async(self):
        threading.Thread(target=self.load, daemon=True).start()

    def state(self) -> dict:
        return {"ready": self.model is not None, "loading": self.loading, "model": self.name, "error": self.error}

    @staticmethod
    def decode(data: bytes) -> np.ndarray:
        if data[:4] == b"RIFF":
            with wave.open(io.BytesIO(data)) as w:
                sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
                raw = w.readframes(w.getnframes())
            pcm = np.frombuffer(raw, dtype=np.int16 if sw == 2 else np.int8).astype(np.float32)
            pcm /= 32768.0 if sw == 2 else 128.0
            if ch > 1:
                pcm = pcm.reshape(-1, ch).mean(axis=1)
            if sr != 16000:
                n = int(len(pcm) * 16000 / sr)
                pcm = np.interp(np.linspace(0, len(pcm), n, endpoint=False), np.arange(len(pcm)), pcm).astype(np.float32)
            return pcm
        return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

    def transcribe(self, data: bytes) -> dict:
        if not self.model:
            self.load()
        if not self.model:
            return {"text": "", "confidence": 0.0, "error": self.error or "speech model not available"}
        audio = self.decode(data)
        if len(audio) < 16000 * 0.25:
            return {"text": "", "confidence": 0.0, "error": "too short"}
        t0 = time.perf_counter()
        with self.lock:
            segs, info = self.model.transcribe(audio, language="en", beam_size=1, vad_filter=True,
                                               initial_prompt=PROMPT, condition_on_previous_text=False)
            segs = list(segs)
        text = " ".join(s.text.strip() for s in segs).strip()
        if segs:
            lp = sum(s.avg_logprob for s in segs) / len(segs)
            conf = float(np.clip(np.exp(lp), 0, 1))
            nospeech = max(s.no_speech_prob for s in segs)
            conf = conf * (1 - 0.5 * nospeech)
        else:
            conf = 0.0
        return {"text": text, "confidence": round(conf, 3), "ms": int((time.perf_counter() - t0) * 1000),
                "seconds": round(len(audio) / 16000, 2)}


stt = STT()
