"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AGENTS } from "../data";
import { useReducedMotion } from "../context";
import { EASE, fadeUp, stagger } from "../ui";

const SKILLS = AGENTS.filter((a) => a.kind === "skill");
const SERVICES = AGENTS.filter((a) => a.kind === "service");
const POS: Record<string, { x: number; y: number }> = {};
SKILLS.forEach((a, i) => {
  const t = -Math.PI / 2 + (i / SKILLS.length) * Math.PI * 2;
  POS[a.id] = { x: 50 + Math.cos(t) * 42, y: 50 + Math.sin(t) * 42 };
});
SERVICES.forEach((a, i) => {
  const t = -Math.PI / 2 + Math.PI / SERVICES.length + (i / SERVICES.length) * Math.PI * 2;
  POS[a.id] = { x: 50 + Math.cos(t) * 25, y: 50 + Math.sin(t) * 25 };
});

const tone = (kind: "skill" | "service") => (kind === "skill" ? "var(--lp-violet)" : "var(--lp-amber)");

/** The Conductor at the centre, eleven skills on the outer ring and five services on the inner one. */
function Orbit({ active, onPick }: { active: string; onPick: (id: string) => void }) {
  const reduced = useReducedMotion();
  const a = AGENTS.find((x) => x.id === active)!;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px] lg:max-w-[380px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--lp-line-2)" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="25" fill="none" stroke="var(--lp-line)" strokeWidth="0.25" strokeDasharray="0.8 1.4" />
        {AGENTS.map((ag) => {
          const p = POS[ag.id];
          const on = ag.id === active;
          return (
            <line
              key={ag.id}
              x1="50" y1="50" x2={p.x} y2={p.y}
              stroke={on ? tone(ag.kind) : "var(--lp-line-2)"}
              strokeWidth={on ? 0.45 : 0.2}
              className={clsx(!reduced && "lp-dash")}
              style={{ transition: "stroke 250ms" }}
            />
          );
        })}
        {!reduced && (
          <circle r="0.9" fill={tone(a.kind)}>
            <animateMotion key={active} dur="1.4s" repeatCount="indefinite" path={`M${POS[active].x},${POS[active].y} L50,50`} />
          </circle>
        )}
      </svg>

      <div className="absolute left-1/2 top-1/2 grid h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-(--lp-cyan)/50 bg-(--lp-cyan-soft)">
        <span className="text-center">
          <span className="mx-auto block h-2 w-2 rounded-full bg-(--lp-cyan)" />
          <span className="lp-eyebrow mt-1.5 block text-[8.5px] text-(--lp-cyan) sm:text-[9.5px]">Conductor</span>
        </span>
      </div>

      {AGENTS.map((ag, i) => {
        const p = POS[ag.id];
        const on = ag.id === active;
        const Icon = ag.icon;
        return (
          <motion.button
            key={ag.id}
            type="button"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: on ? 1.15 : 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 20, delay: reduced ? 0 : i * 0.025 }}
            onMouseEnter={() => onPick(ag.id)}
            onFocus={() => onPick(ag.id)}
            onClick={() => onPick(ag.id)}
            aria-label={`${ag.name}: ${ag.role}`}
            aria-pressed={on}
            className="absolute -ml-[18px] -mt-[18px] grid h-9 w-9 place-items-center rounded-full border bg-(--lp-surface) shadow-[0_1px_2px_rgba(20,24,31,0.06)] transition-colors duration-200 sm:-ml-5 sm:-mt-5 sm:h-10 sm:w-10"
            style={{
              left: `${p.x}%`, top: `${p.y}%`,
              borderColor: on ? tone(ag.kind) : "var(--lp-line-2)",
              background: on ? `color-mix(in srgb, ${tone(ag.kind)} 12%, var(--lp-surface))` : undefined,
            }}
          >
            <Icon size={15} style={{ color: on ? tone(ag.kind) : "var(--lp-ink-2)" }} aria-hidden />
          </motion.button>
        );
      })}
    </div>
  );
}

/** Agents tab: hover the orbit or a chip and the readout explains that agent. */
export default function AgentsPanel() {
  const [active, setActive] = useState("scanner");
  const a = AGENTS.find((x) => x.id === active)!;

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
      <Orbit active={active} onPick={setActive} />

      <div className="min-w-0">
        <div className="min-h-[124px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="lp-card p-5"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[17px] font-semibold tracking-[-0.01em]">{a.name}</span>
                <span className="lp-eyebrow text-[10px]" style={{ color: tone(a.kind) }}>
                  {a.kind === "skill" ? "Skill" : "Native service"}
                </span>
              </div>
              <p className="mt-2 text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">{a.detail}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {[{ title: "11 skills", list: SKILLS, kind: "skill" as const }, { title: "5 native services", list: SERVICES, kind: "service" as const }].map((g) => (
          <div key={g.title} className="mt-5">
            <p className="lp-eyebrow flex items-center gap-2 text-[10.5px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone(g.kind) }} />
              {g.title}
            </p>
            <motion.ul initial="hidden" animate="show" variants={stagger(0.03, 0.1)} className="mt-2.5 flex flex-wrap gap-1.5">
              {g.list.map((ag) => {
                const on = ag.id === active;
                const Icon = ag.icon;
                return (
                  <motion.li key={ag.id} variants={fadeUp}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(ag.id)}
                      onFocus={() => setActive(ag.id)}
                      onClick={() => setActive(ag.id)}
                      aria-pressed={on}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors duration-200"
                      style={{
                        borderColor: on ? tone(ag.kind) : "var(--lp-line)",
                        background: on ? `color-mix(in srgb, ${tone(ag.kind)} 8%, var(--lp-surface))` : "var(--lp-surface)",
                        color: on ? "var(--lp-ink)" : "var(--lp-ink-2)",
                      }}
                    >
                      <Icon size={13} style={{ color: tone(ag.kind) }} aria-hidden />
                      {ag.name}
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
          </div>
        ))}
      </div>
    </div>
  );
}
