"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Activity, BookText, CandlestickChart, FlaskConical, LayoutGrid, Pause, Play, Shield, Wifi, WifiOff, X,
  FastForward, Cpu, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { api, WS_URL } from "@/lib/api";
import { fmt, useM } from "@/lib/store";
import { speaker } from "@/lib/voice";
import HaltLever from "./HaltLever";
import AgentDrawer from "./AgentDrawer";
import MandateSheet from "./MandateSheet";

const NAV = [
  { href: "/", label: "Command Deck", icon: LayoutGrid, key: "1", screen: "deck" },
  { href: "/studio", label: "Trade Studio", icon: CandlestickChart, key: "2", screen: "studio" },
  { href: "/backtest", label: "Backtest Lab", icon: FlaskConical, key: "3", screen: "backtest" },
  { href: "/ledger", label: "Ledger", icon: BookText, key: "4", screen: "ledger" },
  { href: "/guardrails", label: "Guardrails", icon: Shield, key: "5", screen: "guardrails" },
];
const PHASE: Record<string, [string, string]> = {
  pre: ["Pre-open", "#7d8a9c"], opening_range: ["Opening range", "#ffb547"], entry_window: ["Entry window", "#3ddc97"],
  no_entries: ["No new entries", "#ffb547"], flat_by: ["Flat-by", "#ff5c6c"], closed: ["Closed", "#7d8a9c"],
};

function useSocket() {
  const apply = useM((s) => s.apply);
  const set = useM((s) => s.set);
  useEffect(() => {
    let ws: WebSocket | null = null, alive = true, retry = 0, timer: any;
    const open = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => { retry = 0; set({ connected: true }); };
      ws.onclose = () => { set({ connected: false }); if (alive) timer = setTimeout(open, Math.min(8000, 500 * 2 ** retry++)); };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data);
          apply(e);
          if (e.type === "voice.say") speaker.say(e.payload.id, e.payload.n, e.payload.engine, e.payload.speech, e.payload.speed);
          if (e.type === "tts.chunk") speaker.chunk(e.payload.id, e.payload.seq, e.payload.url);
          if (e.type === "kill.state" && e.payload.state === "HALTING") speaker.stop();
        } catch {}
      };
      (window as any).__meridianWs = ws;
    };
    open();
    return () => { alive = false; clearTimeout(timer); ws?.close(); };
  }, [apply, set]);
}

function ClockChip() {
  const clock = useM((s) => s.st?.clock);
  const replay = useM((s) => s.st?.replay);
  if (!clock) return <div className="skeleton h-7 w-56" />;
  const [ph, col] = PHASE[clock.phase] || [clock.phase, "#7d8a9c"];
  const ctl = (b: any) => api.post("/api/replay/control", b).catch(() => {});
  return (
    <div className="flex items-center gap-2">
      <div className="chip !h-8 !px-3 gap-2.5" title={replay ? `Replay of the real NSE session of ${replay.date} (NIFTY 100, 5-minute bars)` : ""}>
        <span className="live-dot" style={{ background: clock.paused ? "#7d8a9c" : col }} />
        <span className="num text-[13px] text-ink">{clock.now.slice(11, 19)}</span>
        <span className="text-faint">IST</span>
        <span className="text-[11.5px]" style={{ color: col }}>{ph}</span>
      </div>
      {clock.mode === "replay" ? (
        <div className="flex items-center rounded-full border border-line-2 h-8 overflow-hidden">
          <span className="px-2.5 text-[10.5px] tracking-[0.14em] text-amber display">NSE REPLAY {clock.date.slice(8)}/{clock.date.slice(5, 7)}</span>
          <button className="h-8 w-8 grid place-items-center hover:bg-white/5 text-ink-2" aria-label={clock.paused ? "Play" : "Pause"}
            onClick={() => ctl({ paused: !clock.paused })}>{clock.paused ? <Play size={14} /> : <Pause size={14} />}</button>
          {[1, 10, 30, 60].map((sp) => (
            <button key={sp} onClick={() => ctl({ speed: sp, paused: false })}
              className={clsx("h-8 px-1.5 num text-[11px] hover:text-ink", clock.speed === sp && !clock.paused ? "text-cyan" : "text-muted")}>{sp}×</button>
          ))}
          <button className="h-8 w-8 grid place-items-center hover:bg-white/5 text-muted" title="Skip 15 minutes"
            onClick={() => { const [h, m] = clock.hhmm.split(":").map(Number); const t = h * 60 + m + 15;
              ctl({ jump: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` }); }}><FastForward size={14} /></button>
        </div>
      ) : <span className="chip !h-8 text-mint">LIVE</span>}
    </div>
  );
}

function ModeSwitch() {
  const mode = useM((s) => s.st?.mode);
  const mandate = useM((s) => s.st?.mandate);
  const set = useM((s) => s.set);
  const choose = async (m: string) => {
    if (m === "autopilot" && !mandate) { set({ mandateProposal: { minutes: 120, max_trades: 3, strategies: ["orb", "level"] } }); return; }
    try { await api.post("/api/mode", { mode: m }); } catch (e: any) { useM.getState().toast({ tone: "warn", title: "Mode", body: e.message }); }
  };
  return (
    <div className="relative flex h-8 rounded-full border border-line-2 p-0.5 bg-black/30" role="radiogroup" aria-label="Operating mode">
      {(["observe", "advise", "autopilot"] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} onClick={() => choose(m)}
          className={clsx("relative z-10 px-3 text-[12px] capitalize rounded-full transition-colors", mode === m ? "text-[#031118] font-semibold" : "text-muted hover:text-ink")}>
          {mode === m && <motion.span layoutId="modepill" className="absolute inset-0 -z-10 rounded-full"
            style={{ background: m === "autopilot" ? "linear-gradient(180deg,#a99dff,#7a6af0)" : "linear-gradient(180deg,#5beaff,#19bfe0)" }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          {m === "autopilot" ? "Autopilot · paper" : m}
        </button>
      ))}
    </div>
  );
}

function TopBar() {
  const paper = useM((s) => s.st?.paper);
  const connected = useM((s) => s.connected);
  const acct = useM((s) => s.st?.account);
  const [muted, setMuted] = useState(false);
  return (
    <header className="relative z-30 flex items-center gap-4 h-14 px-4 border-b border-line bg-[#070a0f]/80 backdrop-blur-xl">
      <Link href="/" className="flex items-center gap-2.5 pr-2">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="13" fill="none" stroke="#38e1ff" strokeOpacity=".35" />
          <circle cx="16" cy="16" r="7" fill="url(#lg)" />
          <path d="M2 16 Q16 6 30 16 Q16 26 2 16" fill="none" stroke="#e8eef6" strokeWidth="1.2" />
          <defs><radialGradient id="lg"><stop offset="0" stopColor="#fff" /><stop offset=".5" stopColor="#38e1ff" /><stop offset="1" stopColor="#0b3a48" /></radialGradient></defs>
        </svg>
        <span className="display text-[15px] font-semibold tracking-[0.32em]">MERIDIAN</span>
      </Link>
      <ClockChip />
      <div className="flex-1" />
      <div className="hidden xl:flex items-center gap-4 text-[12px]">
        <span className="text-muted">Paper equity <span className="num text-ink ml-1">{fmt.usd(acct?.equity)}</span></span>
        <span className="text-muted">Day <span className={clsx("num ml-1", (acct?.day_pnl ?? 0) >= 0 ? "pos" : "neg")}>{fmt.usd(acct?.day_pnl)}</span></span>
      </div>
      <ModeSwitch />
      <span className="chip !h-8 display text-[10.5px] tracking-[0.18em] font-semibold text-ink-2" title="National Stock Exchange of India · INR · IST">NSE · ₹</span>
      <span className={clsx("chip !h-8 display text-[10.5px] tracking-[0.18em] font-semibold", paper?.ok ? "text-mint border-mint/40 bg-mint/5" : "text-coral border-coral/50")}
        title="Rendered from the server's boot-time paper-only assertion, not a client constant">
        <span className="live-dot" style={{ background: paper?.ok ? "#3ddc97" : "#ff5c6c" }} />PAPER ONLY</span>
      <button className="h-8 w-8 grid place-items-center rounded-full border border-line-2 text-muted hover:text-ink"
        onClick={() => { const m = !muted; setMuted(m); speaker.muted = m; if (m) speaker.stop(); }} aria-label={muted ? "Unmute voice" : "Mute voice"}>
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
      <span title={connected ? "Connected to core" : "Reconnecting…"} className={connected ? "text-mint" : "text-coral"}>
        {connected ? <Wifi size={16} /> : <WifiOff size={16} />}</span>
      <HaltLever />
    </header>
  );
}

function Rail() {
  const path = usePathname();
  const llm = useM((s) => s.st?.llm);
  const voice = useM((s) => s.st?.voice);
  return (
    <nav className="relative z-20 hidden md:flex flex-col items-center gap-1.5 w-[64px] py-3 border-r border-line bg-[#070a0f]/60" aria-label="Screens">
      {NAV.map((n) => {
        const on = path === n.href;
        return (
          <Link key={n.href} href={n.href} title={`${n.label}  (${n.key})`}
            className={clsx("relative h-11 w-11 grid place-items-center rounded-xl transition-all", on ? "text-cyan bg-cyan/10" : "text-muted hover:text-ink hover:bg-white/5")}>
            {on && <motion.span layoutId="railmark" className="absolute -left-[10px] h-6 w-[3px] rounded-r bg-cyan shadow-[0_0_12px_#38e1ff]" />}
            <n.icon size={19} strokeWidth={1.7} />
          </Link>
        );
      })}
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-2 pb-1 text-[9px] text-faint">
        <span title={`Conductor LLM: ${llm?.model} via ${llm?.provider} — ${llm?.available ? "online" : "offline (grammar only)"}`}
          className={llm?.available ? "text-violet" : "text-faint"}><Cpu size={16} /></span>
        <span title={`Voice: ${voice?.tts?.mode} · STT ${voice?.stt?.ready ? "ready" : voice?.stt?.loading ? "loading" : "off"}`}
          className={voice?.tts?.service ? "text-cyan" : "text-faint"}><Activity size={16} /></span>
      </div>
    </nav>
  );
}

function MobileNav() {
  const path = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex justify-around h-14 border-t border-line bg-[#070a0f]/95 backdrop-blur" aria-label="Screens">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={clsx("grid place-items-center w-14", path === n.href ? "text-cyan" : "text-muted")}>
          <n.icon size={20} /></Link>
      ))}
    </nav>
  );
}

function Toasts() {
  const toasts = useM((s) => s.toasts);
  const dismiss = useM((s) => s.dismiss);
  const tone = { info: "#38e1ff", good: "#3ddc97", bad: "#ff5c6c", warn: "#ffb547" };
  return (
    <div className="fixed right-4 bottom-20 md:bottom-5 z-50 flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }} className="panel !rounded-xl px-4 py-3 flex gap-3" style={{ borderColor: tone[t.tone] + "55" }}>
            <span className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ background: tone[t.tone], boxShadow: `0 0 10px ${tone[t.tone]}` }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{t.title}</div>
              {t.body && <div className="text-[12px] text-ink-2 mt-0.5 line-clamp-3">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-ink" aria-label="Dismiss"><X size={14} /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Keyboard() {
  const router = useRouter();
  const lastEsc = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input,textarea,select");
      if (e.key === "Escape") {
        const now = performance.now();
        if (now - lastEsc.current < 800) {
          speaker.stop();
          api.kill("keyboard-esc2").catch(() => {});
          lastEsc.current = 0;
        } else lastEsc.current = now;
        return;
      }
      if (typing) return;
      const n = NAV.find((x) => x.key === e.key);
      if (n && !e.metaKey && !e.ctrlKey) router.push(n.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}

function NavFollower() {
  const navTo = useM((s) => s.navTo);
  const router = useRouter();
  useEffect(() => {
    if (!navTo) return;
    const n = NAV.find((x) => x.screen === navTo.screen);
    if (n) router.push(n.href + (navTo.symbol ? `?symbol=${navTo.symbol}` : ""));
  }, [navTo, router]);
  return null;
}

export default function Shell({ children }: { children: React.ReactNode }) {
  useSocket();
  const kill = useM((s) => s.st?.kill.state);
  const connected = useM((s) => s.connected);
  const st = useM((s) => s.st);
  useEffect(() => { api.get("/api/state").then((s) => useM.getState().set({ st: s })).catch(() => {}); }, []);
  return (
    <div className={clsx("relative z-10 flex flex-col h-dvh", kill === "LOCKED" && "halted-frame")}>
      <TopBar />
      {kill === "LOCKED" && (
        <div className="relative z-20 flex items-center justify-center gap-3 h-9 text-[12.5px] bg-coral/12 border-b border-coral/30 text-coral">
          <span className="live-dot bg-coral" /> Desk halted — orders cancelled, positions flat, entries locked.
          <Link href="/guardrails" className="underline underline-offset-4">Re-arm in Guardrails</Link>
        </div>
      )}
      {!connected && st && (
        <div className="relative z-20 h-8 grid place-items-center text-[12px] bg-amber/10 text-amber border-b border-amber/25">
          Connection to the core lost — reconnecting. The kill switch still works via Esc×2 once reconnected.</div>
      )}
      <div className="flex flex-1 min-h-0">
        <Rail />
        <main className="flex-1 min-w-0 min-h-0 overflow-auto scroll pb-16 md:pb-0">{children}</main>
      </div>
      <MobileNav />
      <Toasts />
      <AgentDrawer />
      <MandateSheet />
      <Keyboard />
      <NavFollower />
    </div>
  );
}
