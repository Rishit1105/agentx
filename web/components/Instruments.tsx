"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Radio, SendHorizonal } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { fmt, useM } from "@/lib/store";
import { mic, speaker } from "@/lib/voice";
import type { Position, Story } from "@/lib/types";

const mm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

/* ─────────────────────────────── Session Sundial ─────────────────────────────── */
export function Sundial({ stories, compact = false }: { stories: Story[]; compact?: boolean }) {
  const clock = useM((s) => s.st?.clock);
  const lim = useM((s) => s.st?.limits);
  const open = 555, close = 930;   // NSE 09:15-15:30 IST
  const H = compact ? 0 : 1;
  const y = (m: number) => ((m - open) / (close - open)) * 100;
  const zones = [
    { from: 555, to: mm(lim?.no_entries_before ?? "09:30"), c: "#b7790b", label: "Opening range" },
    { from: mm(lim?.no_entries_before ?? "09:30"), to: mm(lim?.no_entries_after ?? "15:00"), c: "#0e9f6e", label: "Entry window" },
    { from: mm(lim?.no_entries_after ?? "15:00"), to: mm(lim?.flat_by ?? "15:15"), c: "#b7790b", label: "No new entries" },
    { from: mm(lim?.flat_by ?? "15:15"), to: 930, c: "#e5484d", label: "Flat-by" },
  ];
  const now = clock ? mm(clock.hhmm) : 555;
  const pins = stories.filter((s) => ["trade", "skip", "block", "halt"].includes(s.kind)).map((s) => ({
    m: mm(s.vclock.slice(11, 16)), kind: s.kind, sym: s.symbol, id: s.id, headline: s.headline }));
  const pinColor: Record<string, string> = { trade: "#0e9f6e", skip: "#646b76", block: "#b7790b", halt: "#e5484d" };
  void H;
  return (
    <div className="relative h-full min-h-[420px] flex">
      <div className="relative w-14 shrink-0">
        {[555, 600, 660, 720, 780, 840, 900, 930].map((m) => (
          <div key={m} className="absolute right-2 -translate-y-1/2 num text-[10.5px] text-faint" style={{ top: `${y(m)}%` }}>
            {`${Math.floor(m / 60) > 12 ? Math.floor(m / 60) - 12 : Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`}</div>
        ))}
      </div>
      <div className="relative flex-1">
        <div className="absolute left-3 top-0 bottom-0 w-[10px] rounded-full overflow-hidden bg-ink/[0.03] border border-line">
          {zones.map((z) => (
            <div key={z.label} className="absolute inset-x-0" title={z.label}
              style={{ top: `${y(z.from)}%`, height: `${y(z.to) - y(z.from)}%`, background: `linear-gradient(180deg, ${z.c}55, ${z.c}22)` }} />
          ))}
          <div className="absolute inset-x-0 top-0 bg-ink/[0.08]" style={{ height: `${Math.max(0, Math.min(100, y(now)))}%` }} />
        </div>
        {zones.map((z) => (
          <div key={z.label + "l"} className="absolute left-8 text-[10.5px] tracking-wide" style={{ top: `calc(${(y(z.from) + y(z.to)) / 2}% - 7px)`, color: z.c + "cc" }}>
            {z.label}</div>
        ))}
        {pins.map((p) => (
          <div key={p.id} className="absolute left-[7px] flex items-center gap-2 group" style={{ top: `calc(${y(p.m)}% - 9px)` }}>
            <span className="h-[18px] w-[18px] rounded-full grid place-items-center border-2" style={{ borderColor: pinColor[p.kind], background: "#ffffff",
              boxShadow: `0 0 12px ${pinColor[p.kind]}88` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: pinColor[p.kind] }} /></span>
            <span className="text-[11px] num px-1.5 py-0.5 rounded bg-ink/30 border border-line" style={{ color: pinColor[p.kind] }}>
              {p.kind} {p.sym ?? ""}</span>
          </div>
        ))}
        {clock && now >= 555 && now <= 930 && (
          <motion.div className="absolute left-0 right-0 flex items-center gap-2" animate={{ top: `calc(${y(now)}% - 1px)` }} transition={{ duration: 0.4 }}>
            <span className="h-[2px] w-9 bg-cyan shadow-sm" />
            <span className="num text-[11px] text-cyan bg-cyan/10 border border-cyan/30 rounded px-1.5">NOW {clock.hhmm}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Risk Reservoir ─────────────────────────────── */
export function RiskReservoir() {
  const risk = useM((s) => s.st?.risk);
  const acct = useM((s) => s.st?.account);
  const [t, setT] = useState(0);
  useEffect(() => { let r = 0; const f = () => { setT((x) => x + 1); r = requestAnimationFrame(f); }; r = requestAnimationFrame(f);
    return () => cancelAnimationFrame(r); }, []);
  const committed = risk?.committed ?? 0, limit = risk?.daily_limit ?? 150;
  const liveLoss = Math.max(0, -((acct?.realized ?? 0) + (acct?.unrealized ?? 0)));
  const used = Math.min(1, Math.max(committed, liveLoss) / limit);
  const col = used < 0.5 ? "#0e9f6e" : used < 0.8 ? "#b7790b" : "#e5484d";
  const W = 120, H = 170, top = 14, h = H - top - 6;
  const level = top + h * (1 - used);
  const wave = (ph: number, amp: number) => {
    let d = `M 6 ${level}`;
    for (let x = 6; x <= W - 6; x += 4) d += ` L ${x} ${level + Math.sin((x + t * 1.6 + ph) / 11) * amp}`;
    return d + ` L ${W - 6} ${H - 6} L 6 ${H - 6} Z`;
  };
  return (
    <div className="flex items-center gap-5">
      <svg width={W} height={H} aria-label={`Daily risk used ${Math.round(used * 100)} percent`}>
        <defs>
          <linearGradient id="liq" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity="0.85" />
            <stop offset="1" stopColor={col} stopOpacity="0.25" /></linearGradient>
          <clipPath id="tank"><rect x="6" y={top} width={W - 12} height={h} rx="14" /></clipPath>
        </defs>
        <rect x="6" y={top} width={W - 12} height={h} rx="14" fill="#fbfaf7" stroke="#d8d4ca" />
        <g clipPath="url(#tank)">
          {used > 0 && <path d={wave(40, 2.2)} fill={col} opacity="0.25" />}
          {used > 0 && <path d={wave(0, 3)} fill="url(#liq)" />}
        </g>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={W - 18} x2={W - 8} y1={top + h * f} y2={top + h * f} stroke="#c9c5bb" />)}
        <rect x="6" y={top} width={W - 12} height={h} rx="14" fill="none" stroke="#14181f10" />
        <rect x={W / 2 - 18} y={4} width={36} height={10} rx="4" fill="#f2f1ec" stroke="#d8d4ca" />
      </svg>
      <div className="space-y-3 min-w-0">
        <div><div className="label">Daily loss budget</div>
          <div className="display text-[28px] leading-tight num" style={{ color: col }}>{Math.round(used * 100)}%</div></div>
        <div className="text-[12px] text-ink-2 space-y-1">
          <div className="flex justify-between gap-4"><span className="text-muted">Committed max-loss</span><span className="num">{fmt.usd(committed)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted">Live loss</span><span className="num">{fmt.usd(liveLoss)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted">Limit</span><span className="num">{fmt.usd(limit)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted">Trades</span><span className="num">{risk?.trades_used ?? 0} / {risk?.max_trades ?? 3}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Price Ladder ─────────────────────────────── */
export function PriceLadder({ p }: { p: Position }) {
  const stop = p.stop ?? p.avg_price * 0.98, target = p.target ?? p.avg_price * 1.02;
  const lo = Math.min(stop, p.last) - (target - stop) * 0.12, hi = Math.max(target, p.last) + (target - stop) * 0.12;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const rows = [
    { k: "TARGET", v: target, c: "#0e9f6e" }, { k: "ENTRY", v: p.avg_price, c: "#3d4450" }, { k: "STOP", v: stop, c: "#e5484d" },
  ];
  const up = p.last >= p.avg_price;
  return (
    <div className="flex gap-4">
      <div className="relative w-[118px] h-[190px]">
        <div className="absolute left-[54px] top-0 bottom-0 w-[6px] rounded-full"
          style={{ background: `linear-gradient(180deg,#0e9f6e 0%, #0e9f6e44 ${y(p.avg_price)}%, #e5484d44 ${y(p.avg_price)}%, #e5484d 100%)` }} />
        {rows.map((r) => (
          <div key={r.k} className="absolute left-0 right-0 flex items-center" style={{ top: `calc(${y(r.v)}% - 8px)` }}>
            <span className="w-[50px] text-right pr-2 text-[9.5px] tracking-[0.14em]" style={{ color: r.c }}>{r.k}</span>
            <span className="h-[2px] w-[14px]" style={{ background: r.c }} />
            <span className="num text-[11.5px] ml-1.5 text-ink-2">{r.v.toFixed(2)}</span>
          </div>
        ))}
        <motion.div className="absolute left-[44px] flex items-center" animate={{ top: `calc(${y(p.last)}% - 9px)` }} transition={{ duration: 0.5 }}>
          <span className="h-[18px] w-[26px] rounded-md grid place-items-center text-[9px] font-bold text-white"
            style={{ background: up ? "#0e9f6e" : "#e5484d" }}>NOW</span>
        </motion.div>
      </div>
      <div className="space-y-2 text-[12px]">
        <div className="display text-xl">{p.symbol} <span className="text-muted text-sm num">×{p.qty}</span></div>
        <div className="num text-[22px]" style={{ color: up ? "#0e9f6e" : "#e5484d" }}>{fmt.usd(p.unrealized)}</div>
        <div className="text-muted">Last <span className="num text-ink">{p.last.toFixed(2)}</span></div>
        <div className="text-muted">R now <span className="num text-ink">{p.r_now == null ? "—" : fmt.sgn(p.r_now) + "R"}</span></div>
        <div className="text-muted">Max loss <span className="num text-ink">{fmt.usd(p.max_loss)}</span></div>
        <button className="btn btn-danger !h-8 !text-[12px]" onClick={() => api.post(`/api/flatten/${p.symbol}`)}>Close {p.symbol}</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Caption ribbon ─────────────────────────────── */
export function CaptionRibbon({ max = 4 }: { max?: number }) {
  const captions = useM((s) => s.captions);
  const partial = useM((s) => s.partial);
  const items = captions.slice(-max);
  return (
    <div className="w-full space-y-2" aria-live="polite" aria-label="Conversation captions">
      <AnimatePresence initial={false}>
        {items.map((c, i) => (
          <motion.div key={c.id + c.who} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: i === items.length - 1 ? 1 : 0.55, y: 0 }}
            className={clsx("flex gap-3 text-[14px] leading-relaxed", c.who === "you" && "justify-end")}>
            {c.who === "meridian" && <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan shadow-sm" />}
            <p className={clsx("max-w-[640px]", c.who === "you" ? "text-ink-2 italic text-right" : "text-ink")}>
              {c.who === "you" && <span className="label !text-[9.5px] mr-2 not-italic">you</span>}
              {c.text}
              {c.intent && c.who === "you" && <span className="ml-2 chip !h-5 !text-[10px] not-italic num text-violet">{c.intent}</span>}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
      {partial && <div className="text-center text-[13px] text-muted italic">{partial}</div>}
      {!items.length && <p className="text-center text-muted text-[14px]">Say <span className="text-ink">“Hey Meridian, scan for breakouts”</span>, hold
        <kbd className="mx-1.5 px-1.5 rounded border border-line-2 num text-[11px]">Space</kbd> to talk, or type below.</p>}
    </div>
  );
}

/* ─────────────────────────────── Command bar (type / push-to-talk / wake) ─────────────────────────────── */
export function CommandBar({ chips = true }: { chips?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [wake, setWake] = useState(false);
  const [holding, setHolding] = useState(false);
  const ticket = useM((s) => s.st?.ticket);
  const positions = useM((s) => s.st?.positions);
  const voice = useM((s) => s.voice);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = async (t: string) => {
    if (!t.trim()) return;
    speaker.ensure();
    setBusy(true); setText("");
    try { await api.chat(t); } catch (e: any) { useM.getState().toast({ tone: "bad", title: "Core unreachable", body: e.message }); }
    setBusy(false);
  };
  const pttDown = async () => { speaker.ensure(); if (await mic.start()) { setHolding(true); mic.pttDown(); } };
  const pttUp = () => { if (holding) { setHolding(false); mic.pttUp(); } };
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || (e.target as HTMLElement)?.closest("input,textarea,button,select")) return;
      e.preventDefault(); pttDown();
    };
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") pttUp(); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  });
  const toggleWake = async () => {
    speaker.ensure();
    if (!wake && !(await mic.start())) return;
    mic.setWake(!wake); setWake(!wake);
  };
  const suggestions = useMemo(() => {
    if (ticket) return [ticket.say, "What are the odds?", "Where's the stop?", "No"];
    if (positions?.length) return [`Why did you buy ${positions[0].symbol}?`, `Close ${positions[0].symbol}`, "How much have I risked today?", "Stop everything"];
    return ["Good morning", "Scan for breakouts", "Plan a trade on Infosys", "Any bulk deals?", "Backtest it against buy-and-hold", "What are my guardrails?"];
  }, [ticket, positions]);

  return (
    <div className="w-full space-y-3">
      {chips && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button key={s} className={clsx("chip", s === ticket?.say && "!border-mint/60 !text-mint bg-mint/10")} onClick={() => send(s)} disabled={busy}>
              {s === ticket?.say ? `“${s}”` : s}</button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2 panel !rounded-2xl p-1.5 pl-2">
        <button type="button" onPointerDown={pttDown} onPointerUp={pttUp} onPointerLeave={pttUp}
          className={clsx("relative h-10 w-10 shrink-0 rounded-xl grid place-items-center transition-all",
            holding || voice === "listening" ? "bg-cyan text-white shadow-sm" : "bg-ink/5 text-ink-2 hover:text-cyan")}
          aria-label="Hold to talk">
          {holding && <span className="absolute inset-0 rounded-xl animate-ping bg-cyan/40" />}
          <Mic size={18} className="relative" />
        </button>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-faint px-1"
          placeholder={ticket ? `Say or type “${ticket.say}” to place it…` : "Ask Meridian anything — “plan a trade on Reliance”"} aria-label="Command" />
        <button type="button" onClick={toggleWake} title="Always listening for “Hey Meridian” (local speech recognition)"
          className={clsx("chip !h-9", wake && "!text-cyan !border-cyan/60 bg-cyan/10")}>
          {wake ? <Radio size={14} /> : <MicOff size={14} />}<span className="hidden sm:inline">{wake ? "Wake on" : "Wake off"}</span></button>
        <button className="btn btn-primary !h-10 !w-10 !p-0" disabled={busy || !text.trim()} aria-label="Send"><SendHorizonal size={16} /></button>
      </form>
    </div>
  );
}
