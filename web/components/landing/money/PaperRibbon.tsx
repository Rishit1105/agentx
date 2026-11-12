"use client";
import { motion } from "motion/react";
import { EASE } from "../ui";

/** A "Paper only" ribbon folded across the top-right corner of its (relative, overflow-hidden) parent. */
export default function PaperRibbon({ label = "Paper only" }: { label?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute right-0 top-0 z-20 h-28 w-28 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, x: 40, y: -40 }}
        whileInView={{ opacity: 1, x: 0, y: 0 }}
        viewport={{ once: true, amount: "some" }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.3 }}
        style={{ rotate: 45 }}
        className="lp-ribbon absolute right-[-38px] top-[24px] w-[160px] py-[5px] text-center"
      >
        {label}
      </motion.div>
    </div>
  );
}
