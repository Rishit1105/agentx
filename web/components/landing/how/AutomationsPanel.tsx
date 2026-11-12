"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { ArrowRight, Check, Lock } from "lucide-react";
import { TEMPLATES } from "../data";
import { useReducedMotion } from "../context";
import { Bubble, fadeUp, stagger } from "../ui";

const RULES = [
  { when: "Every 15 min", then: "Scan & watch top hit", said: "Every 15 minutes scan for breakouts and watch the best one." },
  { when: "Day P&L ≤ −₹5,000", then: "Halt & lock the desk", said: "If I'm down 5000, lock the desk." },
  { when: "09:20", then: "Opening-bell briefing", said: "Brief me every morning at 9:20." },
];

const spring = { type: "spring" as const, stiffness: 260, damping: 22 };

/** A spoken rule assembling itself into a "when → do" pair, cycling through three examples. */
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
    <div ref={ref} className="lp-card overflow-hidden p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="lp-eyebrow">Rule builder</p>
        <p className="lp-mono text-[11px] text-(--lp-muted)">on the market clock</p>
      </div>

      <div className="mt-4 min-h-[4.5rem]">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <Bubble who="you">“{r.said}”</Bubble>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mt-4 flex min-h-[110px] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-0">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`w-${i}`}
            initial={{ x: -60, opacity: 0, rotate: -4 }}
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
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 1.15 }}
          className="z-10 mx-auto grid h-9 w-9 shrink-0 rotate-90 place-items-center rounded-full border border-(--lp-line-2) bg-(--lp-surface) sm:-mx-2 sm:rotate-0"
          aria-hidden
        >
          <ArrowRight size={15} className="text-(--lp-ink-2)" />
        </motion.span>

        <AnimatePresence mode="popLayout">
          <motion.div
            key={`d-${i}`}
            initial={{ x: 60, opacity: 0, rotate: 4 }}
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

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <motion.span
          key={`armed-${i}`}
          initial={{ opacity: 0, y: 6 }}
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

/** Automations tab: the rule builder, the one thing rules can never do, and the ready-made templates. */
export default function AutomationsPanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
      <RuleBuilder />

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-start gap-4 rounded-xl border border-(--lp-amber)/40 bg-(--lp-amber-soft) p-4 sm:p-5">
          <Lock size={18} className="mt-0.5 shrink-0 text-(--lp-amber)" aria-hidden />
          <div className="min-w-0">
            <p className="text-[15.5px] font-semibold">Automations can never place orders.</p>
            <p className="mt-1 text-pretty text-[13.5px] leading-relaxed text-(--lp-ink-2)">
              The strongest thing a rule can do is prepare a plan. Buying still needs your spoken “yes”, with the exact quantity.
            </p>
          </div>
        </div>

        <div>
          <p className="lp-eyebrow text-[10.5px]">Templates</p>
          <motion.ul initial="hidden" animate="show" variants={stagger(0.04, 0.15)} className="mt-2.5 grid gap-1.5">
            {TEMPLATES.slice(0, 6).map((t) => {
              const Icon = t.icon;
              return (
                <motion.li key={t.name} variants={fadeUp}
                  className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-(--lp-line) bg-(--lp-surface) px-3 py-2 text-[12.5px]">
                  <Icon size={14} className="shrink-0 text-(--lp-ink-2)" aria-hidden />
                  <span className="mr-auto font-medium text-(--lp-ink)">{t.name}</span>
                  <span className="lp-mono text-(--lp-cyan)">{t.when}</span>
                  <ArrowRight size={11} className="text-(--lp-faint)" aria-hidden />
                  <span className="text-(--lp-violet)">{t.then}</span>
                </motion.li>
              );
            })}
          </motion.ul>
        </div>
      </div>
    </div>
  );
}
