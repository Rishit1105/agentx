"""Meridian voice: OmniVoice TTS service (k2-fsa/OmniVoice, Apache-2.0).

* Loads the model once (CUDA > XPU > MPS > CPU), in the background so /health answers immediately.
* The Meridian persona is *designed* (instruct="female, low pitch, british accent"), then *cloned* from that first
  rendering into voices/meridian.pt so every sentence sounds like the same person (the authors' most stable mode).
* POST /tts {text, speed, steps} -> audio/wav (24 kHz). Header X-RTF reports the real-time factor measured here.

Run:  voice-tts/.venv/Scripts/python -m uvicorn server:app --app-dir voice-tts --port 8102
"""
from __future__ import annotations

import io
import os
import threading
import time
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import Response

HERE = Path(__file__).parent
VOICES = HERE / "voices"
VOICES.mkdir(exist_ok=True)
PERSONA = os.getenv("MERIDIAN_VOICE_INSTRUCT", "female, low pitch, british accent")
STEPS = int(os.getenv("TTS_STEPS", "16"))
SEED_LINE = "Good morning. I'm Meridian, your paper trading desk. Every trade is checked, sized, and explained."

state = {"ready": False, "loading": False, "error": None, "device": None, "rtf": None, "model": "k2-fsa/OmniVoice",
         "persona": PERSONA, "steps": STEPS, "voice": None, "load_s": None}
model = None
prompt = None
lock = threading.Lock()


def pick_device():
    import torch
    if torch.cuda.is_available():
        return "cuda:0", torch.float16
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        return "xpu", torch.float16
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


def load():
    global model, prompt
    state["loading"] = True
    t0 = time.time()
    try:
        import torch
        from omnivoice import OmniVoice, VoiceClonePrompt
        dev, dt = pick_device()
        # leave half the cores for the core backend, Whisper and the local LLM
        torch.set_num_threads(int(os.getenv("TTS_THREADS", max(2, (os.cpu_count() or 4) // 2))))
        model = OmniVoice.from_pretrained(state["model"], device_map=dev, dtype=dt)
        state["device"] = dev
        pfile = VOICES / "meridian.pt"
        if pfile.exists():
            prompt = VoiceClonePrompt.load(str(pfile))
            state["voice"] = "cloned (voices/meridian.pt)"
        else:
            # voice design -> clone: render the persona once, then freeze it as a reusable prompt
            audio = model.generate(text=SEED_LINE, instruct=PERSONA, num_step=32)[0]
            sf.write(VOICES / "meridian_seed.wav", audio, model.sampling_rate)
            wav = torch.from_numpy(np.asarray(audio, dtype=np.float32)).unsqueeze(0)
            prompt = model.create_voice_clone_prompt(ref_audio=(wav, model.sampling_rate), ref_text=SEED_LINE)
            prompt.save(str(pfile))
            state["voice"] = "designed + cloned (new)"
        state["ready"] = True
        state["load_s"] = round(time.time() - t0, 1)
        synth("Ready.", 1.0, STEPS)  # warm-up + first RTF measurement
    except Exception as e:  # report, never crash the service
        state["error"] = f"{e.__class__.__name__}: {e}"[:400]
    finally:
        state["loading"] = False


def synth(text: str, speed: float, steps: int) -> tuple[bytes, float, float]:
    with lock:
        t0 = time.perf_counter()
        kw = {"text": text, "num_step": steps, "speed": speed}
        if prompt is not None:
            kw["voice_clone_prompt"] = prompt
        else:
            kw["instruct"] = PERSONA
        audio = model.generate(**kw)[0]
        gen = time.perf_counter() - t0
    dur = len(audio) / model.sampling_rate
    rtf = gen / dur if dur else 0.0
    state["rtf"] = round(rtf if state["rtf"] is None else 0.7 * state["rtf"] + 0.3 * rtf, 3)
    buf = io.BytesIO()
    sf.write(buf, np.asarray(audio, dtype=np.float32), model.sampling_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue(), rtf, dur


app = FastAPI(title="Meridian voice (OmniVoice)")


@app.on_event("startup")
def _startup():
    threading.Thread(target=load, daemon=True).start()


@app.get("/health")
def health():
    return state


@app.post("/tts")
def tts(body: dict = Body(...)):
    if not state["ready"]:
        raise HTTPException(503, state["error"] or "model loading")
    text = (body.get("text") or "").strip()[:600]
    if not text:
        raise HTTPException(400, "empty text")
    speed = float(body.get("speed") or 1.0)
    steps = int(body.get("steps") or STEPS)
    wav, rtf, dur = synth(text, speed, steps)
    return Response(wav, media_type="audio/wav", headers={"X-RTF": f"{rtf:.3f}", "X-Duration": f"{dur:.2f}"})
