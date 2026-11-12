"use client";
import { AnimatePresence, motion } from "motion/react";
import { Network, Workflow, Zap } from "lucide-react";
import { Scene, SectionHeader, TabBar, panelVariants, useTabs, type TabItem } from "./ui";
import AgentsPanel from "./how/AgentsPanel";
import PipelinePanel from "./how/PipelinePanel";
import AutomationsPanel from "./how/AutomationsPanel";

const ORDER = ["agents", "pipeline", "automations"] as const;
type Tab = (typeof ORDER)[number];

const TABS: TabItem<Tab>[] = [
  { id: "agents", label: <><Network size={14} aria-hidden /> Agents</> },
  { id: "pipeline", label: <><Workflow size={14} aria-hidden /> Pipeline</> },
  { id: "automations", label: <><Zap size={14} aria-hidden /> Automations</> },
];

const LEADS: Record<Tab, string> = {
  agents: "You talk to one voice. Behind it, eleven skills and five native services each do one job and report back.",
  pipeline: "From scan to Story, fifteen steps run in order, and every one of them lands on the record.",
  automations: "Rules on the market clock, created by voice. They brief, scan, watch, plan and halt; they never buy.",
};

const PANELS: Record<Tab, () => React.JSX.Element> = {
  agents: AgentsPanel,
  pipeline: PipelinePanel,
  automations: AutomationsPanel,
};

/** How it works: the agent mesh, the trade pipeline and automations, as three tabs with sliding panels. */
export default function HowItWorks() {
  const { tab, dir, select } = useTabs(ORDER, "agents");
  const Panel = PANELS[tab];

  return (
    <Scene id="how" label="How it works" className="lp-soft" innerClassName="lp-wrap py-12 sm:py-14">
      <SectionHeader
        split
        eyebrow="How it works"
        title={<>One Conductor. <span className="text-(--lp-muted)">Sixteen specialists.</span></>}
        lead="Say what you want. The Conductor routes it to the right agents, checks the plan against your limits, and waits for your yes."
      />

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <TabBar tabs={TABS} value={tab} onChange={select} idBase="how" label="How it works" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="max-w-md text-pretty text-[13.5px] leading-relaxed text-(--lp-muted) sm:text-right"
          >
            {LEADS[tab]}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="relative mt-6">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={tab}
            id={`how-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`how-tab-${tab}`}
            custom={dir}
            variants={panelVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <Panel />
          </motion.div>
        </AnimatePresence>
      </div>
    </Scene>
  );
}
