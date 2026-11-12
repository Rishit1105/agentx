"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ShieldCheck, ShieldX } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { fmt } from "@/lib/store";

interface Leg { side: "buy" | "sell"; kind: "call" | "put"; strike: number; premium: number }
interface Analysis {
  symbol: string; name: string; label: string; spot: number; days: number; lots: number; lot_size: number; qty: number;
  vol: number; legs: Leg[]; net_premium: number; type: string; max_profit: number | null; max_loss: number;
  breakevens: number[]; pop: number; greeks: { delta: number; theta: number; vega: number };
  curve: { s: number; pnl: number }[]; verdict: "PASS" | "BLOCK"; lots_allowed: number; why: string; note: string;
}

const STRATS: [string, string][] = [["bull_call_spread", "Bull call spread"], ["bear_put_spread", "Bear put spread"],
  ["iron_condor", "Iron condor"], ["long_call", "Long call"], ["long_put", "Long put"], ["long_straddle", "Long straddle"]];
const SYMBOLS = ["NIFTY50", "RELIANCE", "HDFCBANK", "INFY", "TCS", "ICICIBANK", "SBIN", "ETERNAL"];

/** Payoff at expiry: green above zero, red below, with the spot and the breakevens marked. */
function Payoff({ a }: { a: Analysis }) {
  const W = 720, H = 260, P = 12;
  const xs = a.curve.map((c) => c.s), ys = a.curve.map((c) => c.pnl);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 0);
  const X = (v: number) => P + ((v - x0) / (x1 - x0)) * (W - 2 * P);
  const Y = (v: number) => H - P - ((v - y0) / Math.max(1, y1 - y0)) * (H - 2 * P);
  const line = a.curve.map((c, i) => `${i ? "L" : "M"}${X(c.s).toFixed(1)},${Y(c.pnl).toFixed(1)}`).join(" ");
  const area = `${line} L${X(x1)},${Y(0)} L${X(x0)},${Y(0)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[260px]" role="img" aria-label={`${a.label} payoff at expiry`}>
      <defs>
        <clipPath id="above"><rect x="0" y="0" width={W} height={Y(0)} /></clipPath>
        <clipPath id="below"><rect x="0" y={Y(0)} width={W} height={H} /></clipPath>
      </defs>
      <path d={area} fill="color-mix(in srgb, var(--mint) 18%, transparent)" clipPath="url(#above)" />
      <path d={area} fill="color-mix(in srgb, var(--coral) 16%, transparent)" clipPath="url(#below)" />
      <line x1={P} x2={W - P} y1={Y(0)} y2={Y(0)} stroke="var(--line-2)" />
      <motion.path key={a.label + a.symbol + a.lots} d={line} fill="none" stroke="var(--ink)" strokeWidth="2"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      <line x1={X(a.spot)} x2={X(a.spot)} y1={P} y2={H - P} stroke="var(--cyan)" strokeDasharray="4 4" />
      <text x={X(a.spot) + 4} y={P + 10} fontSize="11" fill="var(--cyan)" className="num">spot {a.spot.toLocaleString("en-IN")}</text>
      {a.breakevens.map((b) => (
        <g key={b}><circle cx={X(b)} cy={Y(0)} r="4" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.5" />
          <text x={X(b)} y={Y(0) + 18} fontSize="10.5" textAnchor="middle" fill="var(--muted)" className="num">{b.toLocaleString("en-IN")}</text></g>
      ))}
    </svg>
  );
}

export default function OptionsDesk() {
  const [symbol, setSymbol] = useState("NIFTY50");
  const [strategy, setStrategy] = useState("bull_call_spread");
  const [days, setDays] = useState(7);
  const [lots, setLots] = useState(1);
  const [width, setWidth] = useState(2);
  const [a, setA] = useState<Analysis | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ symbol, strategy, days: String(days), lots: String(lots), width: String(width) });
    api.get<Analysis>(`/api/options?${q}`).then((x) => { setA(x); setErr(null); }).catch((e) => setErr(e.message));
  }, [symbol, strategy, days, lots, width]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      <header className="min-w-0">
        <div className="label">Options desk · paper</div>
        <h1 className="display text-[clamp(1.6rem,3vw,2.2rem)] mt-1 leading-tight">Know the worst case before the trade</h1>
        <p className="text-ink-2 text-[13.5px] mt-1.5 max-w-2xl">Defined-risk strategies only, checked against the same ₹2,500 per-trade limit as stocks.
          Premiums are modelled with Black-Scholes on each underlying&apos;s realised volatility. This isn&apos;t a live chain, and nothing is placed.</p>
      </header>

      <section className="panel p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">Underlying
          <select className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {SYMBOLS.map((s) => <option key={s} value={s}>{s === "NIFTY50" ? "NIFTY 50" : s}</option>)}</select></label>
        <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">Strategy
          <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">Days to expiry · {days}
          <input type="range" min={1} max={45} value={days} onChange={(e) => setDays(+e.target.value)} className="accent-[var(--ink)] mt-3" /></label>
        <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">Strike width · {width} steps
          <input type="range" min={1} max={6} value={width} onChange={(e) => setWidth(+e.target.value)} className="accent-[var(--ink)] mt-3" /></label>
        <label className="flex flex-col gap-1.5 text-[11.5px] text-muted">Lots
          <input className="input num" type="number" min={1} max={20} value={lots} onChange={(e) => setLots(Math.max(1, Math.min(20, +e.target.value)))} /></label>
      </section>
      {err && <p className="text-[12.5px] text-coral">{err}</p>}

      {a && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="panel p-4 min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="display text-[18px]">{a.label} · {a.symbol === "NIFTY50" ? "NIFTY 50" : a.symbol}</h2>
              <span className="text-[12px] text-muted num">{a.lots} × {a.lot_size} = {a.qty} · {a.days}d · vol {a.vol}%</span>
            </div>
            <Payoff a={a} />
            <table className="w-full text-[12.5px] mt-2">
              <thead><tr className="text-left text-faint"><th className="font-normal">Leg</th><th className="font-normal">Strike</th>
                <th className="font-normal text-right">Premium</th></tr></thead>
              <tbody>{a.legs.map((l, i) => (
                <tr key={i} className="border-t border-line"><td className={clsx("py-1.5 capitalize", l.side === "buy" ? "text-ink" : "text-muted")}>
                  {l.side} {l.kind}</td><td className="num">{l.strike.toLocaleString("en-IN")}</td><td className="num text-right">{l.premium.toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <aside className="space-y-4 min-w-0">
            <div className={clsx("panel p-4 border-l-4", a.verdict === "PASS" ? "!border-l-mint" : "!border-l-coral")}>
              <div className="flex items-center gap-2 font-semibold">{a.verdict === "PASS" ? <ShieldCheck size={17} className="text-mint" /> :
                <ShieldX size={17} className="text-coral" />}Risk gate {a.verdict}</div>
              <p className="text-[12.5px] text-ink-2 mt-1.5">{a.why}</p>
            </div>
            <div className="panel grid grid-cols-2 divide-x divide-y divide-line">
              {[["Net " + a.type, fmt.usd(Math.abs(a.net_premium), 0)], ["Max loss", fmt.usd(a.max_loss, 0)],
                ["Max profit", a.max_profit == null ? "Unlimited" : fmt.usd(a.max_profit, 0)], ["Chance of profit", `${a.pop}%`],
                ["Delta", a.greeks.delta.toFixed(1)], ["Theta / day", fmt.usd(a.greeks.theta, 0)]].map(([k, v]) => (
                <div key={k} className="p-3 min-w-0"><div className="label !text-[9.5px]">{k}</div><div className="num text-[16px] mt-1 truncate">{v}</div></div>
              ))}
            </div>
            <p className="text-[11.5px] text-faint leading-relaxed">{a.note}</p>
          </aside>
        </div>
      )}
    </div>
  );
}
