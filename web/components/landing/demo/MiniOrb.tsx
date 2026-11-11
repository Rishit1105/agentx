"use client";
import clsx from "clsx";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "confirm" | "halted";

const COLOR: Record<OrbState, string> = {
  idle: "var(--lp-cyan)",
  listening: "var(--lp-cyan)",
  thinking: "var(--lp-violet)",
  speaking: "var(--lp-cyan)",
  confirm: "var(--lp-amber)",
  halted: "var(--lp-coral)",
};

/** A small, crisp rendition of the Conductor's orb for the product mocks. */
export default function MiniOrb({ state, size = 72, className }: { state: OrbState; size?: number; className?: string }) {
  const c = COLOR[state];
  const live = state === "listening" || state === "speaking";
  return (
    <span aria-hidden className={clsx("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <span
        className="absolute inset-0 rounded-full border transition-colors duration-500"
        style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}
      />
      {state === "thinking" && (
        <span className="lp-spin-slow absolute inset-[-3px] rounded-full border-2 border-transparent [animation-duration:1.6s]"
          style={{ borderTopColor: c }} />
      )}
      {live && <span className="lp-ping absolute inset-[18%] rounded-full border" style={{ borderColor: c }} />}
      <span
        className="absolute inset-[16%] rounded-full transition-[background] duration-500"
        style={{ background: `radial-gradient(circle at 50% 50%, color-mix(in srgb, ${c} 10%, transparent) 0 52%, color-mix(in srgb, ${c} 55%, transparent) 78%, transparent 80%)` }}
      />
      <span className="relative h-[16%] w-[16%] rounded-full transition-colors duration-500" style={{ background: c }} />
      <span className="absolute left-[12%] right-[12%] top-1/2 h-px -translate-y-1/2 opacity-60" style={{ background: c }} />
    </span>
  );
}
