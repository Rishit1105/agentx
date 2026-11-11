"use client";
import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { LAYERS, LIMITS } from "./data";
import { useScrollRoot } from "./context";
import { Bubble, SectionHeader, TONE, TONE_SOFT } from "./ui";
import HoldToHalt from "./HoldToHalt";

const GAP = 12;

function LayerCard({ i, p, layer }: { i: number; p: MotionValue<number>; layer: (typeof LAYERS)[number] }) {
  // stacked (p=0): every card slides up under L0 with depth; fanned (p=1): a clean vertical stack
  const transform = useTransform(p, (v) => {
    const k = 1 - v;
    return `translateY(calc(${-k * i * 100}% - ${k * i * (GAP - 10)}px)) scale(${1 - k * i * 0.045}) rotateX(${k * 14}deg)`;
  });
  const opacity = useTransform(p, [0, 1], [1 - i * 0.12, 1]);
  const Icon = layer.icon;
  const c = TONE[layer.tone];
  return (
    <motion.li
      style={{ transform, opacity, zIndex: LAYERS.length - i, transformOrigin: "50% 0%" }}
      className="lp-card relative flex min-w-0 items-start gap-4 p-5 will-change-transform"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: TONE_SOFT[layer.tone] }}>
        <Icon size={18} style={{ color: c }} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="lp-mono text-[12px] font-semibold" style={{ color: c }}>{layer.id}</span>
          <span className="text-[16px] font-semibold tracking-[-0.01em]">{layer.name}</span>
        </p>
        <p className="mt-1.5 text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">{layer.body}</p>
      </div>
    </motion.li>
  );
}

export default function Safety() {
  const container = useScrollRoot();
  const stackRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ container, target: stackRef, offset: ["start 0.95", "center 0.55"] });
  const p = useSpring(scrollYProgress, { stiffness: 110, damping: 26, mass: 0.5 });

  return (
    <section id="safety" aria-label="Safety" className="lp-anchor lp-light lp-cool relative border-y border-(--lp-line)">
      <div className="lp-wrap py-24 sm:py-32">
        <SectionHeader
          eyebrow="Five defence layers"
          title={<>Built so the worst case is <span className="text-(--lp-coral)">boring</span>.</>}
          lead="A voice desk has to be safer than a click desk, not just faster. Every order passes five independent layers, and the strictest one always wins."
        />

        <div className="mt-14 grid gap-12 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <ol ref={stackRef} className="relative min-w-0 space-y-3 [perspective:1400px]" aria-label="Defence layers L0 to L4">
            {LAYERS.map((l, i) => <LayerCard key={l.id} i={i} p={p} layer={l} />)}
          </ol>

          <div className="min-w-0 space-y-6">
            <div>
              <p className="lp-eyebrow">Your limits</p>
              <dl className="mt-3 grid grid-cols-2 border-l border-t border-(--lp-line)">
                {LIMITS.map((l) => (
                  <div key={l.label} className="min-w-0 border-b border-r border-(--lp-line) p-4">
                    <dt className="text-[12.5px] text-(--lp-muted)">{l.label}</dt>
                    <dd className="lp-mono mt-1 text-[clamp(1.15rem,1rem+0.6vw,1.5rem)] font-semibold tracking-[-0.02em]">{l.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <HoldToHalt />

            <div className="lp-card p-5">
              <p className="lp-eyebrow">Voice can tighten. Never loosen.</p>
              <div className="mt-4 space-y-2.5">
                <Bubble who="you">Raise my daily loss limit to ₹15,000.</Bubble>
                <Bubble who="meridian" tone="coral">
                  I can&apos;t do that. Voice can tighten your limits, never loosen them. Your daily loss limit stays at ₹7,500.
                </Bubble>
                <Bubble who="you">Then tighten it to ₹5,000.</Bubble>
                <Bubble who="meridian" tone="mint">Done. Daily loss limit is now ₹5,000 for today.</Bubble>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
