"use client";
import { useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { Hand, RotateCcw } from "lucide-react";

const R = 46;
const CIRC = 2 * Math.PI * R;

/** Press and hold for one second to halt the (demo) desk, just like the real kill switch. */
export default function HoldToHalt() {
  const fill = useMotionValue(0);
  const offset = useTransform(fill, (v) => CIRC * (1 - v));
  const ctl = useRef<AnimationPlaybackControls | null>(null);
  const [halted, setHalted] = useState(false);

  const begin = () => {
    if (halted) return;
    ctl.current?.stop();
    ctl.current = animate(fill, 1, {
      duration: 1 * (1 - fill.get()),
      ease: "linear",
      onComplete: () => setHalted(true),
    });
  };
  const cancel = () => {
    if (halted) return;
    ctl.current?.stop();
    ctl.current = animate(fill, 0, { duration: 0.25, ease: "easeOut" });
  };
  const reset = () => {
    setHalted(false);
    fill.set(0);
  };

  return (
    <div className="lp-card flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left">
      <button
        type="button"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); begin(); }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") cancel(); }}
        onContextMenu={(e) => e.preventDefault()}
        disabled={halted}
        aria-label={halted ? "Desk halted" : "Hold for one second to halt the demo desk"}
        className="relative grid h-28 w-28 shrink-0 touch-none select-none place-items-center rounded-full"
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--lp-line)" strokeWidth="5" />
          <motion.circle cx="50" cy="50" r={R} fill="none" stroke="var(--lp-coral)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={CIRC} style={{ strokeDashoffset: offset }} />
        </svg>
        <span
          className="grid h-[76%] w-[76%] place-items-center rounded-full border transition-colors duration-300"
          style={{
            borderColor: "color-mix(in srgb, var(--lp-coral) 45%, transparent)",
            background: halted ? "var(--lp-coral)" : "var(--lp-coral-soft)",
          }}
        >
          <Hand size={26} style={{ color: halted ? "var(--lp-surface)" : "var(--lp-coral)" }} aria-hidden />
        </span>
      </button>

      <div className="min-w-0" aria-live="polite">
        {halted ? (
          <>
            <p className="lp-mono text-[15px] font-semibold tracking-[0.06em] text-(--lp-coral)">HALTED · flat · locked</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-(--lp-ink-2)">
              Every position closed, every order cancelled, the desk locked until you re-arm it.
            </p>
            <button type="button" onClick={reset} className="lp-btn lp-btn-ghost mt-3 h-9 px-3.5 text-[13px]">
              <RotateCcw size={14} aria-hidden /> Re-arm demo
            </button>
          </>
        ) : (
          <>
            <p className="text-[15px] font-semibold">Try the kill switch</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-(--lp-ink-2)">
              Press and hold for one second. A tap won&apos;t do it, so it can&apos;t happen by accident. On the desk you can also
              say “stop everything” or press Esc twice.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
