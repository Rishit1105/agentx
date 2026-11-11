"use client";
import { motion } from "motion/react";
import { AGENTS } from "../data";

const SIZE = 300;
const C = SIZE / 2;
const SKILLS = AGENTS.filter((a) => a.kind === "skill");
const SERVICES = AGENTS.filter((a) => a.kind === "service");

export const NODES = [
  ...SKILLS.map((a, i) => {
    const ang = -Math.PI / 2 + (i / SKILLS.length) * Math.PI * 2;
    return { ...a, x: C + Math.cos(ang) * 128, y: C + Math.sin(ang) * 128 };
  }),
  ...SERVICES.map((a, i) => {
    const ang = -Math.PI / 2 + Math.PI / SERVICES.length + (i / SERVICES.length) * Math.PI * 2;
    return { ...a, x: C + Math.cos(ang) * 82, y: C + Math.sin(ang) * 82 };
  }),
];

/** The Agent Orrery as a crisp SVG: the Conductor in the middle, working agents glow and thread to it. */
export default function OrreryMock({ active, labels = true, className }: { active: string[]; labels?: boolean; className?: string }) {
  return (
    <svg viewBox={`-44 -16 ${SIZE + 88} ${SIZE + 32}`} className={className} role="img" aria-label={`Agent Orrery: ${active.length} agents working`}>
      <circle cx={C} cy={C} r={128} fill="none" stroke="var(--lp-line-2)" strokeWidth={0.8} />
      <circle cx={C} cy={C} r={82} fill="none" stroke="var(--lp-line)" strokeWidth={0.8} strokeDasharray="2 4" />

      {NODES.map((n) => {
        const on = active.includes(n.id);
        const col = n.kind === "skill" ? "var(--lp-violet)" : "var(--lp-amber)";
        return (
          <g key={n.id}>
            {on && (
              <>
                <motion.line
                  x1={n.x} y1={n.y} x2={C} y2={C}
                  stroke={col} strokeWidth={1.2}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.9 }}
                  transition={{ duration: 0.5 }}
                />
                <circle r={2.4} fill={col}>
                  <animateMotion dur="1.2s" repeatCount="indefinite" path={`M${n.x},${n.y} L${C},${C}`} />
                </circle>
              </>
            )}
          </g>
        );
      })}

      {/* the Conductor */}
      <circle cx={C} cy={C} r={30} fill="var(--lp-cyan-soft)" stroke="var(--lp-cyan)" strokeWidth={1.2} />
      <circle cx={C} cy={C} r={6} fill="var(--lp-cyan)" />
      <line x1={C - 22} x2={C + 22} y1={C} y2={C} stroke="var(--lp-cyan)" strokeWidth={0.8} opacity={0.6} />

      {NODES.map((n) => {
        const on = active.includes(n.id);
        const col = n.kind === "skill" ? "var(--lp-violet)" : "var(--lp-amber)";
        return (
          <g key={`n-${n.id}`}>
            <circle
              cx={n.x} cy={n.y} r={on ? 8 : 5.5}
              fill={on ? col : "var(--lp-surface)"}
              stroke={col} strokeWidth={1.2}
              style={{ transition: "r 300ms, fill 300ms" }}
            />
            {labels && on && (
              <motion.text
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                x={n.x} y={n.y > C ? n.y + 20 : n.y - 13}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="var(--lp-ink)"
              >
                {n.name}
              </motion.text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
