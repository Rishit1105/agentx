"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check, CircleDashed, Loader2, ShieldCheck, ShieldX, Play, Info } from "lucide-react";
import clsx from "clsx";
import CandleChart from "@/components/CandleChart";
import TimeMachineFan from "@/components/TimeMachineFan";
import WhatIfPanel from "@/components/WhatIfPanel";
import { useQueryParam } from "@/lib/hooks";
import { api } from "@/lib/api";
import { ticketAction } from "@/lib/ticket";
import { fmt, useM } from "@/lib/store";

/** IST wall time -> epoch seconds (India has no daylight saving: UTC+5:30). */
function etEpoch(date: string, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m) / 1000 - 5.5 * 3600;
}
const to24 = (s: string) => { const m = s.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!m) return s; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`; };

function Stepper() {
  const pipe = useM((s) => s.pipeline);
  return (
    <div className="panel p-3 overflow-x-auto scroll">
      <ol className="flex items-stretch min-w-[860px]">
        {pipe.steps.map((s, i) => {
          const done = s.status === "done", run = s.status === "running", bad = s.status === "blocked" || s.status === "error",
            wait = s.status === "waiting", skip = s.status === "skipped";
          const col = done ? "#0e9f6e" : run ? "#0a7ea4" : bad ? "#e5484d" : wait ? "#b7790b" : "#c9c5bb";
          return (
            <li key={s.step} className="flex-1 flex items-center min-w-0" title={s.detail}>
              <div className="flex flex-col items-center gap-1.5 px-1 min-w-0 flex-1">
                <span className="h-7 w-7 rounded-full grid place-items-center border text-[11px] num transition-all"
                  style={{ borderColor: col, color: done || run ? "#ffffff" : col, background: done ? col : run ? col : "transparent",
                    boxShadow: run ? `0 0 16px ${col}` : "none" }}>
                  {done ? <Check size={14} /> : run ? <Loader2 size={13} className="animate-spin" /> : skip ? "–" : s.step}</span>
                <span className="text-[11px] tracking-wide" style={{ color: s.status === "idle" ? "#646b76" : "#14181f" }}>{s.name}</span>
                <span className="text-[10px] text-muted truncate max-w-full text-center px-1">{s.detail || " "}</span>
              </div>
              {i < pipe.steps.length - 1 && <span className="h-px w-4 shrink-0" style={{ background: done ? "#0e9f6e66" : "#e7e4dc" }} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function OddsBars({ odds }: { odds: { target?: number; stop?: number; open?: number } }) {
  const rows = [["Target first", odds.target, "#0e9f6e"], ["Stop first", odds.stop, "#e5484d"], ["Still open at close", odds.open, "#646b76"]] as const;
  return (
    <div className="space-y-2">
      {rows.map(([k, v, c]) => (
        <div key={k}>
          <div className="flex justify-between text-[12px]"><span className="text-ink-2">{k}</span><span className="num">{v == null ? "—" : (v * 100).toFixed(1) + "%"}</span></div>
          <div className="h-1.5 rounded-full bg-ink/5 mt-1 overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${(v ?? 0) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Studio() {
  const ticket = useM((s) => s.st?.ticket);
  const pipe = useM((s) => s.pipeline);
  const tmEvt = useM((s) => s.tm);
  const stratEvt = useM((s) => s.strategy);
  const qs = useQueryParam("symbol");
  const symbol = (qs || ticket?.symbol || pipe.symbol || "RELIANCE").toUpperCase();
  const names = useM((s) => s.st?.names) || {};
  const [tm, setTm] = useState<any>(null);
  const [strat, setStrat] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/api/timemachine").then(setTm).catch(() => {}); }, [tmEvt, ticket?.fingerprint]);
  useEffect(() => { api.get("/api/strategy").then(setStrat).catch(() => {}); }, [stratEvt]);
  const plan = tm?.plan?.symbol === symbol ? tm.plan : null;
  const levels = useMemo(() => ({
    entry: ticket?.symbol === symbol ? ticket.entry : plan?.entry, stop: ticket?.symbol === symbol ? ticket.stop : plan?.stop,
    target: ticket?.symbol === symbol ? ticket.target : plan?.target, orHigh: plan?.opening_range?.high, orLow: plan?.opening_range?.low,
    entryT: plan ? (() => { const e = etEpoch(plan.date, to24(plan.entry_time)); return e ? e - 300 : undefined; })() : undefined,
  }), [ticket, plan, symbol]);
  const ranked = strat?.symbol === symbol ? strat.ranked : null;
  const run = async () => { setBusy(true); try { await api.chat(`plan a trade on ${symbol}`); } finally { setBusy(false); } };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div><div className="label">Trade Studio</div>
          <h1 className="display text-3xl mt-1">{symbol} <span className="text-ink-2 text-base font-normal">{names[symbol] || ""}</span> <span className="text-muted text-lg">· {ticket?.symbol === symbol ? ticket.strategy_label : ranked ? ranked[0]?.label : "plan a trade"}</span></h1></div>
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          Run the lifecycle on {symbol}</button>
      </div>
      <Stepper />
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4 min-w-0">
          <section className="panel p-3">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="label">5-minute bars · NSE · India time (IST)</span>
              <span className="text-[11px] text-faint flex items-center gap-1"><Info size={12} />real recorded NSE bars · flat grey bars are Yahoo gaps carried forward</span>
            </div>
            <CandleChart symbol={symbol} levels={levels} />
          </section>
          {ticket && ticket.symbol === symbol && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel p-4 flex flex-wrap items-center gap-5 !border-amber/40">
              <div className="min-w-0 flex-1">
                <div className="label !text-amber">Order ticket · waiting for your yes</div>
                <div className="text-[15px] mt-1.5 leading-snug">{ticket.plain}</div>
                <div className="text-[12px] text-muted mt-1">Spoken script: “Say <span className="text-ink">{ticket.say}</span> to place it.” · fingerprint <span className="num">{ticket.fingerprint}</span></div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-mint !h-12 !px-6 !text-[15px]" onClick={() => ticketAction(ticket.index, "approve")}>“{ticket.say}”</button>
                <button className="btn !h-12" onClick={() => ticketAction(ticket.index, "decline")}>No</button>
              </div>
            </motion.section>
          )}
          {ranked && (
            <section className="panel p-4">
              <div className="label mb-3">Strategist · ranked for today</div>
              <div className="grid gap-2 md:grid-cols-3">
                {ranked.map((r: any, i: number) => (
                  <div key={r.id} className={clsx("rounded-xl border p-3", i === 0 && r.gate ? "border-cyan/40 bg-cyan/5" : "border-line")}>
                    <div className="flex justify-between items-center"><span className="text-[13px] font-semibold">{r.label}</span>
                      <span className="num text-[12px]" style={{ color: r.gate ? "#0a7ea4" : "#646b76" }}>{fmt.sgn(r.score)}</span></div>
                    <div className="text-[11.5px] text-muted mt-1">{r.trades} past signals · expectancy {r.expectancy_r == null ? "—" : fmt.sgn(r.expectancy_r, 3) + "R"}</div>
                    <div className="text-[11.5px] mt-2 text-ink-2">{r.gate ? (r.fit_reasons.join(" · ") || "fits") : <span className="text-coral">{r.gate_reason}</span>}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="space-y-4 min-w-0">
          <WhatIfPanel symbol={symbol} />
          <section className="panel p-4">
            <div className="flex justify-between"><span className="label">Time Machine</span>
              <span className="text-[11px] text-faint num">{tm?.mc ? `${tm.mc.replays.toLocaleString()} replays · seed ${tm.mc.seed}` : ""}</span></div>
            {plan && tm?.mc ? (
              <>
                <div className="mt-3"><TimeMachineFan bands={tm.mc.bands} entry={plan.entry} stop={plan.stop} target={plan.target} /></div>
                <div className="mt-3"><OddsBars odds={{ target: tm.mc.p_target, stop: tm.mc.p_stop, open: tm.mc.p_neither }} /></div>
                <p className="text-[12.5px] mt-3 text-amber">{tm.verdict}</p>
                {tm.history && <p className="text-[11.5px] text-muted mt-1">Same rule on {tm.history.sessions} real sessions: fired {tm.history.triggered}×,
                  {" "}{tm.history.target} target, {tm.history.stop} stop, {tm.history.close} neither.</p>}
              </>
            ) : <p className="text-[12.5px] text-muted mt-3">Runs during the Test step of a plan.</p>}
          </section>
          <section className="panel p-4">
            <div className="label">Sizing ledger</div>
            {ticket?.symbol === symbol ? (
              <div className="mt-3 space-y-1.5">
                {ticket.sizing_limits.map((l) => (
                  <div key={l.name} className={clsx("flex items-center gap-2 text-[12.5px] rounded-lg px-2.5 py-2", l.binds ? "bg-cyan/10 border border-cyan/30" : "")}>
                    <span className="flex-1 min-w-0"><span className="capitalize">{l.name}</span>
                      <span className="block text-[11px] text-muted truncate">{l.how}</span></span>
                    <span className="num text-[15px]">{l.shares}</span>
                    {l.binds && <span className="text-[9.5px] tracking-[0.14em] text-cyan font-semibold">BINDS</span>}
                  </div>
                ))}
                <div className="text-[12px] text-muted pt-1">Result: <span className="text-ink">BUY {ticket.qty} {ticket.symbol}</span> = <span className="num">{fmt.usd(ticket.value)}</span>;
                  loss at stop <span className="num text-ink">{fmt.usd(ticket.max_loss)}</span></div>
              </div>
            ) : <p className="text-[12.5px] text-muted mt-3">Appears at the Size step.</p>}
          </section>
          <section className="panel p-4">
            <div className="label">Risk gate</div>
            {ticket?.symbol === symbol ? (
              <ul className="mt-3 space-y-2">
                <li className="flex gap-2 text-[12.5px] text-mint"><ShieldCheck size={16} className="shrink-0" />PASS — verdict fingerprinted to this exact order</li>
                {ticket.risk_info.map((x) => <li key={x} className="flex gap-2 text-[12px] text-ink-2"><Check size={14} className="text-mint shrink-0 mt-0.5" />{x}</li>)}
                <li className="flex gap-2 text-[12px] text-ink-2"><Check size={14} className="text-mint shrink-0 mt-0.5" />Stop required · long only · no options, margin or shorts</li>
              </ul>
            ) : pipe.steps[7]?.status === "blocked" ? (
              <p className="mt-3 flex gap-2 text-[12.5px] text-coral"><ShieldX size={16} className="shrink-0" />{pipe.steps[7].detail}</p>
            ) : <p className="text-[12.5px] text-muted mt-3 flex gap-2"><CircleDashed size={15} />Checks run at the Gate step.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Page() {
  return <Studio />;
}
