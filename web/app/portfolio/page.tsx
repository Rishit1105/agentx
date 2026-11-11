"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { fmt, useM } from "@/lib/store";

interface Holding { symbol: string; name: string; sector: string; qty: number; avg_price: number; last: number; value: number; cost: number;
  unrealized: number; unrealized_pct: number; weight_pct: number; stop: number | null; target: number | null; r_now: number | null;
  story_id?: string; setup?: string }
interface Portfolio {
  account: { cash: number; equity: number; start: number; realized: number; unrealized: number; fees: number; day_pnl: number;
    day_pnl_pct: number; peak: number; drawdown_pct: number; open_orders: number; positions: number };
  holdings: Holding[]; invested: number; invested_pct: number; cash_pct: number; total_return_pct: number;
  sectors: { sector: string; value: number; pct: number }[];
  trades: { closed: number; wins: number; losses: number; win_rate: number | null; avg_win: number | null; avg_loss: number | null;
    profit_factor: number | null; best: { symbol: string; pnl: number; id: string } | null; worst: { symbol: string; pnl: number; id: string } | null };
  recent_fills: { id: number; ts: string; symbol: string; side: string; price: number; qty: number; leg: string; fee: number }[];
}

const pnlCls = (n: number | null | undefined) => ((n ?? 0) >= 0 ? "pos" : "neg");

function Stat({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="panel p-4">
      <div className="label">{label}</div>
      <div className={clsx("num text-[22px] mt-1", cls)}>{value}</div>
      {sub && <div className="num text-[12px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export default function PortfolioPage() {
  const [p, setP] = useState<Portfolio | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tick = useM((s) => s.st?.account?.equity);   // re-fetch whenever live equity moves
  const storiesV = useM((s) => s.storiesV);
  useEffect(() => {
    api.get<Portfolio>("/api/portfolio").then((d) => { setP(d); setErr(null); }).catch((e) => setErr(e.message));
  }, [tick, storiesV]);

  if (err) return <div className="p-6 text-coral">Could not load the portfolio: {err}</div>;
  if (!p) return <div className="p-6 text-muted">Loading portfolio…</div>;
  const a = p.account, t = p.trades;
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="display text-[26px]">My Portfolio</h1>
        <p className="text-[13px] text-muted">Paper account · NSE · all values in ₹. Nothing here is real money.</p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Total value" value={fmt.inr(a.equity)} sub={`Started with ${fmt.inr(a.start)}`} />
        <Stat label="Total return" value={fmt.pct(p.total_return_pct, 2)} sub={fmt.inr(a.day_pnl)} cls={pnlCls(a.day_pnl)} />
        <Stat label="Unrealised P&L" value={fmt.inr(a.unrealized)} sub="open positions" cls={pnlCls(a.unrealized)} />
        <Stat label="Realised P&L" value={fmt.inr(a.realized)} sub={`Fees paid ${fmt.inr(a.fees)}`} cls={pnlCls(a.realized)} />
        <Stat label="Cash" value={fmt.inr(a.cash)} sub={`${p.cash_pct.toFixed(1)}% of portfolio`} />
        <Stat label="Invested" value={fmt.inr(p.invested)} sub={`${p.invested_pct.toFixed(1)}% · ${a.positions} position${a.positions === 1 ? "" : "s"}`} />
        <Stat label="Peak value" value={fmt.inr(a.peak)} sub={`Drawdown ${a.drawdown_pct.toFixed(2)}%`} cls={a.drawdown_pct > 0 ? "neg" : undefined} />
        <Stat label="Open orders" value={String(a.open_orders)} sub="bracket / OCO" />
      </div>

      <section className="panel p-4">
        <div className="label mb-3">Holdings</div>
        {p.holdings.length === 0 ? (
          <p className="text-[13.5px] text-muted">No open positions. Ask Meridian to scan or plan a trade — try “plan 10 Reliance” — and approved trades appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] num">
              <thead className="text-faint text-left">
                <tr>{["Stock", "Sector", "Qty", "Avg", "LTP", "Value", "P&L", "P&L %", "Weight", "Stop", "Target"].map((h) =>
                  <th key={h} className="font-normal py-2 pr-4 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {p.holdings.map((h) => (
                  <motion.tr key={h.symbol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t border-line">
                    <td className="py-2 pr-4"><Link href={`/studio?symbol=${h.symbol}`} className="text-cyan">{h.symbol}</Link>
                      <div className="text-[11px] text-faint font-sans">{h.name}</div></td>
                    <td className="pr-4 text-muted font-sans">{h.sector}</td>
                    <td className="pr-4">{h.qty}</td>
                    <td className="pr-4">{fmt.px(h.avg_price)}</td>
                    <td className="pr-4">{fmt.px(h.last)}</td>
                    <td className="pr-4">{fmt.inr(h.value)}</td>
                    <td className={clsx("pr-4", pnlCls(h.unrealized))}>{fmt.inr(h.unrealized)}</td>
                    <td className={clsx("pr-4", pnlCls(h.unrealized_pct))}>{fmt.pct(h.unrealized_pct, 2)}</td>
                    <td className="pr-4">{h.weight_pct.toFixed(1)}%</td>
                    <td className="pr-4 text-muted">{h.stop != null ? fmt.px(h.stop) : "—"}</td>
                    <td className="pr-4 text-muted">{h.target != null ? fmt.px(h.target) : "—"}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <div className="label mb-3">Allocation</div>
          {(() => {
            const rows = [{ sector: "Cash", pct: p.cash_pct, value: a.cash }, ...p.sectors];
            return <div className="space-y-2.5">{rows.map((r) => (
              <div key={r.sector}>
                <div className="flex justify-between text-[12.5px]"><span>{r.sector}</span>
                  <span className="num text-muted">{r.pct.toFixed(1)}% · {fmt.lakh(r.value)}</span></div>
                <div className="h-1.5 rounded-full bg-white/5 mt-1 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, r.pct))}%`, background: r.sector === "Cash" ? "#7d8a9c" : "#38e1ff" }} />
                </div>
              </div>))}</div>;
          })()}
        </section>

        <section className="panel p-4">
          <div className="label mb-3">Closed trades</div>
          {t.closed === 0 ? <p className="text-[13.5px] text-muted">No closed trades yet.</p> : (
            <div className="grid grid-cols-2 gap-3 text-[12.5px]">
              <div><div className="text-faint">Trades</div><div className="num text-[18px]">{t.closed}</div></div>
              <div><div className="text-faint">Win rate</div><div className="num text-[18px]">{t.win_rate != null ? `${t.win_rate}%` : "—"}
                <span className="text-muted text-[12px]"> ({t.wins}W / {t.losses}L)</span></div></div>
              <div><div className="text-faint">Average win</div><div className="num pos">{fmt.inr(t.avg_win)}</div></div>
              <div><div className="text-faint">Average loss</div><div className="num neg">{fmt.inr(t.avg_loss)}</div></div>
              <div><div className="text-faint">Profit factor</div><div className="num">{t.profit_factor ?? "—"}</div></div>
              <div><div className="text-faint">Best / worst</div>
                <div className="num">{t.best ? <span className="pos">{t.best.symbol} {fmt.inr(t.best.pnl)}</span> : "—"}
                  {" · "}{t.worst ? <span className="neg">{t.worst.symbol} {fmt.inr(t.worst.pnl)}</span> : "—"}</div></div>
            </div>
          )}
        </section>
      </div>

      <section className="panel p-4">
        <div className="label mb-3">Recent fills</div>
        {p.recent_fills.length === 0 ? <p className="text-[13.5px] text-muted">No fills yet.</p> : (
          <table className="w-full text-[12.5px] num">
            <tbody>{p.recent_fills.map((f) => (
              <tr key={f.id} className="border-t border-line first:border-0">
                <td className="py-1.5 pr-4 text-faint">{f.ts.slice(11, 16)}</td>
                <td className="pr-4">{f.symbol}</td>
                <td className={clsx("pr-4 uppercase", f.side === "buy" ? "pos" : "neg")}>{f.side}</td>
                <td className="pr-4">{f.qty} @ {fmt.px(f.price)}</td>
                <td className="pr-4 text-muted font-sans">{f.leg}</td>
                <td className="text-right text-faint">fee {fmt.inr(f.fee)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
