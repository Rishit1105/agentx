"use client";
import { motion } from "motion/react";
import { Accordion, Scene, SectionHeader, fadeUp, stagger, type AccordionItem } from "./ui";
import VideoFrame from "./VideoFrame";
import { VIDEOS } from "./videos";

const CALLOUTS = [
  { figure: "7 in 10", body: "individual intraday traders in the cash segment lost money in FY23.", source: "SEBI study, July 2024" },
  { figure: "1 click", body: "between a hunch and an order. Entries happen before a stop or a size is set.", source: "The impulsive entry" },
  { figure: "0 notes", body: "on why the trade was taken, so the same mistake repeats.", source: "No journal" },
];

const ANSWERS: AccordionItem[] = [
  { id: "why-stop", title: "Stop and size before entry",
    body: "Every plan sets its stop and target first, then sizes the trade so the stop costs at most your per-trade cap." },
  { id: "why-yes", title: "A spoken “yes”, every time",
    body: "The model has no order tool. Nothing moves until you confirm the exact quantity out loud." },
  { id: "why-tighten", title: "Limits that only tighten",
    body: "Voice can lower a limit mid-session. It can never raise one, however the request is worded." },
  { id: "why-journal", title: "The journal writes itself",
    body: "Every trade, skip, block and halt gets a plain-English Story, with each number checked against evidence." },
].map((a, i) => ({
  ...a,
  icon: <span className="lp-mono w-5 shrink-0 text-[12px] text-(--lp-cyan)">{String(i + 1).padStart(2, "0")}</span>,
}));

/** Seven of ten traders, drawn as ink dots that fill in coral one by one. */
function SevenInTen() {
  return (
    <motion.span variants={stagger(0.07, 0.2)} className="mt-3 flex gap-1.5" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <motion.span
          key={i}
          variants={{ hidden: { scale: 0.3, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 400, damping: 18 } } }}
          className="h-2.5 w-2.5 rounded-full border"
          style={{
            borderColor: i < 7 ? "var(--lp-coral)" : "var(--lp-line-2)",
            background: i < 7 ? "var(--lp-coral)" : "transparent",
          }}
        />
      ))}
    </motion.span>
  );
}

/** Why Meridian exists: the discipline gap, told with SEBI's own numbers. */
export default function Problem() {
  return (
    <Scene id="problem" label="The problem" innerClassName="lp-wrap py-12 sm:py-14">
      <SectionHeader
        split
        eyebrow="The problem"
        title={<>Most intraday traders lose money.</>}
        lead="The rules were never the problem; following them was. Most losses start with an entry taken on impulse and never written down."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-12">
        <VideoFrame
          video={VIDEOS.sebiStudy}
          size="md"
          note="SEBI's newer FY26 study found about 88% of individual F&O traders lost money."
        />

        <div className="min-w-0">
          <motion.ul
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
            variants={stagger(0.1)}
            className="grid grid-cols-1 border-l border-t border-(--lp-line) sm:grid-cols-3"
          >
            {CALLOUTS.map((c, i) => (
              <motion.li key={c.figure} variants={fadeUp} className="min-w-0 border-b border-r border-(--lp-line) p-4">
                <p className="lp-eyebrow text-[10px]">{c.source}</p>
                <p className="lp-mono mt-2.5 text-[clamp(1.5rem,1.3rem+0.8vw,1.9rem)] font-semibold leading-none tracking-[-0.04em]">{c.figure}</p>
                {i === 0 && <SevenInTen />}
                <p className="mt-2.5 text-pretty text-[12.5px] leading-snug text-(--lp-ink-2)">{c.body}</p>
              </motion.li>
            ))}
          </motion.ul>

          <p className="lp-eyebrow mt-7">Meridian&apos;s answer</p>
          <Accordion items={ANSWERS} className="mt-3" />
        </div>
      </div>
    </Scene>
  );
}
