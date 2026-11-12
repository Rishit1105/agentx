"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CircleCheck, CircleX, Download, FileBadge2, HeartPulse } from "lucide-react";
import { api, CORE } from "@/lib/api";
import { useM } from "@/lib/store";

interface Summary {
  client_id: string; algo_orders: number; manual_orders: number; api_activity: Record<string, number>;
  checks: { rule: string; ok: boolean }[]; registry: { algo_id: string; label: string; version: string; params_hash: string; status: string }[];
  orders: { order_id: string; ts: string; symbol: string; algo_id: string; origin: string; mood: string | null }[];
}
interface Tilt { cooldown_s: number; reason: string | null; events: { at: string; level: string; signals: { text: string }[] }[] }

/** SEBI-style algo compliance (modelled) and the tilt guard's recent findings. */
export default function CompliancePanel() {
  const n = useM((s) => s.eventsLog.length);
  const [c, setC] = useState<Summary | null>(null);
  const [t, setT] = useState<Tilt | null>(null);
  useEffect(() => {
    api.get<Summary>("/api/compliance").then(setC).catch(() => {});
    api.get<Tilt>("/api/tilt").then(setT).catch(() => {});
  }, [n]);
  if (!c) return <div className="skeleton h-48" />;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-[17px] flex items-center gap-2"><FileBadge2 size={16} className="text-muted" />Algo compliance</h2>
          <a className="btn !h-8 text-[12px]" href={`${CORE}/api/report/compliance.pdf`} target="_blank" rel="noreferrer"><Download size={13} />Report PDF</a>
        </div>
        <p className="text-[12px] text-muted">Modelled on SEBI&apos;s retail algo framework: every algo order carries a registered algo ID and client {c.client_id},
          state-changing API calls are logged, and a new trading day revokes autopilot authority.</p>
        <ul className="space-y-1.5">
          {c.checks.map((x, i) => (
            <motion.li key={x.rule} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2 text-[12.5px]">
              {x.ok ? <CircleCheck size={15} className="text-mint shrink-0" /> : <CircleX size={15} className="text-coral shrink-0" />}{x.rule}
            </motion.li>
          ))}
        </ul>
        <div className="grid grid-cols-3 divide-x divide-line rounded-xl border border-line text-center">
          <div className="p-2.5"><div className="num text-[18px]">{c.algo_orders}</div><div className="text-[11px] text-muted">algo orders</div></div>
          <div className="p-2.5"><div className="num text-[18px]">{c.manual_orders}</div><div className="text-[11px] text-muted">manual orders</div></div>
          <div className="p-2.5"><div className="num text-[18px]">{Object.values(c.api_activity).reduce((a, b) => a + b, 0)}</div>
            <div className="text-[11px] text-muted">API calls logged</div></div>
        </div>
        <div>
          <div className="label mb-1.5">Algo registry</div>
          <ul className="text-[12px] divide-y divide-line">{c.registry.map((r) => (
            <li key={r.algo_id} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="num font-medium">{r.algo_id}</span><span className="text-ink-2 flex-1 min-w-[120px] truncate">{r.label}</span>
              <span className="num text-faint">#{r.params_hash}</span><span className="text-mint">{r.status}</span>
            </li>
          ))}</ul>
        </div>
      </section>
      <section className="panel p-4 space-y-3 min-w-0">
        <h2 className="display text-[17px] flex items-center gap-2"><HeartPulse size={16} className="text-muted" />Tilt guard</h2>
        <p className="text-[12px] text-muted">Revenge re-entry, size escalation, loss chasing and losing streaks are checked before every entry. A revenge
          pattern, or two signals together, pauses new entries for 15 minutes. Exits are never blocked.</p>
        {t?.cooldown_s ? (
          <div className="rounded-lg border border-coral/40 bg-coral/[0.06] p-3 text-[12.5px]">
            <div className="font-semibold text-coral">Cool-down: {Math.ceil(t.cooldown_s / 60)} min left</div>
            <div className="text-ink-2 mt-0.5">{t.reason}</div>
          </div>
        ) : <div className="rounded-lg border border-mint/40 bg-mint/[0.06] p-3 text-[12.5px] text-mint">No cool-down active.</div>}
        <ul className="space-y-2">
          {(t?.events ?? []).slice().reverse().map((e, i) => (
            <li key={i} className="text-[12px] border-t border-line pt-2 first:border-0 first:pt-0">
              <span className="num text-muted mr-2">{e.at.slice(11, 16)}</span>
              <span className={e.level === "cooldown" ? "text-coral" : "text-amber"}>{e.level}</span>
              <div className="text-ink-2">{e.signals.map((s) => s.text).join("; ")}</div>
            </li>
          ))}
          {!t?.events.length && <li className="text-[12px] text-faint">No tilt signals this session.</li>}
        </ul>
        {c.orders.length > 0 && (
          <div>
            <div className="label mb-1.5">Tagged orders</div>
            <ul className="text-[12px] divide-y divide-line">{c.orders.slice(-6).reverse().map((o) => (
              <li key={o.order_id} className="py-1.5 flex flex-wrap gap-x-3">
                <span className="num text-muted">{o.ts.slice(11, 16)}</span><span className="font-medium">{o.symbol}</span>
                <span className="num">{o.algo_id}</span><span className="text-muted">{o.origin}</span>
                {o.mood && <span className="chip !h-5 text-[11px]">{o.mood}</span>}
              </li>
            ))}</ul>
          </div>
        )}
      </section>
    </div>
  );
}
