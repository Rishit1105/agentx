"use client";
import { useEffect, useRef } from "react";
import { motion, useInView } from "motion/react";
import { SectionHeader } from "./ui";

/** A real screen recording of the desk (web/scripts/record-demo.mjs): no mock-ups, the actual product on the NSE replay. */
export default function ProductFilm() {
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { amount: 0.4 });

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (inView && !reduced) v.play().catch(() => {});
    else v.pause();
  }, [inView]);

  return (
    <section aria-label="The real desk, recorded" className="relative border-t border-(--lp-line) lp-white">
      <div className="lp-wrap py-20 sm:py-24">
        <SectionHeader
          eyebrow="Recorded, not rendered"
          title={<>The real desk, start to finish. <span className="text-(--lp-muted)">Scan, plan, yes, fill, halt.</span></>}
          lead="A straight screen recording of Meridian on the recorded NSE session of 11 November 2026: the briefing, a breakout scan, a planned trade with its risk gate, the spoken yes, the paper fill, the market map, automations and the kill switch."
        />
        <motion.div ref={wrap} initial={{ opacity: 0, scale: 0.96, y: 16 }} whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
          className="mt-10 overflow-hidden rounded-2xl border border-(--lp-line) bg-white shadow-[0_1px_2px_rgba(20,24,31,.06),0_24px_48px_-24px_rgba(20,24,31,.22)]">
          <div className="flex items-center gap-1.5 border-b border-(--lp-line) px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5484d]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#b7790b]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#0e9f6e]/70" />
            <span className="ml-3 truncate text-[12px] text-(--lp-muted)">localhost:3000/deck · Meridian · NSE replay · paper only</span>
          </div>
          <video ref={ref} className="block aspect-[16/10] w-full bg-[#f6f5f1]" src="/media/meridian-demo.webm"
            muted loop playsInline preload="metadata" controls aria-label="Screen recording of the Meridian desk" />
        </motion.div>
      </div>
    </section>
  );
}
