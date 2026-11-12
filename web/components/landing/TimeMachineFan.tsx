"use client";
import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useScrollRoot } from "./context";

/*
 * The Time Machine, drawn small: 60 session paths fan out from the ETERNAL entry until each one meets
 * the target, the stop, or the flat-by time. Paths come from a seeded random walk, so the picture (and
 * the tallies beside it) are identical on the server and the client. Illustrative, not a forecast.
 */
const ENTRY = 370.75, TARGET = 375.93, STOP = 365.57;
const RUNS = 60, STEPS = 72; // 72 five-minute bars ≈ one session

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Run = { pts: number[]; end: "target" | "stop" | "time" };

const RUNS_DATA: Run[] = (() => {
  const rnd = mulberry32(20261111);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const out: Run[] = [];
  for (let r = 0; r < RUNS; r++) {
    const pts = [ENTRY];
    let end: Run["end"] = "time";
    for (let s = 1; s <= STEPS; s++) {
      let v = pts[s - 1] + gauss() * 0.62 + 0.012;
      if (v >= TARGET) { v = TARGET; end = "target"; }
      if (v <= STOP) { v = STOP; end = "stop"; }
      pts.push(v);
      if (end !== "time") break;
    }
    out.push({ pts, end });
  }
  return out;
})();

const TALLY = {
  target: RUNS_DATA.filter((r) => r.end === "target").length,
  stop: RUNS_DATA.filter((r) => r.end === "stop").length,
  time: RUNS_DATA.filter((r) => r.end === "time").length,
};

const W = 440, H = 250, L = 50, R = 8, T = 14, B = 24;
const LO = STOP - 1.6, HI = TARGET + 1.6;
const X = (i: number) => L + (i / STEPS) * (W - L - R);
const Y = (v: number) => T + (1 - (v - LO) / (HI - LO)) * (H - T - B);
const toPath = (pts: number[]) => pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
const PATHS = RUNS_DATA.map((r) => ({ d: toPath(r.pts), end: r.end }));

const COLOR = { target: "var(--lp-mint)", stop: "var(--lp-coral)", time: "var(--lp-faint)" };
const pct = (n: number) => `${Math.round((n / RUNS) * 100)}%`;

export default function TimeMachineFan() {
  const container = useScrollRoot();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start 0.9", "center 0.5"] });
  const draw = useSpring(scrollYProgress, { stiffness: 80, damping: 24, mass: 0.6 });
  const tally = useTransform(draw, [0.8, 1], [0, 1]);

  return (
    <figure ref={ref} className="lp-card h-full min-w-0 p-5 sm:p-6">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-semibold">Time Machine · before you take it</span>
        <span className="lp-mono text-[11px] text-(--lp-muted)">60 illustrative paths</span>
      </figcaption>
      <p className="mt-1.5 text-pretty text-[13.5px] leading-relaxed text-(--lp-ink-2)">
        Every plan is replayed forward many times before you are asked to approve it. On the desk that is 10,000 Monte-Carlo
        sessions plus 60 real ones; here are 60 paths from one ETERNAL entry.
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img"
        aria-label={`${RUNS} simulated paths from entry ${ENTRY}: ${TALLY.target} reach the target, ${TALLY.stop} hit the stop, ${TALLY.time} are flat by time.`}>
        {/* target and stop bands */}
        <rect x={L} y={T} width={W - L - R} height={Y(TARGET) - T} fill="var(--lp-mint-soft)" />
        <rect x={L} y={Y(STOP)} width={W - L - R} height={H - B - Y(STOP)} fill="var(--lp-coral-soft)" />
        <line x1={L} x2={W - R} y1={Y(TARGET)} y2={Y(TARGET)} stroke="var(--lp-mint)" strokeWidth="1" />
        <line x1={L} x2={W - R} y1={Y(STOP)} y2={Y(STOP)} stroke="var(--lp-coral)" strokeWidth="1" />
        <line x1={L} x2={W - R} y1={Y(ENTRY)} y2={Y(ENTRY)} stroke="var(--lp-line-2)" strokeWidth="1" strokeDasharray="3 4" />
        {[["Target", TARGET, "var(--lp-mint)"], ["Entry", ENTRY, "var(--lp-muted)"], ["Stop", STOP, "var(--lp-coral)"]].map(([k, v, c]) => (
          <g key={k as string}>
            <text x={L - 6} y={Y(v as number) - 2} fontSize="11" textAnchor="end" fill={c as string} className="lp-mono">{k as string}</text>
            <text x={L - 6} y={Y(v as number) + 11} fontSize="10.5" textAnchor="end" fill="var(--lp-muted)" className="lp-mono">{(v as number).toFixed(2)}</text>
          </g>
        ))}
        {["09:30", "12:30", "15:15"].map((t, i) => (
          <text key={t} x={X((i / 2) * STEPS)} y={H - 6} fontSize="11" fill="var(--lp-muted)" className="lp-mono"
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{t}</text>
        ))}

        {PATHS.map((p, i) => (
          <motion.path key={i} d={p.d} fill="none" stroke={COLOR[p.end]} strokeWidth="1" strokeOpacity={p.end === "time" ? 0.45 : 0.5}
            strokeLinejoin="round" style={{ pathLength: draw }} />
        ))}
        <circle cx={X(0)} cy={Y(ENTRY)} r="3.5" fill="var(--lp-surface)" stroke="var(--lp-ink)" strokeWidth="1.5" />
      </svg>

      <motion.dl style={{ opacity: tally }} className="mt-4 grid grid-cols-3 border-l border-t border-(--lp-line)">
        {([["Target first", TALLY.target, "target"], ["Stop first", TALLY.stop, "stop"], ["Flat by time", TALLY.time, "time"]] as const).map(([k, n, end]) => (
          <div key={k} className="min-w-0 border-b border-r border-(--lp-line) px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-[11.5px] leading-tight text-(--lp-muted)">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: COLOR[end] }} />
              <span className="min-w-0">{k}</span>
            </dt>
            <dd className="lp-mono mt-0.5 text-[17px] font-semibold">{pct(n)}</dd>
          </div>
        ))}
      </motion.dl>
    </figure>
  );
}
