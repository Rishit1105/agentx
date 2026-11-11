"use client";
import { AnimatePresence, motion } from "motion/react";
import { EASE } from "../ui";
import MiniOrb, { type OrbState } from "./MiniOrb";
import { AgentsStage, ApproveStage, FillStage, ScanStage, SpeakStage, TicketStage } from "./Stages";

export const SCENES: { title: string; stage: string; orb: OrbState; orbLabel: string }[] = [
  { title: "You speak", stage: "Voice", orb: "listening", orbLabel: "Listening" },
  { title: "Agents wake", stage: "Agent Orrery", orb: "thinking", orbLabel: "Thinking" },
  { title: "Scan results", stage: "Scanner", orb: "speaking", orbLabel: "Speaking" },
  { title: "The plan", stage: "Trade ticket", orb: "confirm", orbLabel: "Awaiting “yes”" },
  { title: "Your yes", stage: "Confirmation", orb: "listening", orbLabel: "Listening" },
  { title: "Fill + Story", stage: "Paper Exchange · Journalist", orb: "speaking", orbLabel: "Speaking" },
];

const TRANSCRIPT: { at: number; who: "you" | "meridian"; text: string }[] = [
  { at: 0, who: "you", text: "Hey Meridian, scan for breakouts." },
  { at: 2, who: "meridian", text: "130 of 497 closed above their 15-minute range. SUNTV is the cleanest." },
  { at: 3, who: "you", text: "Plan a trade on Zomato." },
  { at: 3, who: "meridian", text: "Entry 370.75, stop 365.57, target 375.93. 482 shares, risking ₹2,496.76. Risk gate passed." },
  { at: 4, who: "you", text: "Yes, buy 482 ETERNAL." },
  { at: 5, who: "meridian", text: "Filled on paper. The Story is in your ledger." },
];

const LOG: { at: number; who: string; text: string; tone: string }[] = [
  { at: 1, who: "Conductor", text: "routed to Scanner, News, Analyst", tone: "var(--lp-cyan)" },
  { at: 2, who: "Scanner", text: "130 hits · top SUNTV", tone: "var(--lp-violet)" },
  { at: 3, who: "Budget", text: "482 sh = ₹2,496.76 risk", tone: "var(--lp-violet)" },
  { at: 3, who: "Risk", text: "PASS · rk_9f3a…c1", tone: "var(--lp-mint)" },
  { at: 4, who: "Conductor", text: "voice confirm matched", tone: "var(--lp-cyan)" },
  { at: 5, who: "Exchange", text: "filled 482 @ 370.80 (paper)", tone: "var(--lp-amber)" },
  { at: 5, who: "Journalist", text: "Story written · 6/6 checked", tone: "var(--lp-amber)" },
];

const STAGES = [SpeakStage, AgentsStage, ScanStage, TicketStage, ApproveStage, FillStage];

function Meter({ label, value, of, frac, tone }: { label: string; value: string; of: string; frac: number; tone: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="text-(--lp-muted)">{label}</span>
        <span className="lp-mono truncate"><span style={{ color: tone }}>{value}</span><span className="text-(--lp-faint)"> / {of}</span></span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-(--lp-line)">
        <div className="h-full rounded-full transition-transform duration-700" style={{ background: tone, transform: `scaleX(${frac})`, transformOrigin: "0 50%" }} />
      </div>
    </div>
  );
}

/** The Command Deck, rebuilt in HTML/SVG so the demo plays crisply at any size. */
export default function DeckMock({ scene }: { scene: number }) {
  const s = SCENES[scene];
  const Stage = STAGES[scene];
  const lines = TRANSCRIPT.filter((l) => l.at <= scene);
  const latest = lines[lines.length - 1];
  const log = LOG.filter((l) => l.at <= scene);
  const filled = scene >= 5;
  const planned = scene >= 3;

  return (
    <div className="lp-paper flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-(--lp-line-2) shadow-[0_1px_2px_rgba(20,24,31,0.06),0_32px_64px_-32px_rgba(20,24,31,0.28)]">
      {/* app bar */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-(--lp-line) bg-(--lp-surface) px-3 sm:px-4">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-(--lp-line-2)" />
          <span className="h-2.5 w-2.5 rounded-full bg-(--lp-line-2)" />
          <span className="h-2.5 w-2.5 rounded-full bg-(--lp-line-2)" />
        </span>
        <span className="lp-display hidden text-[11px] font-semibold tracking-[0.12em] text-(--lp-ink-2) sm:inline">MERIDIAN</span>
        <span className="hidden text-[12px] text-(--lp-muted) md:inline">Command Deck</span>
        <span className="lp-mono ml-auto flex min-w-0 items-center gap-2 text-[11px] text-(--lp-ink-2)">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--lp-mint)" />
          <span className="truncate">10:42:18 IST · Entry window</span>
        </span>
        <span className="lp-mono hidden rounded-full border border-(--lp-mint)/40 px-2 py-0.5 text-[10px] tracking-[0.06em] text-(--lp-mint) sm:inline">PAPER</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_240px]">
        {/* the Conductor */}
        <aside className="hidden min-h-0 flex-col border-r border-(--lp-line) p-4 md:flex">
          <div className="flex items-center gap-3">
            <MiniOrb state={s.orb} size={52} />
            <div className="min-w-0">
              <p className="lp-eyebrow text-[10px]">Conductor</p>
              <p className="mt-0.5 truncate text-[13px] font-semibold">{s.orbLabel}</p>
            </div>
          </div>
          <div
            className="mt-4 flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden"
            style={{ maskImage: "linear-gradient(180deg, transparent, #000 28%)", WebkitMaskImage: "linear-gradient(180deg, transparent, #000 28%)" }}
          >
            <AnimatePresence initial={false}>
              {lines.map((l) => (
                <motion.div
                  key={l.text}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className={l.who === "you"
                    ? "ml-4 rounded-xl rounded-br-sm border border-(--lp-line-2) bg-(--lp-surface-2) px-2.5 py-1.5 text-[11.5px] leading-snug"
                    : "mr-4 rounded-xl rounded-bl-sm border border-(--lp-cyan)/30 bg-(--lp-cyan-soft) px-2.5 py-1.5 text-[11.5px] leading-snug text-(--lp-ink-2)"}
                >
                  {l.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-3 flex h-9 shrink-0 items-center gap-2 rounded-full border border-(--lp-line-2) px-3 text-[11.5px] text-(--lp-muted)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--lp-cyan)" /> Say “Hey Meridian”…
          </div>
        </aside>

        {/* stage */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-(--lp-line) px-3 sm:px-5">
            <span className="lp-eyebrow truncate text-[10px]">{s.stage}</span>
            <span className="ml-auto flex items-center gap-1" aria-hidden>
              {SCENES.map((_, i) => (
                <span key={i} className="h-1 w-4 rounded-full transition-colors duration-300"
                  style={{ background: i <= scene ? "var(--lp-cyan)" : "var(--lp-line-2)" }} />
              ))}
            </span>
          </div>
          {/* phones: the latest voice line rides above the stage */}
          {latest && (
            <div className="border-b border-(--lp-line) px-3 py-2 md:hidden">
              <p className="text-[12px] leading-snug">
                <span className="lp-eyebrow mr-2 text-[9.5px]" style={{ color: latest.who === "you" ? "var(--lp-muted)" : "var(--lp-cyan)" }}>
                  {latest.who === "you" ? "You" : "Meridian"}
                </span>
                <span className="text-(--lp-ink-2)">{latest.text}</span>
              </p>
            </div>
          )}
          <div className="relative min-h-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={scene}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.01 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <Stage />
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* risk desk */}
        <aside className="hidden min-h-0 flex-col gap-4 border-l border-(--lp-line) p-4 xl:flex">
          <div>
            <p className="lp-eyebrow text-[10px]">Paper balance</p>
            <p className="lp-mono mt-1 text-[20px] font-semibold tracking-[-0.02em]">₹5,00,000</p>
            <p className="lp-mono mt-0.5 text-[11px] text-(--lp-muted)">{filled ? "₹1,78,725.60 deployed" : "nothing deployed"}</p>
          </div>
          <div className="space-y-3">
            <Meter label="Trade risk" value={planned ? "₹2,496.76" : "₹0"} of="₹2,500" frac={planned ? 0.9987 : 0} tone="var(--lp-amber)" />
            <Meter label="Day loss" value="₹0" of="₹7,500" frac={0} tone="var(--lp-coral)" />
            <Meter label="Trades" value={filled ? "1" : "0"} of="3" frac={filled ? 1 / 3 : 0} tone="var(--lp-cyan)" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <p className="lp-eyebrow text-[10px]">Agent log</p>
            <ul className="mt-2 space-y-1.5">
              <AnimatePresence initial={false}>
                {log.slice(-5).map((l) => (
                  <motion.li
                    key={l.who + l.text}
                    layout
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex min-w-0 gap-2 text-[11px] leading-snug"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.tone }} />
                    <span className="min-w-0"><span className="font-semibold">{l.who}</span> <span className="text-(--lp-muted)">{l.text}</span></span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
