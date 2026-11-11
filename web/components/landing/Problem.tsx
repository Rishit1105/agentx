"use client";
import { motion } from "motion/react";
import { EASE, SectionHeader } from "./ui";
import VideoFrame from "./VideoFrame";
import { VIDEOS } from "./videos";

const CALLOUTS = [
  {
    figure: "7 in 10",
    body: "individual intraday traders in the cash segment lost money in FY23.",
    source: "SEBI study, July 2024",
  },
  {
    figure: "1 click",
    body: "between a hunch and an order. Entries happen on impulse, before a stop or a size is set.",
    source: "The impulsive entry",
  },
  {
    figure: "0 notes",
    body: "on why the trade was taken, so the same mistake repeats with nothing to learn from.",
    source: "No journal",
  },
];

const ANSWERS = [
  { h: "Stop and size before entry", p: "Every plan sets its stop and target first, then sizes the trade so the stop costs at most your per-trade cap." },
  { h: "A spoken “yes”, every time", p: "The model has no order tool. Nothing moves until you confirm the exact quantity out loud." },
  { h: "Limits that only tighten", p: "Voice can lower a limit mid-session. It can never raise one, however the request is worded." },
  { h: "The journal writes itself", p: "Every trade, skip, block and halt gets a plain-English Story, with each number checked against evidence." },
];

/** Why Meridian exists: the discipline gap, told with SEBI's own numbers. */
export default function Problem() {
  return (
    <section id="problem" aria-label="The problem" className="lp-anchor lp-white relative border-t border-(--lp-line)">
      <div className="lp-wrap py-24 sm:py-32">
        <SectionHeader
          eyebrow="The problem"
          title={<>Most intraday traders lose money. <span className="text-(--lp-muted)">The rules were never the problem; following them was.</span></>}
          className="max-w-4xl"
        />

        <ul className="mt-12 grid grid-cols-1 border-l border-t border-(--lp-line) sm:mt-14 md:grid-cols-3">
          {CALLOUTS.map((c, i) => (
            <motion.li
              key={c.figure}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
              className="min-w-0 border-b border-r border-(--lp-line) p-5 sm:p-6"
            >
              <p className="lp-eyebrow">{c.source}</p>
              <p className="lp-mono mt-4 text-[clamp(2rem,1.6rem+1.6vw,2.75rem)] font-semibold leading-none tracking-[-0.04em]">
                {c.figure}
              </p>
              <p className="mt-3 max-w-[30ch] text-pretty text-[14.5px] leading-relaxed text-(--lp-ink-2)">{c.body}</p>
            </motion.li>
          ))}
        </ul>

        <div className="mt-12 grid gap-10 sm:mt-16 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-14">
          <VideoFrame
            video={VIDEOS.sebiStudy}
            size="lg"
            note="SEBI's newer FY26 study found about 88% of individual F&O traders lost money."
          />

          <div className="min-w-0">
            <p className="lp-eyebrow">Meridian&apos;s answer</p>
            <h3 className="lp-h3 mt-3 text-balance">Make the disciplined path the only path.</h3>
            <ol className="mt-6 space-y-0 border-t border-(--lp-line)">
              {ANSWERS.map((a, i) => (
                <motion.li
                  key={a.h}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
                  className="flex gap-4 border-b border-(--lp-line) py-4"
                >
                  <span className="lp-mono pt-0.5 text-[12px] text-(--lp-cyan)">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold tracking-[-0.01em]">{a.h}</span>
                    <span className="mt-1 block text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">{a.p}</span>
                  </span>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
