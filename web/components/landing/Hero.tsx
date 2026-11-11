"use client";
import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowRight, Play } from "lucide-react";
import { useReducedMotion, useScrollRoot } from "./context";
import { EASE, LaunchLink } from "./ui";
import VoiceTicker from "./VoiceTicker";

// three.js is only fetched on the client, after the page is interactive
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

const LINES = [["Speak", "the", "market."], ["Trust", "every", "trade."]];

export default function Hero() {
  const container = useScrollRoot();
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);

  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4, restDelta: 0.0005 });

  const contentOpacity = useTransform(p, [0, 0.42], [1, 0]);
  const contentScale = useTransform(p, [0, 0.5], [1, 1.12]);
  const contentY = useTransform(p, [0, 0.5], [0, -40]);
  const sceneScale = useTransform(p, [0, 1], [1, 1.35]);
  const sceneOpacity = useTransform(p, [0.62, 0.98], [1, 0]);
  const cueOpacity = useTransform(p, [0, 0.08], [1, 0]);

  return (
    <section id="top" ref={ref} className="relative h-[175vh]" aria-label="Meridian">
      <div className="sticky top-0 h-dvh overflow-hidden">
        {/* one soft key light on the paper behind the instrument */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: "radial-gradient(55% 60% at 70% 48%, rgba(255,255,255,0.9), transparent 70%)" }}
        />

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
          <HeroScene progress={p} onReady={() => setReady(true)} />
        </motion.div>

        {/* paper scrim so copy stays crisp over the orbits */}
        <div
          aria-hidden
          className="absolute inset-0 lg:hidden"
          style={{ background: "linear-gradient(180deg, transparent 28%, rgba(246,245,241,0.8) 44%, #f6f5f1 66%)" }}
        />
        <div
          aria-hidden
          className="absolute inset-0 hidden lg:block"
          style={{ background: "linear-gradient(90deg, rgba(246,245,241,0.94) 0%, rgba(246,245,241,0.7) 38%, transparent 60%)" }}
        />

        <motion.div
          style={{ opacity: contentOpacity, scale: contentScale, y: contentY }}
          className="lp-wrap relative flex h-full origin-[30%_50%] flex-col justify-end pb-8 pt-20 lg:justify-center lg:pb-0"
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
                      <span key={word} className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
                        <motion.span
                          className="inline-block"
                          style={li === 1 ? { color: "var(--lp-muted)" } : undefined}
                          initial={reduced ? false : { y: "105%" }}
                          animate={{ y: "0%" }}
                          transition={{ duration: 0.9, ease: EASE, delay: 0.12 + i * 0.07 }}
                        >
                          {word}
                        </motion.span>
                        {" "}
                      </span>
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

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.68 }}
              className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8"
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

        <motion.div
          aria-hidden
          style={{ opacity: cueOpacity }}
          className="absolute bottom-6 right-6 hidden items-center gap-3 lg:flex"
        >
          <span className="lp-eyebrow">Scroll to zoom in</span>
          <span className="relative h-10 w-px overflow-hidden bg-(--lp-line-2)">
            <motion.span
              className="absolute inset-x-0 top-0 h-3 bg-(--lp-ink)"
              animate={reduced ? undefined : { y: [-12, 40] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </span>
        </motion.div>
      </div>
    </section>
  );
}
