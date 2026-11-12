"use client";
/**
 * Meridian's voice runtime in the browser.
 *  - Speaker: plays OmniVoice WAV chunks in order through an AnalyserNode (drives the Orb); falls back to the
 *    browser's speechSynthesis with the server's Speakable text. Barge-in stops playback instantly.
 *  - Ears: mic -> AudioWorklet -> 16 kHz PCM -> energy VAD (700 ms endpoint, 400 ms while confirming)
 *    -> WAV -> POST /api/voice/stt (local faster-whisper). Push-to-talk (Space / hold the mic) or wake mode.
 */
import { CORE } from "./api";
import { useM } from "./store";

export const levels = { speak: 0, mic: 0 };

/* ─────────── one speaking tab across every browser: the server records which tab the user focused last
   (WebSocket "voice_claim") and broadcasts "voice.owner"; every other tab stays silent and shows captions only ─────────── */
const TAB_ID = Math.random().toString(36).slice(2);
let speakerTab = false;                     // silent until the server confirms this tab owns the voice

export function claimVoice() {
  if (typeof window === "undefined" || document.hidden) return;   // background tabs never take the voice
  const ws: WebSocket | undefined = (window as any).__meridianWs;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "voice_claim", client: TAB_ID }));
}

/** Called for every server "voice.owner" event. */
export function setVoiceOwner(owner: string | null) {
  const mine = owner === TAB_ID;
  if (!mine && speakerTab) speaker.stop();  // another tab took over: go quiet immediately
  speakerTab = mine;
  if (owner === null && !document.hidden && document.hasFocus()) claimVoice();  // the speaking tab closed
}

if (typeof window !== "undefined") {
  window.addEventListener("focus", claimVoice);
  window.addEventListener("pointerdown", claimVoice);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && document.hasFocus()) claimVoice(); });
}

export const isSpeakerTab = () => speakerTab;

/* ─────────── one browser voice for the whole session, chosen after the voice list has loaded ─────────── */
const VOICE_KEY = "meridian.voice";
const MALE = /\b(male|david|george|mark|ravi|ryan|guy|james|daniel|thomas|fred|alex|prabhat|hemant)\b/i;
const TIERS: ((v: SpeechSynthesisVoice) => boolean)[] = [
  (v) => /en-IN/i.test(v.lang) && /female|heera|neerja|swara|kalpana|veena|india/i.test(v.name) && !MALE.test(v.name.replace(/female/i, "")),
  (v) => /en-GB/i.test(v.lang) && /female|hazel|libby|sonia|serena|kate|susan|maisie/i.test(v.name),
  (v) => /en-US/i.test(v.lang) && /female|zira|aria|jenny|samantha|ava|allison|emma|michelle/i.test(v.name),
  (v) => /en-IN/i.test(v.lang) && !MALE.test(v.name),
  (v) => /^en/i.test(v.lang) && !MALE.test(v.name),
  (v) => /^en/i.test(v.lang),
];
let chosenVoice: SpeechSynthesisVoice | null = null;

const voicesReady: Promise<void> = typeof window === "undefined" || !window.speechSynthesis ? Promise.resolve() :
  new Promise((resolve) => {
    const done = () => { if (speechSynthesis.getVoices().length) { pickVoice(); resolve(); } };
    done();
    speechSynthesis.addEventListener("voiceschanged", done);
    setTimeout(() => { pickVoice(); resolve(); }, 2500);   // some browsers never fire voiceschanged
  });

function pickVoice() {
  if (chosenVoice) return;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;
  let saved: string | null = null;
  try { saved = localStorage.getItem(VOICE_KEY); } catch {}
  chosenVoice = (saved && voices.find((v) => v.name === saved)) || TIERS.map((t) => voices.find(t)).find(Boolean) || null;
  if (chosenVoice) try { localStorage.setItem(VOICE_KEY, chosenVoice.name); } catch {}
}

export const browserVoiceName = () => chosenVoice?.name ?? null;
if (typeof window !== "undefined") (window as any).__meridianVoice = { isSpeakerTab: () => speakerTab, voice: () => chosenVoice?.name ?? null };

class Speaker {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  queue: Map<string, { n: number; chunks: (AudioBuffer | null | undefined)[]; next: number; text: string }> = new Map();
  current: AudioBufferSourceNode | null = null;
  order: string[] = [];
  muted = false;
  speaking = false;
  private raf = 0;
  private synthTimer: any = null;

  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const tick = () => {
        if (this.analyser && this.current) {
          this.analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
          levels.speak = Math.min(1, Math.sqrt(sum / data.length) * 4);
        } else if (!this.synthTimer) levels.speak *= 0.9;
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  say(id: string, n: number, engine: string, speech: string, rate = 1, lang = "en") {
    if (this.muted || !speakerTab) return;     // only the active tab speaks
    if (lang === "hi" || engine === "browser") return this.browserSay(speech, rate, lang);
    this.queue.set(id, { n, chunks: new Array(n), next: 0, text: speech });
    this.order.push(id);
    // if OmniVoice chunks don't arrive in time, fall back so the user is never left in silence
    setTimeout(() => {
      const q = this.queue.get(id);
      if (q && q.next === 0 && !q.chunks[0] && this.order[0] === id) {
        this.queue.delete(id); this.order.shift(); this.browserSay(speech, rate);
      }
    }, 6000);
  }

  async chunk(id: string, seq: number, url: string | null) {
    const q = this.queue.get(id);
    if (!q || !speakerTab) return;
    if (!url) { q.chunks[seq] = null; this.pump(); return; }
    try {
      this.ensure();
      const buf = await (await fetch(CORE + url)).arrayBuffer();
      q.chunks[seq] = await this.ctx!.decodeAudioData(buf);
    } catch { q.chunks[seq] = null; }
    this.pump();
  }

  private pump(): void {
    if (this.current || !this.order.length) return;
    const id = this.order[0];
    const q = this.queue.get(id);
    if (!q) { this.order.shift(); return this.pump(); }
    if (q.next >= q.n) { this.queue.delete(id); this.order.shift(); this.setSpeaking(false); return this.pump(); }
    const b = q.chunks[q.next];
    if (b === undefined) return;               // still rendering
    q.next++;
    if (b === null) return this.pump();
    this.ensure();
    const src = this.ctx!.createBufferSource();
    src.buffer = b;
    src.connect(this.analyser!);
    src.onended = () => { this.current = null; this.pump(); };
    this.current = src;
    this.setSpeaking(true);
    src.start();
  }

  async browserSay(text: string, rate = 1, lang = "en") {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    await voicesReady;                         // never speak before the voice is chosen (avoids the OS default voice)
    if (!speakerTab || this.muted) return;
    const u = new SpeechSynthesisUtterance(text);
    const hindi = lang === "hi" ? speechSynthesis.getVoices().find((v) => /^hi/i.test(v.lang)) : undefined;
    if (lang === "hi") { u.lang = "hi-IN"; if (hindi) u.voice = hindi; }
    else if (chosenVoice) { u.voice = chosenVoice; u.lang = chosenVoice.lang; }
    u.rate = rate; u.pitch = 1.0;
    u.onstart = () => {
      this.setSpeaking(true);
      let t = 0;
      this.synthTimer = setInterval(() => { t += 0.12; levels.speak = 0.35 + 0.3 * Math.abs(Math.sin(t * 5)) * Math.random(); }, 60);
    };
    const end = () => { clearInterval(this.synthTimer); this.synthTimer = null; levels.speak = 0;
      if (!speechSynthesis.speaking) this.setSpeaking(false); };
    u.onend = end; u.onerror = end;
    speechSynthesis.speak(u);
  }

  stop() {
    try { this.current?.stop(); } catch {}
    this.current = null;
    this.queue.clear(); this.order = [];
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    clearInterval(this.synthTimer); this.synthTimer = null;
    levels.speak = 0;
    this.setSpeaking(false);
  }

  private setSpeaking(on: boolean) {
    if (this.speaking === on) return;
    this.speaking = on;
    const s = useM.getState();
    if (on && s.voice !== "halted") s.set({ voice: "speaking" });
    if (!on && s.voice === "speaking") s.set({ voice: s.st?.ticket ? "awaiting_confirm" : s.st?.kill.state === "LOCKED" ? "halted" : "idle" });
  }
}

export const speaker = new Speaker();

/* ─────────────────────────────── microphone ─────────────────────────────── */
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
}
registerProcessor('meridian-tap', Tap);`;

function encodeWav(samples: Float32Array, rate = 16000): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}

class Mic {
  ctx: AudioContext | null = null;
  stream: MediaStream | null = null;
  node: AudioWorkletNode | null = null;
  rate = 48000;
  mode: "off" | "ptt" | "wake" = "off";
  recording = false;
  buf: Float32Array[] = [];
  floor = 0.008;
  silenceMs = 0;
  voiced = 0;
  busy = false;
  error: string | null = null;

  async start() {
    if (this.ctx) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true,
        autoGainControl: true, channelCount: 1 } });
      this.ctx = new AudioContext();
      this.rate = this.ctx.sampleRate;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await this.ctx.audioWorklet.addModule(url);
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.ctx, "meridian-tap");
      this.node.port.onmessage = (ev) => this.frame(ev.data as Float32Array);
      src.connect(this.node);
      this.error = null;
      return true;
    } catch (e: any) {
      this.error = e?.message || "microphone unavailable";
      useM.getState().toast({ tone: "warn", title: "Microphone unavailable", body: "Type commands instead; HALT still works." });
      return false;
    }
  }

  private downsample(x: Float32Array) {
    const ratio = this.rate / 16000;
    const out = new Float32Array(Math.floor(x.length / ratio));
    for (let i = 0; i < out.length; i++) out[i] = x[Math.floor(i * ratio)];
    return out;
  }

  private frame(x: Float32Array) {
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    const rms = Math.sqrt(sum / x.length);
    levels.mic = Math.min(1, rms * 12);
    const ms = (x.length / this.rate) * 1000;
    const speech = rms > Math.max(0.015, this.floor * 3.2);
    if (!speech) this.floor = this.floor * 0.995 + rms * 0.005;
    if (this.mode === "ptt") {
      if (this.recording) this.buf.push(this.downsample(x));
      return;
    }
    if (this.mode !== "wake") return;
    // barge-in: the user talks over Meridian -> stop playback within one frame
    if (speech && speaker.speaking) { this.voiced++; if (this.voiced > 4) speaker.stop(); }
    if (speech) {
      this.voiced++;
      this.silenceMs = 0;
      if (!this.recording && this.voiced >= 3) { this.recording = true; this.buf = []; useM.getState().set({ voice: "listening" }); }
    } else {
      this.voiced = 0;
      this.silenceMs += ms;
    }
    if (this.recording) {
      this.buf.push(this.downsample(x));
      const confirming = !!useM.getState().st?.ticket;
      if (this.silenceMs > (confirming ? 400 : 700)) this.finish(true);
      if (this.buf.length * 128 > 16000 * 12) this.finish(true);
    }
  }

  pttDown() {
    speaker.stop();
    this.mode = "ptt"; this.recording = true; this.buf = [];
    useM.getState().set({ voice: "listening" });
    fetch(CORE + "/api/voice/state", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "listening" }) }).catch(() => {});
  }

  pttUp() {
    if (this.mode !== "ptt") return;
    this.finish(false);
    this.mode = this.wakeOn ? "wake" : "off";
  }

  wakeOn = false;
  setWake(on: boolean) { this.wakeOn = on; this.mode = on ? "wake" : "off"; }

  private async finish(wake: boolean) {
    this.recording = false;
    const parts = this.buf; this.buf = [];
    const n = parts.reduce((a, b) => a + b.length, 0);
    if (n < 16000 * 0.3) { useM.getState().set({ voice: "idle" }); return; }
    const all = new Float32Array(n);
    let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
    useM.getState().set({ voice: "thinking", partial: "transcribing…" });
    try {
      const r = await fetch(`${CORE}/api/voice/stt?wake=${wake ? 1 : 0}`, { method: "POST", body: encodeWav(all) });
      const d = await r.json();
      if (d.error && !d.text) useM.getState().toast({ tone: "warn", title: "Didn't catch that", body: d.error });
      useM.getState().set({ partial: "" });
      if (d.ignored || !d.text) useM.getState().set({ voice: "idle" });
    } catch {
      useM.getState().set({ voice: "idle", partial: "" });
      useM.getState().toast({ tone: "bad", title: "Speech service unreachable" });
    }
  }
}

export const mic = new Mic();
