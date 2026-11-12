"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Beaker, Loader2, ShieldX, Sparkles } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { fmt } from "@/lib/store";

interface Stats { trades: number; win_rate: number; expectancy_r: number | null; net_return_pct: number; max_dd_pct: number;
  sharpe: number | null; profit_factor: number | null }
interface Report {
  id: string; status: string; symbol: string; rule: string; spec: Record<string, unknown>; verdict: string;
  window: { from: string; to: string; sessions: number }; stats: Stats; buy_hold: { net_return_pct: number; max_dd_pct: number };
  equity: { t: string[]; strategy: number[]; buy_hold: number[] }; gate: { passed: boolean; reasons: string[] };
  trades: { date: string; time: string; entry: number; exit: number; r: number; reason: string; pnl: number }[];
}
interface Saved { id: string; name: string; rule: string; symbol: string; status: string; algo_id: string | null;
  summary: { verdict: string; stats: Stats; gate: { passed: boolean } } }

/** Two equity curves on one SVG: the rule vs buy-and-hold, drawn left to right. */
function Curves({ eq }: { eq: Report["equity"] }) {
  const W = 640, H = 200, P = 8;
  const all = [...eq.strategy, ...eq.buy_hold];
  const lo = Math.min(...all), hi = Math.max(...all);
  const path = (ys: number[]) => ys.map((y, i) => `${i ? "L" : "M"}${(P + (i / Math.max(1, ys.length - 1)) * (W - 2 * P)).toFixed(1)},` +
    `${(H - P - ((y - lo) / Math.max(1, hi - lo)) * (H - 2 * P)).toFixed(1)}`).join(" ");
  const base = H - P - ((eq.strategy[0] - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px]" role="img" aria-label="Equity: your rule vs buy-and-hold">
      <line x1={P} x2={W - P} y1={base} y2={base} stroke="var(--line-2)" strokeDasharray="3 4" />
      <motion.path d={path(eq.buy_hold)} fill="none" stroke="var(--violet)" strokeWidth="1.6"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1 }} />
      <motion.path d={path(eq.strategy)} fill="none" stroke="var(--ink)" strokeWidth="2.2"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.15 }} />
    </svg>
  );
}

export default function StrategyLab() {
  const [text, setText] = useState("");
  const [symbol, setSymbol] = useState("RELIANCE");
  const [examples, setExamples] = useState<string[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [rep, setRep] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.get("/api/strategies").then((d) => { setSaved(d.strategies); setExamples(d.examples); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const run = async (rule = text) => {
    if (!rule.trim()) return;
    setText(rule); setBusy(true); setErr(null); setRep(null);
    try { setRep(await api.post<Report>("/api/strategies/test", { text: rule, symbol })); load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const approve = async (id: string) => {
    try { await api.post(`/api/strategies/${id}/approve`); load(); if (rep?.id === id) setRep({ ...rep, status: "approved (paper)" }); }
    catch (e) { setErr((e as Error).message); }
  };

  const tiles = useMemo(() => rep ? [
    ["Trades", String(rep.stats.trades)], ["Win rate", `${rep.stats.win_rate}%`],
    ["Expectancy", rep.stats.expectancy_r == null ? "—" : `${rep.stats.expectancy_r > 0 ? "+" : ""}${rep.stats.expectancy_r}R`],
    ["Return", `${rep.stats.net_return_pct > 0 ? "+" : ""}${rep.stats.net_return_pct}%`],
    ["Buy & hold", `${rep.buy_hold.net_return_pct > 0 ? "+" : ""}${rep.buy_hold.net_return_pct}%`],
    ["Max drawdown", `${rep.stats.max_dd_pct}%`],
  ] : [], [rep]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      <header className="min-w-0">
        <div className="label">Strategy Lab</div>
        <h1 className="display text-[clamp(1.6rem,3vw,2.2rem)] mt-1 leading-tight">Say a rule. See if it earns a place.</h1>
        <p className="text-ink-2 text-[13.5px] mt-1.5 max-w-2xl">Describe an entry, a stop and a target in plain English. Meridian turns it into a rule,
          replays it on 60 real NSE sessions with Indian charges against buy-and-hold, and only lets you approve it if it passes the edge gate.</p>
      </header>

      <section className="panel p-4 space-y-3">
        <textarea className="input !h-24 py-3 resize-none leading-relaxed" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="buy when price closes above the 20-day high with volume over 1.5x, stop 1.5 ATR, target 2R" aria-label="Rule" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-muted">Test on
            <input className="input !h-9 !w-36 num uppercase" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} /></label>
          <button className="btn btn-primary" onClick={() => run()} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Beaker size={15} />}Backtest this rule</button>
          <span className="text-[12px] text-faint">or say “build a strategy: …”</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((x) => <button key={x} className="chip !h-auto py-1 text-left leading-snug" onClick={() => run(x)}><Sparkles size={12} />{x}</button>)}
        </div>
        {err && <p className="text-[12.5px] text-coral">{err}</p>}
      </section>

      <AnimatePresence mode="wait">
        {rep && (
          <motion.section key={rep.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="panel p-4 min-w-0 space-y-4">
              <div>
                <div className="label">Rule as tested · {rep.symbol} · {rep.window.sessions} sessions</div>
                <p className="text-[14px] mt-1.5 leading-relaxed">{rep.rule}</p>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-line rounded-xl border border-line">
                {tiles.map(([k, v]) => <div key={k} className="p-3 min-w-0"><div className="label !text-[9.5px]">{k}</div>
                  <div className="num text-[17px] mt-1 truncate">{v}</div></div>)}
              </div>
              <div>
                <div className="flex gap-4 text-[11.5px] text-muted mb-1">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ink" />Your rule</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-violet" />Buy &amp; hold</span>
                </div>
                <Curves eq={rep.equity} />
              </div>
            </div>
            <aside className="space-y-4 min-w-0">
              <div className={clsx("panel p-4 border-l-4", rep.gate.passed ? "!border-l-mint" : "!border-l-coral")}>
                <div className="flex items-center gap-2 font-semibold">
                  {rep.gate.passed ? <BadgeCheck size={17} className="text-mint" /> : <ShieldX size={17} className="text-coral" />}
                  {rep.gate.passed ? "Edge gate passed" : "Rejected by the edge gate"}</div>
                <p className="text-[13px] text-ink-2 mt-2">{rep.verdict}.</p>
                {rep.gate.reasons.length > 0 && <ul className="mt-2 text-[12px] text-muted space-y-1">{rep.gate.reasons.map((r) => <li key={r}>· {r}</li>)}</ul>}
                {rep.gate.passed ? (
                  rep.status.startsWith("approved") ? <p className="mt-3 text-[12.5px] text-mint">Approved and registered as a paper algo.</p> :
                    <button className="btn btn-mint w-full mt-3" onClick={() => approve(rep.id)}>Approve for paper trading</button>
                ) : <p className="mt-3 text-[12px] text-faint">It stays a draft and can&apos;t be traded. Most rules fail: that&apos;s the point of testing.</p>}
              </div>
              <div className="panel p-4">
                <div className="label mb-2">Last trades</div>
                <ul className="text-[12px] space-y-1 max-h-[220px] scroll">
                  {rep.trades.slice(-10).reverse().map((t) => (
                    <li key={t.date + t.time} className="flex justify-between gap-2 border-t border-line pt-1 first:border-0">
                      <span className="num text-muted">{t.date.slice(5)} {t.time}</span><span className="text-ink-2">{t.reason}</span>
                      <span className={clsx("num", t.r >= 0 ? "pos" : "neg")}>{t.r > 0 ? "+" : ""}{t.r.toFixed(2)}R</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="panel p-4">
        <div className="label mb-3">Saved rules</div>
        {saved.length === 0 ? <p className="text-[12.5px] text-muted">Nothing tested yet.</p> : (
          <ul className="divide-y divide-line">
            {saved.map((s) => (
              <li key={s.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                <span className="flex-1 min-w-[240px] text-ink-2">{s.rule}</span>
                <span className="num text-muted">{s.symbol}</span>
                <span className="num">{s.summary.stats.trades} trades · {s.summary.stats.expectancy_r ?? "—"}R</span>
                <span className={clsx("chip !h-6", s.algo_id ? "!text-mint" : s.summary.gate.passed ? "!text-cyan" : "!text-coral")}>
                  {s.algo_id ?? s.status}</span>
                {s.summary.gate.passed && !s.algo_id && <button className="btn !h-7 text-[12px]" onClick={() => approve(s.id)}>Approve</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11.5px] text-faint">Same engine as the Backtest Lab: 5-minute bars, slippage, brokerage, STT, exchange, SEBI, GST and stamp duty. {fmt.usd(500000, 0)} paper capital.</p>
    </div>
  );
}
