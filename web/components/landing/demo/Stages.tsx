"use client";
import { motion } from "motion/react";
import { Check, FileText, Mic, ShieldCheck } from "lucide-react";
import { EASE } from "../ui";
import OrreryMock from "./OrreryMock";

const rise = (i = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE, delay: 0.08 + i * 0.07 },
});

/** A soft highlight that marks the one thing the viewer should look at in a scene. */
function Spot({ children, tone = "var(--lp-cyan)", className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <motion.div
      className={`relative rounded-xl ${className}`}
      initial={{ boxShadow: `0 0 0 0px transparent` }}
      animate={{ boxShadow: `0 0 0 2px color-mix(in srgb, ${tone} 55%, transparent)` }}
      transition={{ duration: 0.5, delay: 0.35 }}
    >
      {children}
    </motion.div>
  );
}

/* 0 ─ You speak */
export function SpeakStage() {
  return (
    <div className="grid h-full place-items-center p-4 text-center">
      <div className="min-w-0">
        <motion.div {...rise(0)} className="mx-auto flex h-12 items-center justify-center gap-[5px]" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="lp-wave-bar block w-[4px] rounded-full bg-(--lp-cyan)"
              style={{ height: 12 + ((i * 7) % 5) * 7, animationDelay: `${(i % 7) * 0.09}s` }}
            />
          ))}
        </motion.div>
        <motion.p {...rise(1)} className="lp-eyebrow mt-5 text-(--lp-cyan)">Listening</motion.p>
        <motion.p {...rise(2)} className="mt-3 text-balance text-[clamp(1.25rem,1rem+1.6vw,2.1rem)] font-semibold leading-tight tracking-[-0.03em]">
          “Hey Meridian, scan for breakouts.”
        </motion.p>
        <motion.p {...rise(3)} className="mt-3 text-[13px] text-(--lp-muted)">
          Wake word heard · transcribed on-device · routed to the Conductor
        </motion.p>
      </div>
    </div>
  );
}

/* 1 ─ Agents light up */
export function AgentsStage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 items-center gap-4 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] sm:p-5">
      <div className="mx-auto h-full max-h-[300px] min-h-0 w-full max-w-[340px] sm:max-h-[380px]">
        <OrreryMock active={["scanner", "news", "analyst", "strategist"]} className="h-full w-full" />
      </div>
      <ul className="hidden min-w-0 space-y-2 sm:block">
        {[
          ["Conductor", "route: scan · ORB 15m · NIFTY 500", "var(--lp-cyan)"],
          ["Scanner", "sweeping 497 symbols", "var(--lp-violet)"],
          ["News", "reading 12 fresh headlines", "var(--lp-violet)"],
          ["Analyst", "loading quarterly results (₹ cr)", "var(--lp-violet)"],
          ["Strategist", "standing by for a hit", "var(--lp-amber)"],
        ].map(([who, what, col], i) => (
          <motion.li key={who} {...rise(i)} className="flex min-w-0 items-start gap-2.5 rounded-lg border border-(--lp-line) px-3 py-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />
            <span className="min-w-0 text-[12.5px] leading-snug">
              <span className="font-semibold text-(--lp-ink)">{who}</span>{" "}
              <span className="text-(--lp-muted)">{what}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* 2 ─ Scan results */
const HITS = [
  { s: "SUNTV", chg: "+2.41%", vol: "3.2×", q: 0.92, best: true },
  { s: "ETERNAL", chg: "+1.86%", vol: "2.7×", q: 0.84 },
  { s: "BEL", chg: "+1.52%", vol: "2.1×", q: 0.77 },
  { s: "TATAPOWER", chg: "+1.37%", vol: "1.9×", q: 0.71 },
  { s: "IRFC", chg: "+1.21%", vol: "2.4×", q: 0.66 },
];
export function ScanStage() {
  return (
    <div className="flex h-full min-h-0 flex-col p-3 sm:p-5">
      <motion.div {...rise(0)} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[clamp(1.05rem,0.9rem+0.8vw,1.5rem)] font-semibold tracking-[-0.02em]">
          <span className="lp-mono text-(--lp-cyan)">130</span> of <span className="lp-mono">497</span> above the 15-min range
        </p>
        <p className="lp-eyebrow">Scanner · ORB 15m</p>
      </motion.div>
      <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-(--lp-line)">
        <div className="lp-eyebrow grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1fr)] gap-2 border-b border-(--lp-line) px-3 py-2 text-[10px]">
          <span>Symbol</span><span className="text-right">Chg</span><span className="text-right">Vol</span><span className="text-right">Clean</span>
        </div>
        {HITS.map((h, i) => (
          <motion.div
            key={h.s}
            {...rise(i + 1)}
            className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1fr)] items-center gap-2 border-b border-(--lp-line) px-3 py-2 text-[12.5px] last:border-b-0"
            style={h.best ? { background: "var(--lp-cyan-soft)" } : undefined}
          >
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <span className="truncate">{h.s}</span>
              {h.best && <span className="lp-mono hidden shrink-0 rounded-full border border-(--lp-cyan) px-1.5 text-[9.5px] text-(--lp-cyan) sm:inline">cleanest</span>}
            </span>
            <span className="lp-mono text-right text-(--lp-mint)">{h.chg}</span>
            <span className="lp-mono text-right text-(--lp-ink-2)">{h.vol}</span>
            <span className="flex items-center justify-end gap-2">
              <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-(--lp-line) sm:block">
                <motion.span
                  className="block h-full rounded-full bg-(--lp-cyan)"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: h.q }}
                  style={{ transformOrigin: "0 50%" }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.07 }}
                />
              </span>
              <span className="lp-mono text-(--lp-ink-2)">{h.q.toFixed(2)}</span>
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* 3 ─ Trade ticket */
const LEVELS = [
  { k: "Entry", v: "370.75", tone: "var(--lp-ink)" },
  { k: "Stop", v: "365.57", tone: "var(--lp-coral)" },
  { k: "Target", v: "375.93", tone: "var(--lp-mint)" },
  { k: "Qty", v: "482", tone: "var(--lp-ink)" },
];

function MiniChart() {
  // a stylised opening-range breakout: deterministic bars, levels to scale
  const bars = [368.2, 368.9, 368.4, 369.3, 368.8, 369.6, 369.1, 369.9, 370.2, 370.9, 371.6, 371.2];
  const lo = 364.5, hi = 377;
  const y = (v: number) => 120 - ((v - lo) / (hi - lo)) * 110;
  return (
    <svg viewBox="0 0 220 124" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <rect x="0" y={y(370.2)} width="96" height={y(368.0) - y(370.2)} fill="var(--lp-line)" opacity={0.6} />
      {[["375.93", "var(--lp-mint)"], ["370.75", "var(--lp-ink-2)"], ["365.57", "var(--lp-coral)"]].map(([v, c]) => (
        <line key={v} x1="0" x2="220" y1={y(+v)} y2={y(+v)} stroke={c} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      ))}
      {bars.map((c, i) => {
        const o = i === 0 ? 367.9 : bars[i - 1];
        const up = c >= o;
        const x = 8 + i * 17;
        return (
          <motion.g key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.04 }}>
            <line x1={x + 4} x2={x + 4} y1={y(Math.max(o, c) + 0.35)} y2={y(Math.min(o, c) - 0.35)} stroke={up ? "var(--lp-mint)" : "var(--lp-coral)"} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <rect x={x} width="8" y={y(Math.max(o, c))} height={Math.max(1.5, Math.abs(y(o) - y(c)))} fill={up ? "var(--lp-mint)" : "var(--lp-coral)"} />
          </motion.g>
        );
      })}
    </svg>
  );
}

export function TicketStage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex min-h-0 min-w-0 flex-col">
        <motion.div {...rise(0)} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[clamp(1.1rem,0.9rem+0.9vw,1.6rem)] font-semibold tracking-[-0.02em]">BUY ETERNAL</span>
          <span className="text-[12.5px] text-(--lp-muted)">Zomato · opening-range breakout</span>
        </motion.div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map((l, i) => (
            <motion.div key={l.k} {...rise(i + 1)} className="min-w-0 rounded-lg border border-(--lp-line) px-3 py-2">
              <p className="lp-eyebrow text-[9.5px]">{l.k}</p>
              <p className="lp-mono mt-1 text-[15px] font-semibold" style={{ color: l.tone }}>{l.v}</p>
            </motion.div>
          ))}
        </div>
        <motion.div {...rise(5)} className="mt-3 rounded-lg border border-(--lp-line) px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
            <span className="text-(--lp-muted)">Risk at stop</span>
            <span className="lp-mono"><span className="text-(--lp-amber)">₹2,496.76</span> <span className="text-(--lp-muted)">/ ₹2,500</span></span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--lp-line)">
            <motion.div className="h-full rounded-full bg-(--lp-amber)" initial={{ scaleX: 0 }} animate={{ scaleX: 0.9987 }}
              style={{ transformOrigin: "0 50%" }} transition={{ duration: 0.8, delay: 0.5, ease: EASE }} />
          </div>
        </motion.div>
        <Spot tone="var(--lp-mint)" className="mt-3">
          <motion.div {...rise(6)} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-(--lp-mint)/40 bg-(--lp-mint-soft) px-3 py-2.5">
            <ShieldCheck size={16} className="text-(--lp-mint)" aria-hidden />
            <span className="text-[13px] font-semibold text-(--lp-mint)">Risk gate · PASS</span>
            <span className="lp-mono ml-auto text-[11px] text-(--lp-muted)">verdict rk_9f3a…c1</span>
          </motion.div>
        </Spot>
      </div>
      <motion.div {...rise(3)} className="hidden min-h-0 min-w-0 flex-col rounded-xl border border-(--lp-line) p-3 lg:flex">
        <div className="flex items-center justify-between">
          <span className="lp-eyebrow text-[10px]">ETERNAL · 5m</span>
          <span className="lp-mono text-[10.5px] text-(--lp-muted)">1R : 1R</span>
        </div>
        <div className="mt-2 min-h-0 flex-1"><MiniChart /></div>
      </motion.div>
    </div>
  );
}

/* 4 ─ Your yes */
export function ApproveStage() {
  return (
    <div className="grid h-full place-items-center p-4 text-center">
      <div className="w-full max-w-md min-w-0">
        <motion.p {...rise(0)} className="lp-eyebrow text-(--lp-amber)">Awaiting your voice</motion.p>
        <motion.p {...rise(1)} className="mt-3 text-balance text-[15px] leading-relaxed text-(--lp-ink-2)">
          Say <span className="font-semibold text-(--lp-ink)">“yes, buy 482 ETERNAL”</span> to place this paper order.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.55 }}
          className="mx-auto mt-6 inline-flex max-w-full items-center gap-3 rounded-2xl border border-(--lp-line-2) bg-(--lp-surface-2) px-4 py-3 text-left"
        >
          <Mic size={16} className="shrink-0 text-(--lp-cyan)" aria-hidden />
          <span className="min-w-0 text-[clamp(1rem,0.9rem+0.6vw,1.3rem)] font-semibold tracking-[-0.02em]">“Yes, buy 482 ETERNAL.”</span>
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="mt-4 inline-flex items-center gap-2 text-[13px] text-(--lp-mint)"
        >
          <Check size={15} aria-hidden /> Confirmed by voice · exact quantity matched
        </motion.p>
        <motion.p {...rise(8)} className="mt-2 text-[12px] text-(--lp-muted)">
          The language model has no order-placing tool. Only your confirmation reaches the exchange.
        </motion.p>
      </div>
    </div>
  );
}

/* 5 ─ Fill + Story */
function N({ children }: { children: React.ReactNode }) {
  return <span className="lp-mono rounded bg-(--lp-cyan-soft) px-1 text-(--lp-ink)">{children}</span>;
}
export function FillStage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-3 sm:p-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <motion.div {...rise(0)} className="min-w-0 rounded-xl border border-(--lp-line) p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="lp-eyebrow text-[10px] text-(--lp-mint)">Paper fill</span>
          <span className="lp-mono rounded-full border border-(--lp-line-2) px-2 text-[10px] text-(--lp-muted)">SIMULATED</span>
        </div>
        <p className="mt-2 text-[clamp(1rem,0.9rem+0.6vw,1.35rem)] font-semibold tracking-[-0.02em]">
          BUY 482 ETERNAL <span className="lp-mono text-(--lp-ink-2)">@ 370.80</span>
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          <dt className="text-(--lp-muted)">Stop · target</dt><dd className="lp-mono text-right">365.57 · 375.93</dd>
          <dt className="text-(--lp-muted)">Charges est.</dt><dd className="lp-mono text-right">≈ ₹110</dd>
          <dt className="text-(--lp-muted)">Trades today</dt><dd className="lp-mono text-right">1 / 3</dd>
        </dl>
      </motion.div>
      <Spot className="min-h-0 min-w-0">
        <motion.div {...rise(2)} className="h-full rounded-xl border border-(--lp-line) bg-(--lp-surface-2) p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-(--lp-cyan)" aria-hidden />
            <span className="lp-eyebrow text-[10px] text-(--lp-cyan)">The Story</span>
          </div>
          <p className="mt-2 text-pretty text-[13px] leading-relaxed text-(--lp-ink-2)">
            ETERNAL broke above its 15-minute opening range at <N>370.75</N> on <N>2.7×</N> normal volume.
            I bought <N>482</N> shares with a stop at <N>365.57</N>, risking <N>₹2,496.76</N>, just under your <N>₹2,500</N> cap.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-(--lp-mint)">
            <Check size={13} aria-hidden /> 6 of 6 numbers matched to tool evidence
          </p>
        </motion.div>
      </Spot>
    </div>
  );
}
