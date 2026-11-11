"use client";
import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { CalendarClock, FileDown, Landmark, Receipt } from "lucide-react";
import { useScrollRoot } from "./context";
import { EASE, SectionHeader } from "./ui";
import TimeMachineFan from "./TimeMachineFan";
import VideoFrame from "./VideoFrame";
import { VIDEOS } from "./videos";

/* Illustrative 60-session equity curves (rebased to 100). Endpoints are fixed; the wiggle vanishes at both ends. */
const N = 60;
function series(end: number, vol: number, f1: number, f2: number, ph: number) {
  return Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    const wiggle = (Math.sin(i * f1 + ph) * 0.6 + Math.sin(i * f2 + ph * 2) * 0.4) * vol * Math.sin(Math.PI * t);
    return 100 + (end - 100) * t + wiggle;
  });
}
const STRATEGY = series(101.2, 1.1, 0.41, 1.37, 0.3);
const BUYHOLD = series(102.9, 2.2, 0.29, 0.93, 1.7);
const NIFTY = series(102.1, 1.5, 0.33, 1.11, 2.4);

const W = 640, H = 300, PAD_L = 8, PAD_R = 8, PAD_T = 16, PAD_B = 24;
const ALL = [...STRATEGY, ...BUYHOLD, ...NIFTY];
const LO = Math.floor(Math.min(...ALL) - 0.5), HI = Math.ceil(Math.max(...ALL) + 0.5);
const X = (i: number) => PAD_L + (i / (N - 1)) * (W - PAD_L - PAD_R);
const Y = (v: number) => PAD_T + (1 - (v - LO) / (HI - LO)) * (H - PAD_T - PAD_B);
const path = (s: number[]) => s.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

const pct = (s: number[]) => {
  const r = s[s.length - 1] - 100;
  return `${r >= 0 ? "+" : ""}${r.toFixed(1)}%`;
};
const maxDD = (s: number[]) => {
  let peak = s[0], dd = 0;
  for (const v of s) { peak = Math.max(peak, v); dd = Math.min(dd, (v - peak) / peak); }
  return `${(dd * 100).toFixed(1)}%`;
};

const LINES = [
  { name: "Strategy (ORB, after charges)", s: STRATEGY, color: "var(--lp-cyan)", w: 2.4 },
  { name: "Buy and hold", s: BUYHOLD, color: "var(--lp-ink)", w: 1.4 },
  { name: "NIFTY 50", s: NIFTY, color: "var(--lp-faint)", w: 1.4, dash: "5 5" },
];

const CHARGES = ["Brokerage", "STT", "Exchange", "SEBI", "GST", "Stamp duty"];

export default function Backtest() {
  const container = useScrollRoot();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start 0.85", "end 0.55"] });
  const draw = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.6 });
  const verdict = useTransform(draw, [0.85, 1], [0, 1]);
  const verdictY = useTransform(draw, [0.85, 1], [10, 0]);

  return (
    <section id="backtest" aria-label="Backtest" className="lp-anchor lp-white relative border-t border-(--lp-line)">
      <div className="lp-wrap py-24 sm:py-32">
        <SectionHeader
          eyebrow="Backtest lab"
          title={<>Honest verdicts, <span className="text-(--lp-muted)">even when they sting.</span></>}
          lead="Every strategy is tested against buy-and-hold and NIFTY 50 over real NSE sessions, after Indian intraday charges. If there's no edge, Meridian says so, and you can export the whole report as a PDF."
        />

        <div ref={ref} className="mt-14 grid gap-6 lg:mt-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <figure className="lp-card min-w-0 p-5 sm:p-6">
            <figcaption className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[15px] font-semibold">Equity, 60 real NSE sessions</span>
              <span className="lp-mono text-[11px] text-(--lp-muted)">rebased to 100 · illustrative</span>
            </figcaption>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-(--lp-ink-2)">
              {LINES.map((l) => (
                <li key={l.name} className="flex items-center gap-2">
                  <svg width="18" height="6" aria-hidden><line x1="0" x2="18" y1="3" y2="3" stroke={l.color} strokeWidth={l.w} strokeDasharray={l.dash} /></svg>
                  {l.name}
                </li>
              ))}
            </ul>
            <div className="relative mt-4">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
                aria-label={`Strategy ${pct(STRATEGY)}, buy and hold ${pct(BUYHOLD)}, NIFTY 50 ${pct(NIFTY)} over 60 sessions`}>
                {Array.from({ length: HI - LO + 1 }, (_, k) => LO + k).map((v) => (
                  <g key={v}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={Y(v)} y2={Y(v)} stroke="var(--lp-line)" strokeWidth="1" />
                  </g>
                ))}
                <line x1={PAD_L} x2={W - PAD_R} y1={Y(100)} y2={Y(100)} stroke="var(--lp-line-2)" strokeWidth="1" />
                {[0, 20, 40, 59].map((i) => (
                  <text key={i} x={X(i)} y={H - 6} fontSize="11" fill="var(--lp-muted)" textAnchor={i === 0 ? "start" : i === 59 ? "end" : "middle"}
                    className="lp-mono">{i === 59 ? "S60" : `S${i + 1}`}</text>
                ))}
                {LINES.slice().reverse().map((l) => (
                  <motion.path key={l.name} d={path(l.s)} fill="none" stroke={l.color} strokeWidth={l.w} strokeDasharray={l.dash}
                    strokeLinejoin="round" strokeLinecap="round" style={{ pathLength: draw }} />
                ))}
              </svg>
              <motion.div
                style={{ opacity: verdict, y: verdictY }}
                className="absolute left-2 top-2 max-w-[78%] rounded-lg border border-(--lp-amber)/50 bg-(--lp-surface) px-3 py-2 shadow-(--lp-shadow) sm:left-4 sm:top-3"
              >
                <p className="lp-eyebrow text-[10px] text-(--lp-amber)">Honest verdict</p>
                <p className="mt-0.5 text-[14px] font-semibold leading-snug">No demonstrated edge</p>
              </motion.div>
            </div>
          </figure>

          <div className="flex min-w-0 flex-col gap-4">
            <dl className="lp-card grid grid-cols-2 overflow-hidden">
              {[
                ["Strategy", pct(STRATEGY), "var(--lp-cyan)"],
                ["Buy & hold", pct(BUYHOLD), "var(--lp-ink)"],
                ["NIFTY 50", pct(NIFTY), "var(--lp-ink-2)"],
                ["Strategy max DD", maxDD(STRATEGY), "var(--lp-coral)"],
              ].map(([k, v, c], i) => (
                <div key={k} className={`min-w-0 p-4 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""} border-(--lp-line)`}>
                  <dt className="text-[12.5px] text-(--lp-muted)">{k}</dt>
                  <dd className="lp-mono mt-1 text-[clamp(1.2rem,1rem+0.7vw,1.6rem)] font-semibold tracking-[-0.02em]" style={{ color: c }}>{v}</dd>
                </div>
              ))}
            </dl>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="lp-card p-5"
            >
              <p className="text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">
                <span className="font-semibold text-(--lp-ink)">“No demonstrated edge”</span> is a valid answer. Here the strategy
                made {pct(STRATEGY)} after charges but trailed simply holding ({pct(BUYHOLD)}). Meridian reports that plainly, instead of
                finding a flattering window.
              </p>
              <a href="/backtest" className="lp-btn lp-btn-ghost mt-4 h-9 px-3.5 text-[13px]">
                <FileDown size={14} aria-hidden /> Export report as PDF
              </a>
            </motion.div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <TimeMachineFan />
          <div className="min-w-0">
            <p className="lp-eyebrow">The benchmark</p>
            <h3 className="lp-h3 mt-3 text-balance">Measured against NIFTY 50, not against nothing.</h3>
            <p className="mt-3 text-pretty text-[14.5px] leading-relaxed text-(--lp-ink-2)">
              If a strategy can&apos;t beat simply holding the index, it isn&apos;t an edge. Here is where that index came from.
            </p>
            <VideoFrame video={VIDEOS.nifty50} size="sm" className="mt-6" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { icon: Receipt, h: "Indian charges, modelled", p: "Brokerage, STT, exchange, SEBI, GST and stamp duty on every simulated fill.", chips: CHARGES },
            { icon: CalendarClock, h: "Replay a real day", p: "Step through the real NSE session of 11 Nov 2026. Every bar is real, nothing is smoothed." },
            { icon: Landmark, h: "Kite-style broker mirror", p: "Positions and orders mirrored in a Zerodha Kite-style view, all on paper." },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.h}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, ease: EASE, delay: i * 0.07 }}
                className="min-w-0 rounded-xl border border-(--lp-line) bg-(--lp-surface) p-5"
              >
                <Icon size={17} className="text-(--lp-ink-2)" aria-hidden />
                <p className="mt-4 text-[15px] font-semibold">{f.h}</p>
                <p className="mt-1.5 text-pretty text-[13.5px] leading-relaxed text-(--lp-muted)">{f.p}</p>
                {f.chips && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {f.chips.map((c) => <li key={c} className="lp-pill text-[11.5px]">{c}</li>)}
                  </ul>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
