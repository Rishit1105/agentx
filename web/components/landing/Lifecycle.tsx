"use client";
import { useEffect, useRef } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { LIFECYCLE, type Step } from "./data";
import { useScrollRoot } from "./context";
import { EASE, SectionHeader, TONE } from "./ui";

function StepCard({ s, wide }: { s: Step; wide?: boolean }) {
  const Icon = s.icon;
  const c = TONE[s.tone];
  return (
    <div className={`lp-card flex h-full min-w-0 flex-col p-5 ${wide ? "w-[300px] shrink-0" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="lp-mono text-[12px] text-(--lp-muted)">{String(s.n).padStart(2, "0")}</span>
        <span className="lp-eyebrow truncate text-[10px]" style={{ color: c }}>{s.who}</span>
      </div>
      <span className="mt-5 grid h-10 w-10 place-items-center rounded-xl border border-(--lp-line-2)">
        <Icon size={18} style={{ color: c }} aria-hidden />
      </span>
      <p className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">{s.name}</p>
      <p className="mt-1.5 text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">{s.body}</p>
    </div>
  );
}

/** Desktop: a pinned rail that slides sideways as you scroll down. */
function Rail() {
  const container = useScrollRoot();
  const section = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const dist = useMotionValue(0);

  useEffect(() => {
    const t = track.current, s = section.current;
    if (!t || !s) return;
    const measure = () => {
      const d = Math.max(0, t.scrollWidth - s.clientWidth);
      dist.set(d);
      s.style.height = `calc(100dvh + ${d}px)`;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [dist]);

  const { scrollYProgress } = useScroll({ container, target: section, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 });
  const x = useTransform(() => -p.get() * dist.get());
  const fill = useTransform(p, [0, 1], [0.04, 1]);

  return (
    <div ref={section} className="relative hidden lg:block" style={{ height: "300vh" }}>
      <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden pt-16">
        <div className="lp-wrap">
          <SectionHeader
            eyebrow="How it works"
            title={<>Fifteen steps. <span className="text-(--lp-muted)">Every one on the record.</span></>}
          />
          <div className="mt-8 h-px w-full bg-(--lp-line)">
            <motion.div className="h-px origin-left bg-(--lp-ink)" style={{ scaleX: fill }} />
          </div>
        </div>
        <motion.ol ref={track} style={{ x }} className="mt-10 flex w-max gap-4 pl-[max(32px,calc((100vw-1200px)/2+32px))] pr-8 will-change-transform">
          {LIFECYCLE.map((s) => (
            <li key={s.n} className="flex">
              <StepCard s={s} wide />
            </li>
          ))}
        </motion.ol>
      </div>
    </div>
  );
}

/** Phones and tablets: a calm vertical timeline. */
function Timeline() {
  return (
    <div className="lp-wrap py-24 sm:py-28 lg:hidden">
      <SectionHeader
        eyebrow="How it works"
        title={<>Fifteen steps. <span className="text-(--lp-muted)">Every one on the record.</span></>}
      />
      <ol className="relative mt-12 space-y-4 border-l border-(--lp-line) pl-5 sm:pl-8">
        {LIFECYCLE.map((s) => (
          <motion.li
            key={s.n}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="relative"
          >
            <span
              aria-hidden
              className="absolute -left-[25px] top-6 h-2.5 w-2.5 rounded-full border-2 border-(--lp-bg) sm:-left-[37px]"
              style={{ background: TONE[s.tone] }}
            />
            <StepCard s={s} />
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export default function Lifecycle() {
  return (
    <section id="how" aria-label="How it works" className="lp-anchor lp-soft relative border-t border-(--lp-line)">
      <Rail />
      <Timeline />
    </section>
  );
}
