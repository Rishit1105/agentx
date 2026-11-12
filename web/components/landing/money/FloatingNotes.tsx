"use client";
import { motion, useTransform, type MotionValue } from "motion/react";
import clsx from "clsx";
import { useReducedMotion } from "../context";
import Banknote, { type NoteTint } from "./Banknote";
import { Coin } from "./CoinBurst";

type Note = {
  denomination: string;
  tint: NoteTint;
  serial: string;
  /** Position and width, phone first, then desktop. */
  place: string;
  rotate: number;
  /** How far (px) the note rises as the hero scrolls away: deeper notes move more. */
  depth: number;
  /** Seconds per idle bob. */
  bob: number;
  layer: "back" | "front";
};

const NOTES: Note[] = [
  { denomination: "500", tint: "mint", serial: "MRD 482 370 75", rotate: -14, depth: 150, bob: 7.5, layer: "back",
    place: "left-[-9%] top-[10%] w-[150px] sm:w-[190px] lg:left-[45%] lg:top-[12%] lg:w-[230px]" },
  { denomination: "2000", tint: "amber", serial: "MRD 365 575 18", rotate: 13, depth: 90, bob: 9, layer: "back",
    place: "right-[-10%] top-[27%] w-[140px] sm:w-[180px] lg:right-[1%] lg:top-[14%] lg:w-[200px]" },
  { denomination: "5,00,000", tint: "cyan", serial: "MRD 000 500 00", rotate: -6, depth: 230, bob: 8.5, layer: "front",
    place: "hidden lg:block lg:left-[50%] lg:top-[66%] lg:w-[250px]" },
  { denomination: "100", tint: "mint", serial: "MRD 375 930 06", rotate: 21, depth: 60, bob: 10, layer: "back",
    place: "hidden xl:block xl:right-[3%] xl:top-[44%] xl:w-[165px]" },
];

function FloatingNote({ note, index, progress }: { note: Note; index: number; progress: MotionValue<number> }) {
  const reduced = useReducedMotion();
  const depth = reduced ? 0 : note.depth;
  const y = useTransform(progress, [0, 1], [0, -depth]);
  const drift = useTransform(progress, [0, 1], [0, reduced ? 0 : Math.sign(note.rotate) * 6]);

  return (
    <div className={clsx("absolute", note.place)}>
      <motion.div style={{ y, rotate: drift }} className="will-change-transform">
        <motion.div
          initial={{ opacity: 0, y: 70, rotate: note.rotate - 18, scale: 0.92 }}
          animate={{ opacity: note.layer === "front" ? 0.96 : 0.9, y: 0, rotate: note.rotate, scale: 1 }}
          transition={{ type: "spring", stiffness: 70, damping: 16, mass: 0.9, delay: 0.35 + index * 0.14 }}
        >
          <div className="lp-float lp-note" style={{ animationDuration: `${note.bob}s`, animationDelay: `${-index * 1.7}s` }}>
            <Banknote denomination={note.denomination} tint={note.tint} serial={note.serial} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

type FloatingCoinSpec = { place: string; size: number; depth: number; spin: number; tint: string };

/* Coins sit at their own depths: the nearer ones rise faster and spin more as the hero scrolls away. */
const COINS: FloatingCoinSpec[] = [
  { place: "left-[70%] top-[5%] lg:left-[61%] lg:top-[33%]", size: 30, depth: 300, spin: 220, tint: "#b7790b" },
  { place: "left-[8%] top-[37%] lg:left-[88%] lg:top-[36%]", size: 24, depth: 200, spin: -160, tint: "#0e9f6e" },
  { place: "hidden lg:block lg:left-[80%] lg:top-[82%]", size: 34, depth: 380, spin: 260, tint: "#b7790b" },
  { place: "hidden lg:block lg:left-[46%] lg:top-[48%]", size: 20, depth: 120, spin: -120, tint: "#0a7ea4" },
];

function FloatingCoin({ coin, index, progress }: { coin: FloatingCoinSpec; index: number; progress: MotionValue<number> }) {
  const reduced = useReducedMotion();
  const y = useTransform(progress, [0, 1], [0, reduced ? 0 : -coin.depth]);
  const rotate = useTransform(progress, [0, 1], [0, reduced ? 0 : coin.spin]);
  const scale = useTransform(progress, [0, 0.4], [1, reduced ? 1 : 1 + coin.depth / 900]);
  return (
    <div className={clsx("absolute", coin.place)}>
      <motion.div style={{ y, rotate, scale }} className="will-change-transform">
        <motion.div
          initial={{ opacity: 0, scale: 0.3, y: -40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 12, delay: 0.9 + index * 0.12 }}
        >
          <div className="lp-float drop-shadow-[0_6px_8px_rgba(20,24,31,0.12)]" style={{ animationDuration: `${6 + index}s`, animationDelay: `${-index * 1.3}s` }}>
            <Coin tint={coin.tint} size={coin.size} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Paper notes (and a few coins) drifting around the orb, with scroll parallax by depth. Render once per layer. */
export default function FloatingNotes({ progress, layer }: { progress: MotionValue<number>; layer: Note["layer"] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {NOTES.map((n, i) => n.layer === layer && <FloatingNote key={n.serial} note={n} index={i} progress={progress} />)}
      {layer === "front" && COINS.map((c, i) => <FloatingCoin key={c.place} coin={c} index={i} progress={progress} />)}
    </div>
  );
}
