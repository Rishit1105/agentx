"use client";
import { Fragment, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight, Play } from "lucide-react";
import { useReducedMotion, useScrollRoot } from "./context";
import { EASE, LaunchLink } from "./ui";
import VoiceTicker from "./VoiceTicker";
import FloatingNotes from "./money/FloatingNotes";
import Odometer from "./money/Odometer";
import PaperRibbon from "./money/PaperRibbon";

// three.js is only fetched on the client, after the page is interactive
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

const LINES = [["Speak", "the", "market."], ["Trust", "every", "trade."]];
const BALANCE = "₹5,00,000.00";

/** The paper balance, rolling up like an odometer the moment the page opens. */
function BalanceCard() {
  const ref = useRef<HTMLDivElement>(null);
  const play = useInView(ref, { once: true });
  return (
    <div ref={ref} className="lp-card relative w-[min(300px,100%)] overflow-hidden p-4 pr-10">
      <PaperRibbon label="Paper" />
      <p className="lp-eyebrow text-[10.5px]">Paper balance</p>
      <p className="mt-1.5 text-[clamp(1.5rem,1.2rem+0.9vw,1.9rem)] font-semibold tracking-[-0.03em]">
        <Odometer value={BALANCE} play={play} spins={2} duration={1700} stagger={80} />
      </p>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-(--lp-line) pt-2.5 text-[12px]">
        <span className="text-(--lp-muted)">Real money at risk</span>
        <span className="lp-mono font-semibold text-(--lp-coral)">₹0.00</span>
      </div>
    </div>
  );
}

/** The opening: the Conductor orb with paper notes drifting around it, the headline and the paper balance. */
export default function Hero() {
  const container = useScrollRoot();
  const ref = useRef<HTMLElement>(null);
  const chipRef = useRef<HTMLParagraphElement>(null);
  const chipPlay = useInView(chipRef, { once: true });
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);

  // 0 at the top, 1 once the hero has scrolled fully away. The first ~third is pinned: the camera dollies
  // into the orb, the copy zooms past and the notes rise at their own depths; then the scene dissolves.
  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start start", "end start"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 });

  const dolly = useTransform(p, [0, 0.3], [0, 1]);
  const sceneScale = useTransform(p, [0, 0.3, 0.6], reduced ? [1, 1, 1] : [1, 1.22, 1.5]);
  const sceneOpacity = useTransform(p, [0.26, 0.55], [1, 0]);
  const contentScale = useTransform(p, [0, 0.2], reduced ? [1, 1] : [1, 1.1]);
  const contentY = useTransform(p, [0, 0.2], reduced ? [0, 0] : [0, -50]);
  const contentOpacity = useTransform(p, [0, 0.17], [1, 0]);
  const notesOpacity = useTransform(p, [0.24, 0.48], [1, 0]);
  const cueOpacity = useTransform(p, [0, 0.05], [1, 0]);

  return (
    <section id="top" ref={ref} className="relative h-[110vh]" aria-label="Meridian">
      <div className="sticky top-0 h-dvh min-h-[560px] overflow-hidden">
        {/* one soft key light on the paper behind the instrument */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "radial-gradient(55% 60% at 70% 48%, rgba(255,255,255,0.9), transparent 70%)" }}
        />

        <motion.div style={{ opacity: notesOpacity }} className="absolute inset-0">
          <FloatingNotes layer="back" progress={p} />
        </motion.div>

        <motion.div aria-hidden style={{ scale: sceneScale, opacity: sceneOpacity }} className="absolute inset-0 will-change-transform">
          {/* CSS stand-in while three.js loads (and if WebGL is unavailable) */}
          <div
            className="absolute left-1/2 top-[23%] h-[min(42vw,190px)] w-[min(42vw,190px)] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-700 lg:left-[70%] lg:top-1/2 lg:h-[220px] lg:w-[220px]"
            style={{
              opacity: ready ? 0 : 1,
              background: "radial-gradient(circle at 34% 30%, #ffffff 0 18%, #eef1f3 55%, #c3ccd3 100%)",
              boxShadow: "inset 0 0 0 1px rgba(20,24,31,0.7), 0 24px 48px -24px rgba(20,24,31,0.25)",
            }}
          />
          <HeroScene progress={dolly} onReady={() => setReady(true)} />
        </motion.div>

        <motion.div style={{ opacity: notesOpacity }} className="absolute inset-0">
          <FloatingNotes layer="front" progress={p} />
        </motion.div>

        {/* paper scrim so copy stays crisp over the orbits and the notes */}
        <div
          aria-hidden
          className="absolute inset-0 lg:hidden"
          style={{ background: "linear-gradient(180deg, transparent 30%, rgba(246,245,241,0.85) 46%, #f6f5f1 64%)" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 hidden lg:block"
          style={{ background: "linear-gradient(90deg, rgba(246,245,241,0.95) 0%, rgba(246,245,241,0.72) 38%, transparent 58%)" }}
        />

        <motion.div
          style={{ opacity: contentOpacity, y: contentY, scale: contentScale }}
          className="lp-wrap relative flex h-full origin-[30%_60%] flex-col justify-end pb-8 pt-20 lg:justify-center lg:pb-0"
        >
          <div className="max-w-[640px] min-w-0">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="lp-eyebrow flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span className="text-(--lp-ink-2)">Voice-native paper trading</span>
              <span aria-hidden className="h-px w-6 bg-(--lp-line-2)" />
              <span>NSE · NIFTY 500</span>
            </motion.p>

            <h1 className="lp-h1 mt-5 text-balance sm:mt-6">
              {LINES.map((line, li) => (
                <span key={li} className="block">
                  {line.map((word, wi) => {
                    const i = li * 3 + wi;
                    return (
                      <Fragment key={word}>
                        <span className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
                          <motion.span
                            className="inline-block"
                            style={li === 1 ? { color: "var(--lp-muted)" } : undefined}
                            initial={reduced ? false : { y: "105%" }}
                            animate={{ y: "0%" }}
                            transition={{ duration: 0.9, ease: EASE, delay: 0.12 + i * 0.07 }}
                          >
                            {word}
                          </motion.span>
                        </span>
                        {wi < line.length - 1 && " "}
                      </Fragment>
                    );
                  })}
                </span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.55 }}
              className="lp-lead mt-5 max-w-[34rem] text-pretty sm:mt-6"
            >
              One Conductor listens to your voice and runs sixteen agents across India&apos;s NSE.
              Every order passes a risk gate, every trade gets a plain-English story, and not one rupee is real.
            </motion.p>

            {/* phones and tablets: the paper balance as a single line */}
            <motion.p
              ref={chipRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.62 }}
              className="mt-4 inline-flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-(--lp-line-2) bg-(--lp-surface) px-3 py-1.5 text-[13px] lg:hidden"
            >
              <span className="text-(--lp-muted)">Paper balance</span>
              <span className="font-semibold"><Odometer value={BALANCE} play={chipPlay} spins={1} duration={1500} stagger={70} /></span>
              <span className="lp-mono text-[12px] text-(--lp-coral)">₹0 real</span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.68 }}
              className="mt-5 flex flex-wrap items-center gap-3 sm:mt-8"
            >
              <LaunchLink className="lp-btn lp-btn-primary px-4 sm:px-[18px]">
                Launch the desk <ArrowRight size={16} aria-hidden />
              </LaunchLink>
              <a href="#demo" className="lp-btn lp-btn-ghost px-4 sm:px-[18px]">
                <Play size={14} aria-hidden /> Watch it work
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.85 }}
              className="lp-hero-ticker mt-6 sm:mt-8"
            >
              <VoiceTicker />
            </motion.div>
          </div>
        </motion.div>

        {/* desktop: the paper balance floats under the orb */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: EASE, delay: 1 }}
          className="absolute bottom-[7%] right-[4%] hidden lg:block"
        >
          <motion.div style={{ opacity: contentOpacity }}>
            <BalanceCard />
          </motion.div>
        </motion.div>

        <motion.div
          aria-hidden
          style={{ opacity: cueOpacity }}
          className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 lg:flex"
        >
          <span className="lp-eyebrow text-[10.5px]">Scroll</span>
          <span className="relative h-8 w-px overflow-hidden bg-(--lp-line-2)">
            <motion.span
              className="absolute inset-x-0 top-0 h-3 bg-(--lp-ink)"
              animate={reduced ? undefined : { y: [-12, 32] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </span>
        </motion.div>
      </div>
    </section>
  );
}
