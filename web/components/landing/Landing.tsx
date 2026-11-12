"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { LaunchCtx, ScrollCtx, useReducedMotion } from "./context";
import { OrbMark } from "./ui";
import Nav from "./Nav";
import Hero from "./Hero";
import DemoReel from "./DemoReel";
import ProductFilm from "./ProductFilm";
import Numbers from "./Numbers";
import Problem from "./Problem";
import HowItWorks from "./HowItWorks";
import Guardrails from "./Guardrails";
import Backtest from "./Backtest";
import FinePrint from "./FinePrint";
import Finale from "./Finale";

/** Storyboard, about eight screens: the hero zooms into the orb → the demo reel → the real recording → the money
 *  → the problem → how it works → guardrails → backtest → a final zoom straight into /deck. Each section zooms in
 *  with depth as it arrives. One light theme: bands alternate between paper, white and soft, divided by hairlines. */
export default function Landing() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const reduced = useReducedMotion();
  const [launching, setLaunching] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    router.prefetch("/deck");
  }, [router]);

  const launch = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setLaunching(true);
    setTimeout(() => router.push("/deck"), reduced ? 0 : 620);
  }, [router, reduced]);

  return (
    <MotionConfig reducedMotion="user">
    <ScrollCtx.Provider value={scrollRef}>
      <LaunchCtx.Provider value={launch}>
        <Nav />
        <motion.div
          ref={scrollRef}
          animate={launching && !reduced ? { scale: 1.08, opacity: 0 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.7, 0, 0.84, 0] }}
          className="lp-root h-dvh overflow-y-auto overflow-x-hidden"
        >
          <main>
            <Hero />
            <DemoReel />
            <ProductFilm />
            <Numbers />
            <Problem />
            <HowItWorks />
            <Guardrails />
            <Backtest />
          </main>
          <FinePrint />
          <Finale />
        </motion.div>

        <AnimatePresence>
          {launching && (
            <motion.div
              key="launch"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.45, ease: "easeOut" }}
              className="lp-paper fixed inset-0 z-[100] grid place-items-center"
              role="status"
              aria-label="Opening the Command Deck"
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1], delay: 0.08 }}
                className="flex flex-col items-center gap-4"
              >
                <OrbMark size={44} />
                <span className="lp-eyebrow">Opening the desk</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </LaunchCtx.Provider>
    </ScrollCtx.Provider>
    </MotionConfig>
  );
}
