"use client";
import { useEffect, useRef } from "react";
import { motion, useInView } from "motion/react";
import { EASE, Parallax, Scene, fadeUp, scaleIn, splitWords, stagger } from "./ui";
import PaperRibbon from "./money/PaperRibbon";

const BEATS = ["Briefing", "Scan", "Plan", "Risk gate", "Your yes", "Paper fill", "Kill switch"];

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
    <Scene id="film" label="The real desk, recorded" className="lp-white"
      innerClassName="lp-wrap grid items-center gap-8 py-12 sm:py-14 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-12">
      <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} variants={stagger(0.08)} className="min-w-0">
        <motion.p variants={fadeUp} className="lp-eyebrow">Recorded, not rendered</motion.p>
        <motion.h2 variants={stagger(0.045)} className="lp-h2 mt-3 text-balance sm:mt-4">
          {splitWords(<>The real desk, <span className="text-(--lp-muted)">start to finish.</span></>)}
        </motion.h2>
        <motion.p variants={fadeUp} className="lp-lead mt-4 text-pretty">
          A straight screen recording of Meridian on the recorded NSE session of 11 November 2026. No mock-ups, no edits.
        </motion.p>
        <motion.ol variants={stagger(0.05, 0.1)} className="mt-6 flex flex-wrap gap-1.5" aria-label="What the recording shows">
          {BEATS.map((b, i) => (
            <motion.li key={b} variants={fadeUp} className="lp-pill">
              <span className="lp-mono text-[10.5px] text-(--lp-faint)">{String(i + 1).padStart(2, "0")}</span>
              {b}
            </motion.li>
          ))}
        </motion.ol>
      </motion.div>

      <Parallax distance={24} className="min-w-0">
        <motion.div
          ref={wrap}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          variants={scaleIn}
          transition={{ duration: 0.8, ease: EASE }}
          className="relative overflow-hidden rounded-2xl border border-(--lp-line) bg-white shadow-(--lp-shadow-lg)"
        >
          <PaperRibbon />
          <div className="flex items-center gap-1.5 border-b border-(--lp-line) px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5484d]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#b7790b]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#0e9f6e]/70" />
            <span className="ml-3 truncate pr-14 text-[12px] text-(--lp-muted)">localhost:3000/deck · NSE replay · paper only</span>
          </div>
          <video
            ref={ref}
            className="block aspect-[16/10] w-full bg-[#f6f5f1]"
            src="/media/meridian-demo.webm"
            muted
            loop
            playsInline
            preload="metadata"
            controls
            aria-label="Screen recording of the Meridian desk"
          />
        </motion.div>
      </Parallax>
    </Scene>
  );
}
