"use client";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { useM } from "@/lib/store";

const OUTER = ["scanner", "news", "entry", "exit", "timemachine", "budget", "risk", "broker", "alerts", "analyst", "deals"];
const INNER = ["strategist", "backtester", "journalist", "sentinel", "exchange"];
const LABEL: Record<string, string> = {
  scanner: "Scanner", news: "News", entry: "Entry", exit: "Exit", timemachine: "Time Machine", budget: "Budget",
  risk: "Risk", broker: "Broker", alerts: "Alerts", analyst: "Analyst", deals: "Bulk Deals", strategist: "Strategist",
  backtester: "Backtester", journalist: "Journalist", sentinel: "Sentinel", exchange: "Exchange",
};

export function nodePos(id: string, size: number) {
  const c = size / 2;
  const outer = OUTER.indexOf(id);
  if (outer >= 0) {
    const a = -Math.PI / 2 + (outer / OUTER.length) * Math.PI * 2;
    const R = size * 0.455;
    return { x: c + Math.cos(a) * R, y: c + Math.sin(a) * R, ring: "outer" as const, a };
  }
  const i = INNER.indexOf(id);
  const a = -Math.PI / 2 + Math.PI / INNER.length + (i / INNER.length) * Math.PI * 2;
  const R = size * 0.33;
  return { x: c + Math.cos(a) * R, y: c + Math.sin(a) * R, ring: "inner" as const, a };
}

/** The Agent Orrery: the multi-agent system made legible. Active workers glow and a thread runs to the core. */
export default function Orrery({ size, children }: { size: number; children?: React.ReactNode }) {
  const active = useM((s) => s.active);
  const pulses = useM((s) => s.pulses);
  const agents = useM((s) => s.st?.agents);
  const halted = useM((s) => s.st?.kill.state === "LOCKED");
  const set = useM((s) => s.set);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(i); }, []);
  const c = size / 2;
  const recent = new Set(pulses.filter((p) => now - p.t < 1600).map((p) => p.agent));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 overflow-visible">
        <defs>
          <radialGradient id="ringglow"><stop offset="0%" stopColor="#0a7ea4" stopOpacity="0.0" />
            <stop offset="100%" stopColor="#0a7ea4" stopOpacity="0.06" /></radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx={c} cy={c} r={size * 0.455} fill="none" stroke="#e7e4dc" strokeDasharray="2 6" />
        <circle cx={c} cy={c} r={size * 0.33} fill="none" stroke="#d8d4ca" strokeDasharray="1 5" />
        <circle cx={c} cy={c} r={size * 0.455} fill="url(#ringglow)" />
        {/* ticks */}
        {Array.from({ length: 72 }).map((_, i) => {
          const a = (i / 72) * Math.PI * 2, r1 = size * 0.485, r2 = r1 + (i % 6 === 0 ? 8 : 3);
          return <line key={i} x1={c + Math.cos(a) * r1} y1={c + Math.sin(a) * r1} x2={c + Math.cos(a) * r2} y2={c + Math.sin(a) * r2}
            stroke="#d8d4ca" strokeWidth={1} />;
        })}
        {/* threads */}
        {[...OUTER, ...INNER].map((id) => {
          const p = nodePos(id, size);
          const on = !!active[id] || recent.has(id);
          const col = p.ring === "outer" ? "#6e56cf" : "#0a7ea4";
          return (
            <g key={"t" + id}>
              <line x1={p.x} y1={p.y} x2={c} y2={c} stroke={on ? col : "#141c27"} strokeOpacity={on ? 0.75 : 0.6}
                strokeWidth={on ? 1.4 : 0.7} strokeDasharray={on ? "4 6" : "0"} filter={on ? "url(#glow)" : undefined}>
                {on && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.6s" repeatCount="indefinite" />}
              </line>
            </g>
          );
        })}
        {/* beads: data hand-offs travelling to the core */}
        <AnimatePresence>
          {pulses.filter((p) => now - p.t < 1400).map((p) => {
            const n = nodePos(p.agent, size);
            return (
              <motion.circle key={p.id} r={3.2} fill={n.ring === "outer" ? "#b7adff" : "#9cf0ff"} filter="url(#glow)"
                initial={{ cx: n.x, cy: n.y, opacity: 1 }} animate={{ cx: c, cy: c, opacity: 0.2 }} exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }} />
            );
          })}
        </AnimatePresence>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      {[...OUTER, ...INNER].map((id) => {
        const p = nodePos(id, size);
        const on = !!active[id];
        const meta = agents?.find((a) => a.id === id);
        const err = meta?.last?.status === "error";
        const outer = p.ring === "outer";
        const col = halted ? "#e5484d" : outer ? "#6e56cf" : "#0a7ea4";
        return (
          <button key={id} onClick={() => set({ drawerAgent: id })}
            className="group absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 outline-none"
            style={{ left: p.x, top: p.y }} aria-label={`${LABEL[id]} agent${on ? ", working" : ""}`}>
            <span className="relative grid place-items-center rounded-full transition-all duration-300"
              style={{ width: outer ? 30 : 34, height: outer ? 30 : 34,
                background: on ? `radial-gradient(circle, ${col}66, ${col}11 70%)` : "rgba(255,255,255,0.96)",
                border: `1px solid ${on ? col : err ? "#e5484d88" : "#d8d4ca"}`,
                boxShadow: on ? `0 0 24px ${col}99, 0 0 2px ${col}` : "none" }}>
              <span className="rounded-full" style={{ width: 7, height: 7, background: on ? "#fff" : meta?.last ? col : "#c9c5bb",
                boxShadow: on ? `0 0 10px #fff` : "none" }} />
              {on && <span className="absolute inset-0 rounded-full animate-ping" style={{ border: `1px solid ${col}`, opacity: 0.5 }} />}
            </span>
            <span className="text-[10.5px] whitespace-nowrap tracking-wide transition-colors"
              style={{ color: on ? "#14181f" : "#646b76", fontFamily: "var(--font-display)" }}>
              {LABEL[id]}
              {meta?.last && <span className="ml-1 num text-[9.5px] text-faint group-hover:text-muted">{meta.last.ms}ms</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { OUTER, INNER, LABEL };
