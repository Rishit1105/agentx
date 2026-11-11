"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { ArrowRight, Check, Lock, Zap } from "lucide-react";
import { TEMPLATES } from "./data";
import { useReducedMotion } from "./context";
import { Bubble, EASE, SectionHeader } from "./ui";

const RULES = [
  { when: "Every 15 min", then: "Scan & watch top hit", said: "Every 15 minutes scan for breakouts and watch the best one." },
  { when: "Day P&L ≤ −₹5,000", then: "Halt & lock the desk", said: "If I'm down 5000, lock the desk." },
  { when: "09:20", then: "Opening-bell briefing", said: "Brief me every morning at 9:20." },
];

const spring = { type: "spring" as const, stiffness: 260, damping: 22 };

function RuleBuilder() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setI((v) => (v + 1) % RULES.length), 4200);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const r = RULES[i];
  return (
    <div ref={ref} className="lp-card overflow-hidden p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="lp-eyebrow">Rule builder</p>
        <p className="lp-mono text-[11px] text-(--lp-muted)">on the market clock</p>
      </div>

      <div className="mt-5 min-h-[4.5rem]">
        <AnimatePresence mode="wait">
          <motion.div key={i} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            <Bubble who="you">
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                “{r.said}”
              </motion.span>
            </Bubble>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mt-6 flex min-h-[120px] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-0">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`w-${i}`}
            initial={reduced ? false : { x: -60, opacity: 0, rotate: -4 }}
            animate={{ x: 0, opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ ...spring, delay: 0.5 }}
            className="min-w-0 flex-1 rounded-xl border border-(--lp-cyan)/50 bg-(--lp-cyan-soft) p-4"
          >
            <p className="lp-eyebrow text-[10px] text-(--lp-cyan)">When</p>
            <p className="mt-1 text-[16px] font-semibold tracking-[-0.01em]">{r.when}</p>
          </motion.div>
        </AnimatePresence>

        <motion.span
          key={`link-${i}`}
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 1.15 }}
          className="z-10 mx-auto grid h-9 w-9 shrink-0 rotate-90 place-items-center rounded-full border border-(--lp-line-2) bg-(--lp-bg) sm:-mx-2 sm:rotate-0"
          aria-hidden
        >
          <ArrowRight size={15} className="text-(--lp-ink-2)" />
        </motion.span>

        <AnimatePresence mode="popLayout">
          <motion.div
            key={`d-${i}`}
            initial={reduced ? false : { x: 60, opacity: 0, rotate: 4 }}
            animate={{ x: 0, opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, x: 30 }}
            transition={{ ...spring, delay: 0.8 }}
            className="min-w-0 flex-1 rounded-xl border border-(--lp-violet)/50 bg-(--lp-violet-soft) p-4"
          >
            <p className="lp-eyebrow text-[10px] text-(--lp-violet)">Do</p>
            <p className="mt-1 text-[16px] font-semibold tracking-[-0.01em]">{r.then}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <motion.span
          key={`armed-${i}`}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 1.5 }}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-(--lp-mint)"
        >
          <Check size={15} aria-hidden /> Rule armed
        </motion.span>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-(--lp-muted)">
          <Lock size={13} aria-hidden /> Cannot place orders
        </span>
        <span className="ml-auto flex gap-1.5" aria-hidden>
          {RULES.map((_, k) => (
            <span key={k} className="h-1 w-5 rounded-full transition-colors duration-300" style={{ background: k === i ? "var(--lp-cyan)" : "var(--lp-line-2)" }} />
          ))}
        </span>
      </div>
    </div>
  );
}

export default function Automations() {
  return (
    <section id="automations" aria-label="Automations" className="lp-anchor relative">
      <div className="lp-wrap py-24 sm:py-32">
        <SectionHeader
          eyebrow="New · Automations"
          title={<>“When this happens, <span className="text-(--lp-muted)">do that.</span>”</>}
          lead="Rules that run on the market clock: a time, every N minutes, a price cross, your day's P&L, the risk you've used, or fresh scan hits. Create them by voice. They brief you, scan, watch, plan, summarise, flatten or halt."
        />

        <div className="mt-14 grid gap-8 lg:mt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
          <RuleBuilder />

          <div className="flex min-w-0 flex-col justify-center gap-5">
            <div className="flex items-start gap-4 rounded-2xl border border-(--lp-amber)/40 bg-(--lp-amber-soft) p-5">
              <Lock size={18} className="mt-0.5 shrink-0 text-(--lp-amber)" aria-hidden />
              <div className="min-w-0">
                <p className="text-[16px] font-semibold">Automations can never place orders.</p>
                <p className="mt-1.5 text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">
                  The strongest thing a rule can do is prepare a plan. Buying still needs your spoken “yes”, with the exact quantity.
                </p>
              </div>
            </div>
            <div className="space-y-2.5">
              <Bubble who="you">If I&apos;m down 5000, lock the desk.</Bubble>
              <Bubble who="meridian">Armed: when today&apos;s P&amp;L reaches −₹5,000, I&apos;ll halt and lock the desk.</Bubble>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <p className="lp-eyebrow flex items-center gap-2"><Zap size={13} aria-hidden /> Templates</p>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((t, i) => {
              const Icon = t.icon;
              return (
                <motion.li
                  key={t.name}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.5, ease: EASE, delay: (i % 4) * 0.06 }}
                  className="min-w-0 rounded-2xl border border-(--lp-line) p-5 transition-colors duration-200 hover:border-(--lp-line-2)"
                >
                  <Icon size={17} className="text-(--lp-ink-2)" aria-hidden />
                  <p className="mt-4 text-[15px] font-semibold">{t.name}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="lp-pill border-(--lp-cyan)/40 text-(--lp-cyan)">{t.when}</span>
                    <ArrowRight size={12} className="text-(--lp-faint)" aria-hidden />
                    <span className="lp-pill border-(--lp-violet)/40 text-(--lp-violet)">{t.then}</span>
                  </p>
                </motion.li>
              );
            })}
            <li className="flex min-w-0 flex-col justify-center rounded-2xl border border-dashed border-(--lp-line-2) p-5">
              <p className="text-[15px] font-semibold">Or just say it.</p>
              <p className="mt-2 text-pretty text-[13.5px] leading-relaxed text-(--lp-muted)">
                “Every 15 minutes scan for breakouts and watch the best one.”
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
