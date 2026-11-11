"use client";
import { useEffect, useRef } from "react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight, Lock, Mic } from "lucide-react";
import { useLaunch, useScrollRoot } from "./context";
import { LaunchLink, OrbMark } from "./ui";
import MiniOrb from "./demo/MiniOrb";
import OrreryMock from "./demo/OrreryMock";

/** The real Command Deck, framed in a browser window, at rest. */
function DeckWindow() {
  return (
    <div className="lp-paper flex h-full w-full flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-(--lp-line) bg-(--lp-surface-2) px-4">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-(--lp-line-2)" />
          <span className="h-2.5 w-2.5 rounded-full bg-(--lp-line-2)" />
          <span className="h-2.5 w-2.5 rounded-full bg-(--lp-line-2)" />
        </span>
        <span className="lp-mono mx-auto flex min-w-0 max-w-[60%] items-center gap-2 truncate rounded-md border border-(--lp-line) bg-(--lp-surface) px-3 py-1 text-[11px] text-(--lp-muted)">
          <Lock size={10} aria-hidden className="shrink-0" />
          <span className="truncate">localhost:3000/deck</span>
        </span>
        <span className="w-[46px]" aria-hidden />
      </div>

      <div className="flex h-11 shrink-0 items-center gap-4 border-b border-(--lp-line) bg-(--lp-surface) px-4 text-[12px] text-(--lp-muted)">
        <span className="flex items-center gap-2 text-(--lp-ink)"><OrbMark size={14} /><span className="lp-display text-[11px] font-semibold tracking-[0.12em]">MERIDIAN</span></span>
        <span className="hidden font-medium text-(--lp-ink) sm:inline">Command Deck</span>
        <span className="hidden md:inline">Trade Studio</span>
        <span className="hidden md:inline">Backtest Lab</span>
        <span className="hidden lg:inline">Ledger</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-(--lp-line-2) px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-(--lp-ink-2)">
          <span className="h-1.5 w-1.5 rounded-full bg-(--lp-mint)" /> Paper
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,0.8fr)] sm:p-4">
        <div className="hidden min-h-0 flex-col items-center justify-center rounded-xl border border-(--lp-line) bg-(--lp-surface) p-4 sm:flex">
          <MiniOrb state="listening" size={96} />
          <p className="lp-eyebrow mt-4 text-[10px] text-(--lp-cyan)">Listening</p>
          <p className="mt-1 text-center text-[12px] text-(--lp-muted)">Say “Hey Meridian”</p>
        </div>
        <div className="flex min-h-0 items-center justify-center rounded-xl border border-(--lp-line) bg-(--lp-surface) p-2">
          <OrreryMock active={["scanner", "risk", "sentinel"]} labels={false} className="h-full max-h-full w-full" />
        </div>
        <div className="hidden min-h-0 flex-col gap-3 rounded-xl border border-(--lp-line) bg-(--lp-surface) p-4 md:flex">
          <div>
            <p className="lp-eyebrow text-[10px]">Paper balance</p>
            <p className="lp-mono mt-1 text-[clamp(1rem,0.8rem+0.8vw,1.4rem)] font-semibold text-(--lp-ink)">₹5,00,000</p>
          </div>
          <p className="lp-eyebrow text-[10px]">Risk reservoir</p>
          <div className="flex min-h-0 flex-1 items-end gap-3">
            <div className="relative h-full min-h-[60px] w-10 overflow-hidden rounded-lg border border-(--lp-line-2)">
              <div className="absolute inset-x-0 bottom-0 h-[78%] bg-(--lp-cyan-soft)" />
              <div className="absolute inset-x-0 bottom-[78%] h-px bg-(--lp-cyan)" />
            </div>
            <div className="min-w-0 space-y-1 text-[11px] text-(--lp-muted)">
              <p><span className="lp-mono text-(--lp-ink)">₹7,500</span> day limit</p>
              <p><span className="lp-mono text-(--lp-ink)">₹2,500</span> per trade</p>
              <p><span className="lp-mono text-(--lp-ink)">0 / 3</span> trades</p>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="flex h-11 items-center gap-3 rounded-[10px] border border-(--lp-line-2) bg-(--lp-surface) px-4 text-[13px] text-(--lp-muted)">
          <Mic size={15} className="shrink-0 text-(--lp-cyan)" aria-hidden />
          <span className="truncate">Ask Meridian, or hold space to talk…</span>
        </div>
      </div>
    </div>
  );
}

/** The last scene: the framed desk grows until it is the desk, then hands you to /deck. */
export default function Finale() {
  const container = useScrollRoot();
  const launch = useLaunch();
  const ref = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const fill = useMotionValue(1.6);
  const fired = useRef(false);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth || 1, h = el.offsetHeight || 1;
      const vw = container.current?.clientWidth ?? window.innerWidth;
      fill.set(Math.max(vw / w, window.innerHeight / h) * 1.02);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [container, fill]);

  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 });

  const scale = useTransform(() => {
    const v = Math.min(1, Math.max(0, (p.get() - 0.12) / 0.8));
    const e = v * v * (3 - 2 * v);
    return 0.86 + (fill.get() - 0.86) * e;
  });
  const y = useTransform(p, [0.12, 0.92], ["14vh", "0vh"]);
  const radius = useTransform(p, [0.6, 0.92], [18, 0]);
  const copyOpacity = useTransform(p, [0.08, 0.32], [1, 0]);
  const copyY = useTransform(p, [0.08, 0.32], [0, -40]);
  const hintOpacity = useTransform(p, [0.78, 0.92], [0, 1]);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v >= 0.985 && !fired.current) {
      fired.current = true;
      launch();
    }
    if (v < 0.9) fired.current = false;
  });

  return (
    <section ref={ref} aria-label="Open the Command Deck" className="relative h-[300vh] border-t border-(--lp-line)">
      <div className="sticky top-0 h-dvh overflow-hidden">
        <motion.div style={{ opacity: copyOpacity, y: copyY }} className="lp-wrap relative z-10 pt-24 text-center sm:pt-28">
          <p className="lp-eyebrow">The desk is listening</p>
          <h2 className="lp-h2 mx-auto mt-4 max-w-3xl text-balance">Say it. Check it. Then trust it.</h2>
          <div className="mt-6 flex justify-center">
            <LaunchLink className="lp-btn lp-btn-primary h-12 px-6 text-[15px]">
              Launch the desk <ArrowRight size={16} aria-hidden />
            </LaunchLink>
          </div>
        </motion.div>

        <div className="absolute inset-0 grid place-items-center">
          <motion.div
            ref={frame}
            style={{ scale, y, borderRadius: radius }}
            className="h-[min(600px,50dvh)] w-[min(1080px,calc(100%-32px))] overflow-hidden border border-(--lp-line-2) shadow-[0_1px_2px_rgba(20,24,31,0.06),0_40px_80px_-40px_rgba(20,24,31,0.3)] will-change-transform"
          >
            <DeckWindow />
          </motion.div>
        </div>

        <motion.p
          style={{ opacity: hintOpacity }}
          className="lp-eyebrow pointer-events-none absolute inset-x-0 bottom-8 text-center text-(--lp-ink-2)"
          aria-hidden
        >
          Opening the desk…
        </motion.p>
      </div>
    </section>
  );
}
