"use client";
import { useRef } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LIFECYCLE, type Step } from "../data";
import { TONE, fadeUp, stagger } from "../ui";

function StepCard({ s }: { s: Step }) {
  const Icon = s.icon;
  const c = TONE[s.tone];
  return (
    <div className="lp-card flex h-full min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="lp-mono text-[12px] text-(--lp-muted)">{String(s.n).padStart(2, "0")}</span>
        <span className="lp-eyebrow truncate text-[10px]" style={{ color: c }}>{s.who}</span>
      </div>
      <span className="mt-4 grid h-9 w-9 place-items-center rounded-xl border border-(--lp-line-2)">
        <Icon size={17} style={{ color: c }} aria-hidden />
      </span>
      <p className="mt-3.5 text-[18px] font-semibold tracking-[-0.02em]">{s.name}</p>
      <p className="mt-1 text-pretty text-[13.5px] leading-relaxed text-(--lp-ink-2)">{s.body}</p>
    </div>
  );
}

/** Pipeline tab: the fifteen steps of a trade as a swipeable rail with a progress hairline. */
export default function PipelinePanel() {
  const track = useRef<HTMLOListElement>(null);
  const { scrollXProgress } = useScroll({ container: track });
  const fill = useSpring(scrollXProgress, { stiffness: 200, damping: 30 });

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-4">
        <div className="h-px min-w-0 flex-1 bg-(--lp-line)">
          <motion.div className="h-px origin-left bg-(--lp-ink)" style={{ scaleX: fill }} />
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => page(-1)} aria-label="Previous steps"
            className="grid h-9 w-9 place-items-center rounded-full border border-(--lp-line-2) bg-(--lp-surface) text-(--lp-ink) transition-colors hover:border-(--lp-muted)">
            <ArrowLeft size={15} aria-hidden />
          </button>
          <button type="button" onClick={() => page(1)} aria-label="Next steps"
            className="grid h-9 w-9 place-items-center rounded-full border border-(--lp-line-2) bg-(--lp-surface) text-(--lp-ink) transition-colors hover:border-(--lp-muted)">
            <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      </div>

      <motion.ol
        ref={track}
        initial="hidden"
        animate="show"
        variants={stagger(0.05)}
        tabIndex={0}
        aria-label="Fifteen steps of a trade"
        className="lp-snap-x -mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        {LIFECYCLE.map((s) => (
          <motion.li key={s.n} variants={fadeUp} className="flex w-[220px] shrink-0 snap-start sm:w-[240px]">
            <StepCard s={s} />
          </motion.li>
        ))}
      </motion.ol>
      <p className="mt-3 text-[12.5px] text-(--lp-muted)">Swipe or use the arrows. Every one of the fifteen steps lands on the record.</p>
    </div>
  );
}
