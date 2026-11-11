"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { useScrollRoot } from "./context";
import { EASE } from "./ui";
import DeckMock, { SCENES } from "./demo/DeckMock";

const CAPTIONS = [
  { h: "You speak.", p: "“Hey Meridian, scan for breakouts.” The Conductor hears you. No clicks, no forms." },
  { h: "Sixteen agents wake.", p: "The Conductor routes the request. Scanner, News, Analyst and Strategist light up on the Orrery." },
  { h: "The scan comes back.", p: "130 of 497 stocks closed above their 15-minute opening range. SUNTV is the cleanest." },
  { h: "A plan, sized and gated.", p: "Stop and target first. 482 shares so the stop costs ₹2,496.76, under ₹2,500. Risk gate: PASS." },
  { h: "Nothing moves without your “yes”.", p: "The model has no order tool. The trade waits for your spoken confirmation of the exact quantity." },
  { h: "Filled on paper. Explained in English.", p: "A simulated fill with Indian charges, and a Story whose every number is checked against evidence." },
];

/** A scroll-scrubbed product film: the Command Deck zooms in, then plays one beat per scroll step. */
export default function DemoReel() {
  const container = useScrollRoot();
  const ref = useRef<HTMLElement>(null);
  const [scene, setScene] = useState(0);

  // the approach: the deck tilts up out of the hero's zoom and settles flat
  const { scrollYProgress: enter } = useScroll({ container, target: ref, offset: ["start end", "start start"] });
  const e = useSpring(enter, { stiffness: 120, damping: 28, mass: 0.5 });
  const rotateX = useTransform(e, [0, 1], [32, 0]);
  const scaleIn = useTransform(e, [0, 1], [0.72, 1]);
  const z = useTransform(e, [0, 1], [-220, 0]);
  const fade = useTransform(e, [0, 0.5], [0, 1]);

  // the film: pinned, one scene per step
  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 });
  const push = useTransform(p, [0, 0.12, 1], [1, 1.035, 1.035]);
  const bar = useTransform(p, [0.04, 0.96], [0, 1]);
  useMotionValueEvent(p, "change", (v) => {
    const next = Math.min(SCENES.length - 1, Math.max(0, Math.floor(((v - 0.04) / 0.92) * SCENES.length)));
    setScene((cur) => (cur === next ? cur : next));
  });

  return (
    <section id="demo" ref={ref} aria-label="Watch Meridian work" className="lp-anchor lp-soft relative h-[520vh] border-t border-(--lp-line) md:h-[560vh]">
      <div className="sticky top-0 flex h-dvh flex-col overflow-hidden pb-4 pt-[76px] sm:pb-6">
        <div className="lp-wrap flex shrink-0 flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
          <div className="min-w-0 md:max-w-[640px]">
            <p className="lp-eyebrow flex items-center gap-3">
              <span className="lp-mono text-(--lp-cyan)">0{scene + 1}</span>
              <span className="h-px w-6 bg-(--lp-line-2)" />
              Watch it work
            </p>
            <div className="relative mt-2 min-h-[4.6rem] sm:min-h-[4.2rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={scene}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <h2 className="lp-display text-balance text-[clamp(1.3rem,1rem+1.4vw,2.2rem)] leading-tight">
                    {CAPTIONS[scene].h}
                  </h2>
                  <p className="mt-1 hidden text-pretty text-[14.5px] leading-relaxed text-(--lp-ink-2) sm:block">{CAPTIONS[scene].p}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <ol className="hidden shrink-0 items-center gap-1.5 lg:flex" aria-label="Scenes">
            {SCENES.map((sc, i) => (
              <li
                key={sc.title}
                aria-current={i === scene ? "step" : undefined}
                className="rounded-md border px-2.5 py-1 text-[11.5px] transition-colors duration-300"
                style={{
                  borderColor: i === scene ? "var(--lp-ink)" : "var(--lp-line)",
                  background: i === scene ? "var(--lp-surface)" : "transparent",
                  color: i === scene ? "var(--lp-ink)" : i < scene ? "var(--lp-ink-2)" : "var(--lp-faint)",
                }}
              >
                {sc.title}
              </li>
            ))}
          </ol>
        </div>

        <div className="lp-wrap mt-3 h-0.5 shrink-0 sm:mt-4">
          <div className="h-full overflow-hidden rounded-full bg-(--lp-line)">
            <motion.div className="h-full origin-left bg-(--lp-ink)" style={{ scaleX: bar }} />
          </div>
        </div>

        <div className="lp-wrap mt-4 min-h-0 flex-1 [perspective:1600px] sm:mt-5">
          <motion.div
            style={{ rotateX, scale: scaleIn, z, opacity: fade, transformOrigin: "50% 0%" }}
            className="mx-auto h-full max-h-[720px] w-full max-w-[1180px] will-change-transform"
          >
            <motion.div style={{ scale: push }} className="h-full w-full">
              <DeckMock scene={scene} />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
