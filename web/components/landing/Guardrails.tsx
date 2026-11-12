"use client";
import { AnimatePresence, motion } from "motion/react";
import { Gauge, Hand, Link2 } from "lucide-react";
import { LAYERS } from "./data";
import {
  Accordion, Bubble, Scene, SectionHeader, TabBar, TONE, TONE_SOFT, fadeUp, panelVariants, stagger, useTabs,
  type AccordionItem, type TabItem,
} from "./ui";
import RiskDial from "./guardrails/RiskDial";
import HoldToHalt from "./guardrails/HoldToHalt";
import HashChain from "./guardrails/HashChain";

const ORDER = ["risk", "halt", "ledger"] as const;
type Tab = (typeof ORDER)[number];

const TABS: TabItem<Tab>[] = [
  { id: "risk", label: <><Gauge size={14} aria-hidden /> Risk gate</> },
  { id: "halt", label: <><Hand size={14} aria-hidden /> Kill switch</> },
  { id: "ledger", label: <><Link2 size={14} aria-hidden /> Ledger</> },
];

/** The five defence layers. The risk gate carries the "tighten, never loosen" exchange as its example. */
const LAYER_ITEMS: AccordionItem[] = LAYERS.map((l) => {
  const Icon = l.icon;
  return {
    id: `layer-${l.id}`,
    icon: (
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: TONE_SOFT[l.tone] }}>
        <Icon size={15} style={{ color: TONE[l.tone] }} aria-hidden />
      </span>
    ),
    title: l.name,
    meta: <span className="lp-mono text-[11.5px] font-semibold" style={{ color: TONE[l.tone] }}>{l.id}</span>,
    body: (
      <>
        <p className="pl-[46px]">{l.body}</p>
        {l.id === "L1" && (
          <div className="mt-3 space-y-2 pl-[46px]">
            <Bubble who="you">Raise my daily loss limit to ₹15,000.</Bubble>
            <Bubble who="meridian" tone="coral">I can&apos;t. Voice can tighten your limits, never loosen them. It stays at ₹7,500.</Bubble>
          </div>
        )}
      </>
    ),
  };
});

const HALT_WAYS = [
  ["Say it", "“Stop everything.”"],
  ["Press it", "Esc twice, anywhere on the desk"],
  ["Call it", "One API call from any script"],
  ["Or not at all", "Sentinel trips it on loss, drawdown or stale data"],
];

/** The kill switch to try, and the four other ways the desk halts itself. */
function HaltPanel() {
  return (
    <div className="space-y-4">
      <HoldToHalt />
      <motion.ul initial="hidden" animate="show" variants={stagger(0.06, 0.1)} className="grid gap-2 sm:grid-cols-2">
        {HALT_WAYS.map(([k, v]) => (
          <motion.li key={k} variants={fadeUp} className="rounded-xl border border-(--lp-line) bg-(--lp-surface) p-3.5">
            <p className="lp-eyebrow text-[10px] text-(--lp-coral)">{k}</p>
            <p className="mt-1 text-pretty text-[13.5px] text-(--lp-ink-2)">{v}</p>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

/** Guardrails: the five layers on the left, and the three you can try (risk gate, kill switch, ledger) on the right. */
export default function Guardrails() {
  const { tab, dir, select } = useTabs(ORDER, "risk");

  return (
    <Scene id="guardrails" label="Guardrails" className="lp-white" innerClassName="lp-wrap py-12 sm:py-14">
      <SectionHeader
        split
        eyebrow="Guardrails · five defence layers"
        title={<>Built so the worst case is <span className="text-(--lp-coral)">boring</span>.</>}
        lead="A voice desk has to be safer than a click desk. Every order passes five independent layers, the strictest one wins, and every decision is sealed in a hash-chained ledger."
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <Accordion items={LAYER_ITEMS} initial="layer-L1" className="min-w-0 self-start" />

        <div className="min-w-0">
          <TabBar tabs={TABS} value={tab} onChange={select} idBase="guard" label="Try the guardrails" />
          <div className="relative mt-4">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={tab}
                id={`guard-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`guard-tab-${tab}`}
                custom={dir}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {tab === "risk" && <RiskDial />}
                {tab === "halt" && <HaltPanel />}
                {tab === "ledger" && <HashChain />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Scene>
  );
}
