"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { AGENTS } from "./data";
import { useReducedMotion } from "./context";
import { EASE, SectionHeader } from "./ui";

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

export default function AgentMesh() {
  const [active, setActive] = useState("scanner");
  const reduced = useReducedMotion();
  const a = AGENTS.find((x) => x.id === active)!;

  return (
    <section id="agents" aria-label="The agents" className="lp-anchor relative border-t border-(--lp-line)">
      <div className="lp-wrap py-24 sm:py-32">
        <SectionHeader
          eyebrow="The agent mesh"
          title={<>One Conductor. <span className="text-(--lp-muted)">Sixteen specialists.</span></>}
          lead="You talk to one voice. Behind it, eleven skills and five native services each do one job well and report back. Hover any agent to see what it does."
        />

        <div className="mt-14 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          {/* orbit */}
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div className="relative mx-auto aspect-square w-full max-w-[460px]">
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

              {/* Conductor */}
              <div className="absolute left-1/2 top-1/2 grid h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-(--lp-cyan)/50 bg-(--lp-cyan-soft)">
                <span className="text-center">
                  <span className="block h-2 w-2 mx-auto rounded-full bg-(--lp-cyan)" />
                  <span className="lp-eyebrow mt-1.5 block text-[8.5px] text-(--lp-cyan) sm:text-[9.5px]">Conductor</span>
                </span>
              </div>

              {AGENTS.map((ag) => {
                const p = POS[ag.id];
                const on = ag.id === active;
                const Icon = ag.icon;
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onMouseEnter={() => setActive(ag.id)}
                    onFocus={() => setActive(ag.id)}
                    onClick={() => setActive(ag.id)}
                    aria-label={`${ag.name}: ${ag.role}`}
                    aria-pressed={on}
                    className="absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-(--lp-bg) transition-[transform,background-color,border-color] duration-200 sm:h-10 sm:w-10"
                    style={{
                      left: `${p.x}%`, top: `${p.y}%`,
                      borderColor: on ? tone(ag.kind) : "var(--lp-line-2)",
                      background: on ? `color-mix(in srgb, ${tone(ag.kind)} 18%, var(--lp-bg))` : undefined,
                      transform: `translate(-50%, -50%) scale(${on ? 1.15 : 1})`,
                    }}
                  >
                    <Icon size={15} style={{ color: on ? tone(ag.kind) : "var(--lp-ink-2)" }} aria-hidden />
                  </button>
                );
              })}
            </div>

            {/* readout */}
            <div className="mx-auto mt-6 min-h-[132px] max-w-[460px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
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
          </div>

          {/* cards */}
          <div className="min-w-0 space-y-10">
            {[{ title: "11 skills", list: SKILLS, kind: "skill" as const }, { title: "5 native services", list: SERVICES, kind: "service" as const }].map((g) => (
              <div key={g.title}>
                <p className="lp-eyebrow flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone(g.kind) }} />
                  {g.title}
                </p>
                <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {g.list.map((ag, i) => {
                    const on = ag.id === active;
                    const Icon = ag.icon;
                    return (
                      <motion.li
                        key={ag.id}
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.5, ease: EASE, delay: (i % 6) * 0.04 }}
                      >
                        <button
                          type="button"
                          onMouseEnter={() => setActive(ag.id)}
                          onFocus={() => setActive(ag.id)}
                          onClick={() => setActive(ag.id)}
                          aria-pressed={on}
                          className="flex h-full w-full min-w-0 items-start gap-3 rounded-xl border p-3.5 text-left transition-colors duration-200"
                          style={{
                            borderColor: on ? tone(ag.kind) : "var(--lp-line)",
                            background: on ? `color-mix(in srgb, ${tone(ag.kind)} 7%, transparent)` : "transparent",
                          }}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-(--lp-line-2)">
                            <Icon size={15} style={{ color: tone(ag.kind) }} aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold">{ag.name}</span>
                            <span className="mt-0.5 block text-pretty text-[13px] leading-snug text-(--lp-muted)">{ag.role}</span>
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
