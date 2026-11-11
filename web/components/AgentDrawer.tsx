"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Terminal } from "lucide-react";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";
import { LABEL } from "./Orrery";

const ROLE: Record<string, string> = {
  scanner: "Scans the NIFTY 500 (or ~2,000 NSE equities) for opening-range breakouts and daily patterns.",
  news: "Google News India headlines for each NSE company, tagged by what moves price (earnings, deal…).",
  entry: "Watches a setup bar by bar: waiting / triggered / expired.",
  exit: "Sets the stop and target before entry, and the flat-by time.",
  timemachine: "10,000 Monte-Carlo sessions from the stock's own bars + every past day the rule fired.",
  budget: "Whole-share sizing: the smallest of max-loss, position cap, max order and cash wins.",
  risk: "PASS / BLOCK per order against every limit; verdicts are fingerprinted per exact order.",
  broker: "Renders the ticket for the NSE paper account, records the user's explicit yes, logs results and fills.",
  alerts: "NSE clock (official holiday list), delayed quotes, stop/target/time rules that ring once.",
  analyst: "Quarterly results in ₹ crore (revenue, EPS, margins, growth), Indian fiscal quarters.",
  deals: "NSE bulk & block deals: large disclosed trades, flagged once. Information, not signals.",
  strategist: "Scores ORB / level / bounce on regime features + backtest evidence; adapts intraday.",
  backtester: "Replays the rule on 60 sessions with costs vs buy-and-hold and the NIFTY 50; applies the edge gate.",
  journalist: "Writes a Story for every trade, skip, block and halt; numbers validated against evidence.",
  sentinel: "Kill-switch state machine and live circuit breakers. Works without the LLM.",
  exchange: "Paper matching engine: market fills, bracket/OCO legs, gap-through stops, Indian intraday charges (brokerage, STT, exchange, SEBI, GST, stamp), P&L.",
};

export default function AgentDrawer() {
  const id = useM((s) => s.drawerAgent);
  const set = useM((s) => s.set);
  const active = useM((s) => (id ? s.active[id] : null));
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!id) return;
    setData(null);
    api.get(`/api/agents/${id}`).then((d) => setData(d.last)).catch(() => setData(null));
  }, [id, active]);
  return (
    <AnimatePresence>
      {id && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => set({ drawerAgent: null })} />
          <motion.aside role="dialog" aria-label={`${LABEL[id]} agent`} className="fixed right-0 top-0 bottom-0 z-50 w-[520px] max-w-full panel !rounded-none !border-y-0 !border-r-0 flex flex-col"
            initial={{ x: 560 }} animate={{ x: 0 }} exit={{ x: 560 }} transition={{ type: "spring", stiffness: 380, damping: 40 }}>
            <div className="flex items-start justify-between p-5 border-b border-line">
              <div>
                <div className="label">{["strategist", "backtester", "journalist", "sentinel", "exchange"].includes(id) ? "Meridian-native service" : "day-trader-skill worker"}</div>
                <h2 className="display text-2xl mt-1">{LABEL[id]}</h2>
                <p className="text-[13px] text-ink-2 mt-2 max-w-[420px]">{ROLE[id]}</p>
              </div>
              <button onClick={() => set({ drawerAgent: null })} className="text-muted hover:text-ink" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="flex-1 scroll p-5 space-y-4">
              {!data && <p className="text-muted text-sm">No result yet in this session. Ask Meridian something that needs this worker.</p>}
              {data && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-[12px]">
                    <div className="panel !rounded-lg p-3"><div className="label">Tool</div><div className="num mt-1">{data.tool}</div></div>
                    <div className="panel !rounded-lg p-3"><div className="label">Status</div>
                      <div className={`num mt-1 ${data.status === "error" ? "neg" : data.status === "blocked" ? "text-amber" : "pos"}`}>{data.status}</div></div>
                    <div className="panel !rounded-lg p-3"><div className="label">Latency</div><div className="num mt-1">{data.ms} ms</div></div>
                  </div>
                  {data.argv && (
                    <div className="rounded-lg bg-ink/30 border border-line p-3 text-[11.5px] num text-ink-2 break-all">
                      <Terminal size={12} className="inline mr-2 text-cyan" />python -I {data.argv.map((a: string) => a.replace(/.*vendor[\\/]day-trader-skill(-in)?[\\/]/, "").replace(/.*replay[\\/]fixtures-in[\\/]/, "replay/")).join(" ")}
                    </div>
                  )}
                  {data.files?.length > 0 && <div className="flex flex-wrap gap-1.5">{data.files.map((f: string) => <span key={f} className="chip num !text-[11px]">{f}</span>)}</div>}
                  <pre className="rounded-lg bg-ink/30 border border-line p-3 text-[11px] num text-ink-2 overflow-auto max-h-[52vh] scroll whitespace-pre-wrap">
                    {data.data ? JSON.stringify(data.data, null, 2).slice(0, 12000) : data.text || "(no output)"}</pre>
                  <div className="text-[11px] text-faint">at {data.at}</div>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
