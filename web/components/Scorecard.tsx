"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Award, Brain, Clock3, FileCheck2, Scale, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";

interface Pillar { score: number; label: string; detail: string }
interface Card {
  score: number; grade: string; headline: string; avg_r: number; pnl: number;
  pillars: Record<string, Pillar>; counts: Record<string, number>;
}

const ICON: Record<string, typeof Brain> = { plan: Target, risk: Scale, patience: Clock3, explain: FileCheck2, outcome: Award };
const tone = (v: number) => (v >= 85 ? "var(--mint)" : v >= 65 ? "var(--cyan)" : v >= 45 ? "var(--amber)" : "var(--coral)");

function Ring({ value, grade }: { value: number; grade: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <motion.circle cx="66" cy="66" r={r} fill="none" stroke={tone(value)} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1.2, ease: [0.2, 0.7, 0.2, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="display text-[34px] leading-none font-semibold" style={{ color: tone(value) }}>{grade}</div>
          <div className="num text-[12px] text-muted mt-1">{value}/100</div>
        </div>
      </div>
    </div>
  );
}

export default function Scorecard() {
  const v = useM((s) => s.storiesV);
  const [card, setCard] = useState<Card | null>(null);
  useEffect(() => { api.get<Card>("/api/scorecard").then(setCard).catch(() => {}); }, [v]);
  if (!card) return <div className="skeleton h-[170px]" />;
  return (
    <section className="panel p-4 md:p-5 flex flex-col md:flex-row gap-5 md:items-center" aria-label="Discipline scorecard">
      <div className="flex items-center gap-4 md:w-[340px] shrink-0 min-w-0">
        <Ring value={card.score} grade={card.grade} />
        <div className="min-w-0">
          <div className="label flex items-center gap-1.5"><Brain size={12} />Discipline scorecard</div>
          <p className="text-[13.5px] text-ink mt-1.5 leading-relaxed">{card.headline}</p>
          <p className="text-[12px] text-muted mt-1">Graded on behaviour, not just P&amp;L.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 flex-1 min-w-0">
        {Object.entries(card.pillars).map(([k, p], i) => {
          const Icon = ICON[k] ?? Brain;
          return (
            <div key={k} className="min-w-0 rounded-xl border border-line bg-ink/[0.02] p-3" title={p.detail}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12px] text-ink-2 min-w-0"><Icon size={13} className="shrink-0" />
                  <span className="truncate">{p.label}</span></span>
                <span className="num text-[13px]" style={{ color: tone(p.score) }}>{p.score}</span>
              </div>
              <div className="h-1.5 rounded-full bg-line mt-2 overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ background: tone(p.score) }} initial={{ width: 0 }}
                  animate={{ width: `${p.score}%` }} transition={{ duration: 0.9, delay: 0.1 + i * 0.08 }} />
              </div>
              <p className="text-[11.5px] text-muted mt-2 leading-snug line-clamp-3">{p.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
