"use client";
import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "motion/react";
import { Check, ShieldAlert } from "lucide-react";
import { useReducedMotion } from "./context";
import { EASE } from "./ui";

/* The same ETERNAL plan the desk speaks in the demo: entry 370.75, stop 365.57. */
const ENTRY = 370.75;
const STOP = 365.57;
const PER_SHARE = ENTRY - STOP; // ₹5.18 at risk per share
const LIMITS = [
  { key: "trade", label: "Max loss per trade", cap: 2500, of: (q: number) => q * PER_SHARE },
  { key: "day", label: "Daily loss limit", cap: 7500, of: (q: number) => q * PER_SHARE },
  { key: "budget", label: "Paper budget", cap: 500000, of: (q: number) => q * ENTRY },
];
const MAX_QTY = 900;
const SAFE_QTY = Math.floor(LIMITS[0].cap / PER_SHARE); // 482
const PRESETS = [250, SAFE_QTY, 600];
const SCALE = 1.5; // the dial reads 0..150% of the per-trade cap

const inr = (v: number) => `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inr0 = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

/* a 240° arc, open at the bottom */
const CX = 100, CY = 100, R = 78, START = 150, SWEEP = 240;
const polar = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
};
const arc = (from: number, to: number) => {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
};
const TRACK = arc(START, START + SWEEP);
const CAP_DEG = START + SWEEP / SCALE;
const [CAP_X1, CAP_Y1] = polar(CAP_DEG);

/** Drag the position size and watch the risk gate decide, exactly as the desk does. */
export default function RiskDial() {
  const id = useId();
  const reduced = useReducedMotion();
  const [qty, setQty] = useState(SAFE_QTY);

  const rows = LIMITS.map((l) => ({ ...l, used: l.of(qty) / l.cap }));
  const binding = rows.reduce((a, b) => (b.used > a.used ? b : a));
  const loss = qty * PER_SHARE;
  const pass = binding.used <= 1;
  const tone = !pass ? "var(--lp-coral)" : binding.used > 0.85 ? "var(--lp-amber)" : "var(--lp-mint)";

  const frac = useSpring(0, { stiffness: 170, damping: 26 });
  useEffect(() => {
    const v = Math.min(1, loss / (LIMITS[0].cap * SCALE));
    if (reduced) frac.jump(v);
    else frac.set(v);
  }, [loss, reduced, frac]);
  const needle = useTransform(frac, (v) => START + 90 + v * SWEEP);

  return (
    <div className="lp-card min-w-0 p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="lp-eyebrow">Try the risk gate</p>
        <p className="lp-mono text-[11.5px] text-(--lp-muted)">ETERNAL · entry 370.75 · stop 365.57</p>
      </div>

      <div className="mt-6 grid items-center gap-6 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-8">
        {/* the dial */}
        <div className="mx-auto w-full max-w-[220px]">
          <svg viewBox="0 0 200 150" className="h-auto w-full" aria-hidden>
            <path d={TRACK} fill="none" stroke="var(--lp-line)" strokeWidth="10" strokeLinecap="round" />
            <motion.path d={TRACK} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
              className="transition-[stroke] duration-300" style={{ pathLength: frac }} />
            {/* the cap: 100% of the per-trade limit */}
            <line x1={CAP_X1} y1={CAP_Y1} x2={CX + (CAP_X1 - CX) * 1.2} y2={CY + (CAP_Y1 - CY) * 1.2}
              stroke="var(--lp-ink)" strokeWidth="1.5" />
            <text x={CX + (CAP_X1 - CX) * 1.31} y={CY + (CAP_Y1 - CY) * 1.31 + 3} fontSize="9" textAnchor="middle"
              fill="var(--lp-muted)" className="lp-mono">cap</text>
            {/* the needle; the invisible circle centres its box on the pivot */}
            <motion.g style={{ rotate: needle }}>
              <circle cx={CX} cy={CY} r={R - 14} fill="none" />
              <line x1={CX} y1={CY} x2={CX} y2={CY - (R - 18)} stroke="var(--lp-ink)" strokeWidth="1.5" strokeLinecap="round" />
            </motion.g>
            <circle cx={CX} cy={CY} r="4" fill="var(--lp-surface)" stroke="var(--lp-ink)" strokeWidth="1.5" />
          </svg>
          <div className="-mt-1 text-center">
            <p className="lp-mono text-[20px] font-semibold tracking-[-0.02em]" style={{ color: tone }}>{inr(loss)}</p>
            <p className="text-[11.5px] text-(--lp-muted)">max loss at stop</p>
          </div>
        </div>

        {/* the controls and the verdict */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={id} className="text-[14px] font-medium">Position size</label>
            <span className="lp-mono text-[15px] font-semibold">{qty} sh</span>
          </div>
          <input
            id={id}
            type="range"
            min={0}
            max={MAX_QTY}
            step={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            aria-valuetext={`${qty} shares, max loss ${inr(loss)}, ${pass ? "passes" : "blocked"}`}
            className="lp-range mt-3 w-full"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setQty(p)}
                aria-pressed={qty === p}
                className="lp-mono rounded-md border px-2.5 py-1 text-[12px] transition-colors"
                style={{
                  borderColor: qty === p ? "var(--lp-ink)" : "var(--lp-line-2)",
                  background: qty === p ? "var(--lp-surface-2)" : "var(--lp-surface)",
                }}
              >
                {p}{p === SAFE_QTY ? " · max" : ""}
              </button>
            ))}
          </div>

          <dl className="mt-5 space-y-2.5">
            {rows.map((r) => {
              const isBinding = r.key === binding.key;
              return (
                <div key={r.key}>
                  <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <dt className={isBinding ? "font-medium text-(--lp-ink)" : "text-(--lp-muted)"}>
                      {r.label}
                      {isBinding && <span className="ml-2 rounded bg-(--lp-surface-2) px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-(--lp-ink-2)">binding</span>}
                    </dt>
                    <dd className="lp-mono shrink-0 text-(--lp-ink-2)">{Math.round(r.used * 100)}%</dd>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-(--lp-line)">
                    <div
                      className="h-full origin-left rounded-full transition-[transform,background-color] duration-300"
                      style={{
                        transform: `scaleX(${Math.min(1, r.used)})`,
                        background: isBinding ? tone : "var(--lp-faint)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </dl>
        </div>
      </div>

      <div className="mt-6 min-h-[64px] border-t border-(--lp-line) pt-5 [perspective:600px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pass ? "pass" : "block"}
            initial={reduced ? false : { rotateX: -80, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={reduced ? undefined : { rotateX: 80, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="flex items-start gap-3"
            style={{ transformOrigin: "50% 50%" }}
          >
            <span
              className="lp-mono inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold"
              style={{ color: pass ? "var(--lp-mint)" : "var(--lp-coral)", background: pass ? "var(--lp-mint-soft)" : "var(--lp-coral-soft)" }}
            >
              {pass ? <Check size={13} aria-hidden /> : <ShieldAlert size={13} aria-hidden />}
              {pass ? "PASS" : "BLOCK"}
            </span>
            <p className="min-w-0 text-pretty text-[13.5px] leading-relaxed text-(--lp-ink-2)">
              {pass ? (
                <>{qty} shares risk {inr0(loss)}, inside your {inr0(LIMITS[0].cap)} per-trade cap. The verdict is fingerprinted to this exact order.</>
              ) : (
                <>
                  {qty} shares would risk {inr0(loss)}, over your {inr0(binding.cap)} {binding.label.toLowerCase()}.{" "}
                  <button type="button" onClick={() => setQty(SAFE_QTY)} className="font-medium text-(--lp-ink) underline decoration-(--lp-line-2) underline-offset-4 hover:decoration-(--lp-ink)">
                    Size it to {SAFE_QTY} shares
                  </button>
                </>
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
