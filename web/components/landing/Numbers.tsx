"use client";
import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { CountUp, Parallax, Scene, fadeUp, stagger } from "./ui";
import Tape from "./Tape";
import Odometer from "./money/Odometer";
import RubberStamp from "./money/RubberStamp";
import { NOTE_BAND_BOTTOM, NOTE_BAND_TOP, NOTE_KNOT, NOTE_ROSETTE, NOTE_ROSETTE_INNER } from "./money/engraving";

const STATS = [
  { value: 16, suffix: "", label: "agents under one Conductor", note: "11 skills · 5 native services" },
  { value: 5, suffix: "", label: "defence layers on every order", note: "L0 paper-only → L4 kill switch" },
  { value: 497, suffix: "", label: "NSE stocks per sweep", note: "the tradable NIFTY 500" },
  { value: 60, suffix: "", label: "real sessions backtested", note: "after Indian intraday charges" },
  { value: 10000, suffix: "", label: "Monte-Carlo replays", note: "before you are asked to approve" },
  { value: 100, suffix: "%", label: "of trades explained", note: "a Story for every trade and halt" },
];

const LIMITS = [
  ["Per trade", "₹2,500"],
  ["Daily limit", "₹7,500"],
  ["Trades a day", "3"],
];

/** The paper balance as a banknote of its own: engraved, watermarked and very clearly not real. */
function BalanceNote() {
  const ref = useRef<HTMLDivElement>(null);
  const play = useInView(ref, { once: true, amount: 0.6 });

  return (
    <div ref={ref} className="relative pb-6 sm:pb-4">
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -1.5 }}
        whileInView={{ opacity: 1, y: 0, rotate: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ type: "spring", stiffness: 80, damping: 16 }}
        className="relative overflow-hidden rounded-[14px] border border-(--lp-line-2) shadow-(--lp-shadow-lg)"
        style={{ background: "color-mix(in srgb, #0e9f6e 5%, #fbfaf7)" }}
      >
        {/* engraving: woven bands top and bottom, a rosette and the orb watermark on the right */}
        <svg viewBox="0 0 320 150" preserveAspectRatio="xMaxYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
          <rect x={6} y={6} width={308} height={138} rx={6} fill="none" stroke="#0e9f6e" strokeOpacity={0.45} strokeWidth={0.6} />
          <g fill="none" stroke="#0e9f6e" strokeLinejoin="round">
            {[-118, 0].map((dx) =>
              NOTE_BAND_TOP.map((d, i) => (
                <path key={`${dx}-${i}`} d={d} transform={`translate(${dx} -6)`} strokeWidth={0.35} strokeOpacity={0.35} />
              )),
            )}
            {NOTE_BAND_BOTTOM.map((d, i) => <path key={i} d={d} transform="translate(0 10)" strokeWidth={0.35} strokeOpacity={0.3} />)}
            <g transform="translate(176 0)">
              {NOTE_ROSETTE.map((d, i) => <path key={i} d={d} strokeWidth={0.4} strokeOpacity={0.4} />)}
              {NOTE_ROSETTE_INNER.map((d, i) => <path key={i} d={d} strokeWidth={0.35} strokeOpacity={0.32} />)}
              <path d={NOTE_KNOT} strokeWidth={0.4} strokeOpacity={0.45} />
            </g>
          </g>
          <g transform="translate(254 75)" opacity={0.85}>
            <circle r={16} fill="#0a7ea4" fillOpacity={0.05} stroke="#14181f" strokeOpacity={0.14} strokeWidth={0.5} />
            <ellipse rx={16} ry={5} fill="none" stroke="#14181f" strokeOpacity={0.1} strokeWidth={0.4} />
            <ellipse rx={16} ry={10} fill="none" stroke="#14181f" strokeOpacity={0.1} strokeWidth={0.4} />
            <circle r={4} fill="#0a7ea4" fillOpacity={0.18} />
          </g>
        </svg>

        <div className="relative p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="lp-eyebrow text-(--lp-ink-2)">Meridian paper reserve</p>
            <p className="lp-mono text-[11px] text-(--lp-mint)">MRD 000 500 00</p>
          </div>
          <p className="mt-6 text-[12.5px] text-(--lp-muted)">Paper balance</p>
          <p className="mt-1 text-[clamp(2.1rem,1.4rem+3vw,3.5rem)] font-semibold leading-none tracking-[-0.04em]">
            <Odometer value="₹5,00,000.00" play={play} spins={2} duration={1800} stagger={90} />
          </p>
          <p className="mt-3 max-w-[30ch] text-pretty text-[13px] italic leading-snug text-(--lp-ink-2)">
            Promises to pay the bearer exactly nothing. Reset it whenever you like.
          </p>
          <dl className="mt-6 flex flex-wrap gap-2">
            {LIMITS.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2 rounded-md border border-(--lp-line-2) bg-(--lp-surface)/80 px-2.5 py-1 text-[12px]">
                <dt className="text-(--lp-muted)">{k}</dt>
                <dd className="lp-mono font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </motion.div>

      <RubberStamp className="absolute -bottom-1 right-3 w-[132px] sm:-bottom-3 sm:right-6 sm:w-[168px]" />
    </div>
  );
}

/** The tape, the paper balance and the headline numbers, in one short band. */
export default function Numbers() {
  return (
    <>
      <Tape />
      <Scene id="numbers" label="Meridian in numbers" className="lp-white"
        innerClassName="lp-wrap grid items-center gap-10 py-12 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <Parallax distance={18}>
          <BalanceNote />
        </Parallax>

        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <p className="lp-eyebrow">By the numbers</p>
            <p className="max-w-sm text-[13.5px] leading-relaxed text-(--lp-muted)">An educational prototype of a careful, explainable desk.</p>
          </div>
          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            variants={stagger(0.06)}
            className="mt-5 grid grid-cols-2 border-l border-t border-(--lp-line) sm:grid-cols-3"
          >
            {STATS.map((s) => (
              <motion.li key={s.label} variants={fadeUp} className="min-w-0 border-b border-r border-(--lp-line) p-4 sm:p-5">
                <div className="text-[clamp(1.7rem,1.3rem+1.4vw,2.5rem)] font-semibold leading-none tracking-[-0.04em]">
                  <CountUp to={s.value} suffix={s.suffix} />
                </div>
                <p className="mt-2.5 text-[13.5px] font-medium leading-snug">{s.label}</p>
                <p className="mt-1 text-[12px] leading-snug text-(--lp-muted)">{s.note}</p>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </Scene>
    </>
  );
}
