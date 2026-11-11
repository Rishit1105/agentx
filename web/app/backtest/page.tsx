"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { FileDown, Loader2, Scale, Volume2 } from "lucide-react";
import clsx from "clsx";
import EquityChart from "@/components/EquityChart";
import { useQueryParam } from "@/lib/hooks";
import { api, CORE } from "@/lib/api";
import { fmt, useM } from "@/lib/store";

const STRATS = [["orb", "Opening-range breakout"], ["level", "Level breakout"], ["bounce", "Oversold bounce"]];

function Tile({ k, v, hold, good, suffix = "" }: { k: string; v: any; hold?: any; good?: boolean | null; suffix?: string }) {
  return (
    <div className="panel p-4">
      <div className="label">{k}</div>
      <div className={clsx("display text-[26px] num mt-1", good === true ? "pos" : good === false ? "neg" : "")}>{v ?? "—"}{v != null ? suffix : ""}</div>
      {hold !== undefined && <div className="text-[11.5px] text-muted mt-0.5">Buy & hold <span className="num text-ink-2">{hold ?? "—"}{hold != null ? suffix : ""}</span></div>}
    </div>
  );
}

function RHist({ data }: { data: { r: number; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="flex items-end gap-1.5 h-36 pt-2">
      {data.map((d) => (
        <div key={d.r} className="flex-1 flex flex-col items-center gap-1" title={`${d.n} trades at ${d.r}R`}>
          <span className="num text-[10px] text-muted">{d.n}</span>
          <motion.div className="w-full rounded-t-md" initial={{ height: 0 }} animate={{ height: `${(d.n / max) * 100}px` }}
            style={{ background: d.r >= 0 ? "linear-gradient(180deg,#3ddc97,#3ddc9744)" : "linear-gradient(180deg,#ff5c6c,#ff5c6c44)" }} />
          <span className="num text-[10px] text-faint">{d.r > 0 ? "+" : ""}{d.r}</span>
        </div>
      ))}
    </div>
  );
}

function Lab() {
  const v = useM((s) => s.backtestV);
  const qs = useQueryParam("symbol");
  const [symbol, setSymbol] = useState("ETERNAL");
  const [strategy, setStrategy] = useState("orb");
  const [rep, setRep] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (qs) setSymbol(qs.toUpperCase()); }, [qs]);
  useEffect(() => {
    setBusy(true);
    api.get(`/api/backtest/${symbol}?strategy=${strategy}`).then(setRep).catch((e) => setRep({ error: e.message })).finally(() => setBusy(false));
  }, [symbol, strategy, v]);
  const st = rep?.strategy_stats, bh = rep?.buy_hold, spy = rep?.index_hold;
  const passed = rep?.gate?.passed;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div><div className="label">Backtest Lab</div>
          <h1 className="display text-3xl mt-1">{symbol} <span className="text-muted text-lg">vs buy-and-hold{spy ? " vs NIFTY 50" : ""}</span></h1>
          {rep?.window && <p className="text-[12.5px] text-muted mt-1 num">{rep.window.from} → {rep.window.to} · {rep.window.sessions} NSE sessions of 5-minute bars ·
            Indian intraday charges (brokerage, STT, exchange, SEBI, GST, stamp) + {rep.costs?.slippage_bps ?? 2} bp slippage · capital {fmt.usd(rep.capital, 0)}</p>}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded-full border border-line-2 p-0.5">
            {STRATS.map(([id, label]) => (
              <button key={id} onClick={() => setStrategy(id)} className={clsx("px-3 h-8 rounded-full text-[12px]", strategy === id ? "bg-cyan/15 text-cyan" : "text-muted hover:text-ink")}>{label}</button>
            ))}
          </div>
          <input className="input !h-9 !w-24 num uppercase" defaultValue={symbol} onKeyDown={(e) => { if (e.key === "Enter") setSymbol((e.target as HTMLInputElement).value.toUpperCase()); }}
            aria-label="Symbol" />
          <a className="btn" href={`${CORE}/api/report/${symbol}.pdf?strategy=${strategy}`} target="_blank"><FileDown size={15} />PDF</a>
        </div>
      </div>

      {busy && !rep && <div className="grid grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>}
      {rep?.error && <div className="panel p-6 text-amber">{rep.error}</div>}
      {st && (
        <>
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className={clsx("panel p-5 flex gap-4 items-start", passed ? "!border-mint/40" : "!border-amber/40")}>
            <span className={clsx("h-11 w-11 rounded-xl grid place-items-center shrink-0", passed ? "bg-mint/15 text-mint" : "bg-amber/15 text-amber")}><Scale size={20} /></span>
            <div className="flex-1 min-w-0">
              <div className="label">Honest verdict {passed ? "· edge gate passed" : "· edge gate not passed"}</div>
              <p className="display text-[20px] mt-1 leading-snug">{rep.verdict}</p>
              {!passed && <ul className="mt-2 text-[12.5px] text-ink-2 list-disc ml-5 space-y-0.5">{rep.gate.reasons.map((r: string) => <li key={r}>{r}</li>)}</ul>}
              <p className="text-[11.5px] text-muted mt-2">Edge is claimed only with ≥ {rep.gate.min_trades} trades, positive expectancy after costs, and a drawdown-adjusted
                return that beats buy-and-hold. Confirm segment (last {rep.confirm_segment.sessions} sessions, never tuned on):
                {" "}{rep.confirm_segment.trades} trades, {rep.confirm_segment.expectancy_r == null ? "—" : fmt.sgn(rep.confirm_segment.expectancy_r, 3) + "R"}.</p>
            </div>
            <button className="btn" onClick={() => api.post("/api/tts/speak", { text: `Verdict for ${symbol}: ${rep.verdict}.` })}><Volume2 size={15} />Read</button>
          </motion.section>

          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <Tile k="Net return" v={fmt.sgn(st.net_return_pct)} suffix="%" hold={fmt.sgn(bh.net_return_pct)} good={st.net_return_pct > (bh.net_return_pct ?? 0)} />
            <Tile k="Sharpe (ann.)" v={st.sharpe} hold={bh.sharpe} />
            <Tile k="Max drawdown" v={st.max_dd_pct?.toFixed(2)} suffix="%" hold={bh.max_dd_pct?.toFixed(2)} />
            <Tile k="Win rate" v={st.win_rate} suffix="%" />
            <Tile k="Profit factor" v={st.profit_factor} />
            <Tile k="Expectancy" v={st.expectancy_r == null ? null : fmt.sgn(st.expectancy_r, 3)} suffix="R" good={st.expectancy_r > 0} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <section className="panel p-4">
              <div className="flex items-center justify-between mb-2"><span className="label">Equity · same start capital</span>
                <span className="flex gap-3 text-[11.5px]"><span className="text-cyan">● Meridian</span><span className="text-violet">● Buy & hold</span>
                  {spy && <span className="text-mint">┄ NIFTY 50</span>}</span></div>
              <EquityChart eq={rep.equity} />
              <p className="text-[11px] text-faint mt-1">{rep.data_note}. Underwater curve below shows the strategy's drawdown.</p>
            </section>
            <section className="panel p-4">
              <div className="label">R-multiple distribution</div>
              <RHist data={rep.r_hist} />
              <div className="grid grid-cols-3 text-center text-[12px] mt-3">
                <div><div className="num text-mint text-lg">{st.targets}</div><div className="text-muted">targets</div></div>
                <div><div className="num text-coral text-lg">{st.stops}</div><div className="text-muted">stops</div></div>
                <div><div className="num text-ink-2 text-lg">{st.closes}</div><div className="text-muted">flat-by</div></div>
              </div>
              <div className="mt-4 text-[12px] text-muted">Time in market <span className="num text-ink">{st.time_in_market_pct}%</span> · worst day
                <span className="num text-ink"> {fmt.usd(st.worst_day)}</span></div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
            <section className="panel p-4">
              <div className="label mb-3">Strategy tournament · selection segment</div>
              <table className="w-full text-[12px]">
                <thead className="text-muted"><tr><th className="text-left font-normal pb-2">Params</th><th className="text-right font-normal">Trades</th>
                  <th className="text-right font-normal">Exp. R</th><th className="text-right font-normal">Net %</th></tr></thead>
                <tbody>{rep.tournament.map((t: any) => {
                  const chosen = JSON.stringify(t.params) === JSON.stringify(rep.strategy.params);
                  return (<tr key={JSON.stringify(t.params)} className={clsx("border-t border-line", chosen && "text-cyan")}>
                    <td className="py-1.5 num">{Object.entries(t.params).map(([k, v]) => `${k}=${v}`).join(" ")}{chosen ? " ◂" : ""}</td>
                    <td className="text-right num">{t.trades}</td><td className="text-right num">{t.expectancy_r == null ? "—" : fmt.sgn(t.expectancy_r, 3)}</td>
                    <td className="text-right num">{fmt.sgn(t.net_return_pct)}</td></tr>);
                })}</tbody>
              </table>
              <p className="text-[11px] text-faint mt-3">Grid ≤ 6 combinations, chronological split. Live plans use the documented defaults.</p>
            </section>
            <section className="panel p-4 min-w-0">
              <div className="label mb-3">Trades ({rep.trades.length})</div>
              <div className="max-h-[320px] scroll">
                <table className="w-full text-[12px]">
                  <thead className="text-muted sticky top-0 bg-panel"><tr>{["Date", "Time", "Entry", "Stop", "Target", "Exit", "Qty", "P&L", "R", "Reason"].map((h) =>
                    <th key={h} className="text-right first:text-left font-normal pb-2">{h}</th>)}</tr></thead>
                  <tbody>{rep.trades.map((t: any, i: number) => (
                    <tr key={i} className="border-t border-line num">
                      <td className="py-1.5">{t.date}</td><td className="text-right">{t.time}</td><td className="text-right">{t.entry.toFixed(2)}</td>
                      <td className="text-right text-coral/80">{t.stop.toFixed(2)}</td><td className="text-right text-mint/80">{t.target.toFixed(2)}</td>
                      <td className="text-right">{t.exit.toFixed(2)}</td><td className="text-right">{t.qty}</td>
                      <td className={clsx("text-right", t.pnl >= 0 ? "pos" : "neg")}>{fmt.usd(t.pnl)}</td>
                      <td className={clsx("text-right", t.r >= 0 ? "pos" : "neg")}>{fmt.sgn(t.r)}</td>
                      <td className="text-right"><span className={clsx("chip !h-5 !text-[10px]", t.reason === "target" ? "!text-mint" : t.reason === "stop" ? "!text-coral" : "")}>{t.reason}</span></td>
                    </tr>))}</tbody>
                </table>
              </div>
            </section>
          </div>
          <p className="text-[11px] text-faint">Simulated results on historical NSE data. Not investment advice. SEBI's studies found most individual intraday traders lose money; backtests do not predict the future.</p>
        </>
      )}
      {busy && rep && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 chip"><Loader2 size={13} className="animate-spin" />Running backtest…</div>}
    </div>
  );
}

export default function Page() {
  return <Lab />;
}
