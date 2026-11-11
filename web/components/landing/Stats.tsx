"use client";
import { useEffect, useRef } from "react";
import { animate, motion, useInView } from "motion/react";
import { useReducedMotion } from "./context";
import { EASE } from "./ui";

const STATS = [
  { value: 16, prefix: "", suffix: "", label: "agents under one Conductor", note: "11 skills · 5 native services" },
  { value: 5, prefix: "", suffix: "", label: "defence layers on every order", note: "L0 paper-only → L4 kill switch" },
  { value: 497, prefix: "", suffix: "", label: "NSE stocks scanned per sweep", note: "the tradable NIFTY 500" },
  { value: 60, prefix: "", suffix: "", label: "real sessions backtested", note: "plus 10,000 Monte-Carlo runs" },
  { value: 0, prefix: "₹", suffix: "", label: "real money, ever", note: "paper-only, asserted at boot" },
  { value: 100, prefix: "", suffix: "%", label: "of trades explained", note: "a Story for every trade, skip and halt" },
];

function Count({ to, prefix, suffix }: { to: number; prefix: string; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduced || to === 0) {
      el.textContent = `${prefix}${to}${suffix}`;
      return;
    }
    const c = animate(0, to, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = `${prefix}${Math.round(v)}${suffix}`),
    });
    return () => c.stop();
  }, [inView, to, prefix, suffix, reduced]);

  return (
    <span ref={ref} className="lp-mono">
      {prefix}
      {to}
      {suffix}
    </span>
  );
}

export default function Stats() {
  return (
    <section aria-label="Meridian in numbers" className="lp-light relative border-y border-(--lp-line)">
      <div className="lp-wrap py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="lp-eyebrow">By the numbers</p>
          <p className="max-w-md text-[14px] leading-relaxed text-(--lp-muted)">
            An educational prototype built to show what a careful, explainable trading desk looks like.
          </p>
        </div>
        <ul className="mt-8 grid grid-cols-2 border-l border-t border-(--lp-line) md:grid-cols-3 xl:grid-cols-6">
          {STATS.map((s, i) => (
            <motion.li
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.06 }}
              className="min-w-0 border-b border-r border-(--lp-line) p-4 sm:p-6"
            >
              <div className="text-[clamp(2.2rem,1.6rem+2.2vw,3.4rem)] font-semibold leading-none tracking-[-0.04em] text-(--lp-ink)">
                <Count to={s.value} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <p className="mt-3 text-[14px] font-medium leading-snug text-(--lp-ink)">{s.label}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-(--lp-muted)">{s.note}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
