"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic } from "lucide-react";
import { DIALOGUE } from "./data";
import { useReducedMotion } from "./context";
import { EASE, TONE } from "./ui";

type Phase = { line: number; who: "you" | "meridian"; chars: number };

/** A live caption that types the real demo dialogue, one turn at a time. */
export default function VoiceTicker() {
  const reduced = useReducedMotion();
  const [ph, setPh] = useState<Phase>({ line: 0, who: "you", chars: 0 });

  const text = ph.who === "you" ? DIALOGUE[ph.line].you : DIALOGUE[ph.line].meridian;
  const done = reduced || ph.chars >= text.length;

  useEffect(() => {
    const next = (): Phase =>
      ph.who === "you"
        ? { line: ph.line, who: "meridian", chars: 0 }
        : { line: (ph.line + 1) % DIALOGUE.length, who: "you", chars: 0 };
    if (reduced) {
      const id = setTimeout(() => setPh(next()), 3800);
      return () => clearTimeout(id);
    }
    if (!done) {
      const speed = ph.who === "you" ? 42 : 18;
      const id = setTimeout(() => setPh((p) => ({ ...p, chars: p.chars + 1 })), speed);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setPh(next()), ph.who === "you" ? 650 : 2200);
    return () => clearTimeout(id);
  }, [ph, done, reduced]);

  const you = ph.who === "you";
  const tone = you ? "var(--lp-ink-2)" : TONE[DIALOGUE[ph.line].tone];
  const shown = reduced ? text : text.slice(0, ph.chars);

  return (
    <div className="lp-card w-full max-w-xl p-4 sm:p-5" style={{ background: "color-mix(in srgb, var(--lp-surface) 88%, transparent)" }}>
      <div className="flex items-center gap-3">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-(--lp-line-2)">
          <Mic size={14} className="text-(--lp-cyan)" aria-hidden />
          {!reduced && you && !done && <span className="lp-ping absolute inset-0 rounded-full border border-(--lp-cyan)" aria-hidden />}
        </span>
        <span className="lp-eyebrow" style={{ color: you ? "var(--lp-muted)" : "var(--lp-cyan)" }}>
          {you ? "You said" : "Meridian"}
        </span>
        <span className="ml-auto flex h-4 items-center gap-[3px]" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="lp-wave-bar block w-[3px] rounded-full"
              style={{
                height: 14,
                background: you ? "var(--lp-ink-2)" : "var(--lp-cyan)",
                animationDelay: `${i * 0.12}s`,
                animationPlayState: done ? "paused" : "running",
                opacity: done ? 0.35 : 1,
              }}
            />
          ))}
        </span>
      </div>
      <p className="sr-only">
        Example dialogue: {DIALOGUE.map((d) => `You: ${d.you} Meridian: ${d.meridian}`).join(" ")}
      </p>
      <div className="mt-3 min-h-[4.5em] text-[15px] leading-[1.5] sm:text-base" aria-hidden>
        <AnimatePresence mode="wait">
          <motion.p
            key={`${ph.line}-${ph.who}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="text-pretty"
            style={{ color: you ? "var(--lp-ink)" : "var(--lp-ink-2)" }}
          >
            {you ? "“" : ""}
            {shown}
            {you && done ? "”" : ""}
            {!done && <span className="lp-caret" style={{ color: tone }} aria-hidden />}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
