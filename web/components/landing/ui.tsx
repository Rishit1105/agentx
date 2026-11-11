"use client";
import type { ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { useLaunch } from "./context";

export type Tone = "cyan" | "violet" | "mint" | "coral" | "amber";

export const TONE: Record<Tone, string> = {
  cyan: "var(--lp-cyan)",
  violet: "var(--lp-violet)",
  mint: "var(--lp-mint)",
  coral: "var(--lp-coral)",
  amber: "var(--lp-amber)",
};
export const TONE_SOFT: Record<Tone, string> = {
  cyan: "var(--lp-cyan-soft)",
  violet: "var(--lp-violet-soft)",
  mint: "var(--lp-mint-soft)",
  coral: "var(--lp-coral-soft)",
  amber: "var(--lp-amber-soft)",
};

export const EASE = [0.2, 0.7, 0.2, 1] as const;

export function OrbMark({ size = 22, className }: { size?: number; className?: string }) {
  return <span aria-hidden className={clsx("lp-orb-mark inline-block shrink-0", className)} style={{ width: size, height: size }} />;
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <OrbMark size={20} />
      <span className="display text-[15px] font-semibold tracking-[0.2em]">MERIDIAN</span>
    </span>
  );
}

export function SectionHeader({ eyebrow, title, lead, align = "left", className }: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, ease: EASE }}
      className={clsx("max-w-3xl", align === "center" && "mx-auto text-center", className)}
    >
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 className="lp-h2 mt-4 text-balance">{title}</h2>
      {lead && <p className="lp-lead mt-5 text-pretty">{lead}</p>}
    </motion.header>
  );
}

/** A link to /deck that plays the launch transition (modifier-clicks still open a new tab). */
export function LaunchLink({ children, className, ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  const launch = useLaunch();
  return (
    <a
      href="/deck"
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        launch();
      }}
    >
      {children}
    </a>
  );
}

export function Bubble({ who, children, tone = "cyan", className }: {
  who: "you" | "meridian";
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const you = who === "you";
  return (
    <div className={clsx("flex min-w-0", you ? "justify-end" : "justify-start", className)}>
      <div
        className={clsx("max-w-[88%] min-w-0 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-snug",
          you ? "rounded-br-md" : "rounded-bl-md")}
        style={{
          borderColor: you ? "var(--lp-line-2)" : `color-mix(in srgb, ${TONE[tone]} 35%, transparent)`,
          background: you ? "var(--lp-surface-2)" : TONE_SOFT[tone],
        }}
      >
        <span className="lp-eyebrow mb-1 block text-[10px]" style={{ color: you ? "var(--lp-muted)" : TONE[tone] }}>
          {you ? "You" : "Meridian"}
        </span>
        <span className="text-pretty text-(--lp-ink)">{children}</span>
      </div>
    </div>
  );
}
