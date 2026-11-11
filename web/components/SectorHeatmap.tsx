"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, LayoutGrid } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";

interface Stock { symbol: string; name: string; chg: number; price: number; value: number }
interface Sector { sector: string; count: number; value: number; chg: number; adv: number; dec: number; leader: string; laggard: string; stocks: Stock[] }
interface MapData {
  as_of: string; stocks: number; advancers: number; decliners: number; mood: string;
  nifty: { price: number | null; chg: number | null }; sectors: Sector[]; gainers: Stock[]; losers: Stock[];
}

/** green for up, red for down; intensity scales with the move (±3 % saturates) */
export function heat(chg: number) {
  const a = Math.min(1, Math.abs(chg) / 3);
  return chg >= 0
    ? `color-mix(in srgb, var(--mint) ${Math.round(10 + a * 70)}%, #ffffff)`
    : `color-mix(in srgb, var(--coral) ${Math.round(10 + a * 70)}%, #ffffff)`;
}
const inkOn = (chg: number) => (Math.abs(chg) > 1.6 ? "#ffffff" : "var(--ink)");
const SHORT: Record<string, string> = {
  "Automobile and Auto Components": "Auto", "Fast Moving Consumer Goods": "FMCG", "Oil Gas & Consumable Fuels": "Oil & Gas",
  "Media Entertainment & Publication": "Media", "Information Technology": "IT", "Financial Services": "Financials",
  "Construction Materials": "Cement", "Metals & Mining": "Metals", "Consumer Durables": "Durables",
  "Consumer Services": "Consumer Svcs",
};

export default function SectorHeatmap({ compact = false }: { compact?: boolean }) {
  const bar = useM((s) => s.eventsLog.findLast?.((e) => e.type === "market.bar")?.payload?.t);
  const [d, setD] = useState<MapData | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get<MapData>("/api/market/map").then((x) => alive && setD(x)).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [bar]);

  if (!d) return <div className="skeleton h-48" />;
  if (!d.sectors.length) return <p className="text-[12.5px] text-muted">Sectors fill in after the first five-minute bar.</p>;
  const total = d.sectors.reduce((a, s) => a + s.value, 0) || 1;
  const sel = d.sectors.find((s) => s.sector === focus);
  const advPct = (d.advancers / Math.max(1, d.advancers + d.decliners)) * 100;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label flex items-center gap-1.5"><LayoutGrid size={12} />NIFTY 500 · sectors</span>
        <span className={clsx("chip !h-6 capitalize", d.mood.includes("rally") || d.mood === "risk-on" ? "!text-mint" : d.mood.includes("off") ? "!text-coral" : "")}>
          {d.mood}</span>
      </div>
      <div>
        <div className="flex justify-between text-[11.5px] text-muted mb-1">
          <span><span className="num text-mint">{d.advancers}</span> up</span>
          {d.nifty.chg != null && <span>NIFTY 50 <span className={clsx("num", d.nifty.chg >= 0 ? "pos" : "neg")}>{d.nifty.chg >= 0 ? "+" : ""}{d.nifty.chg}%</span></span>}
          <span><span className="num text-coral">{d.decliners}</span> down</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex bg-line" aria-label={`${d.advancers} advancing, ${d.decliners} declining`}>
          <motion.div className="h-full bg-mint" initial={false} animate={{ width: `${advPct}%` }} transition={{ duration: 0.6 }} />
          <div className="h-full flex-1 bg-coral/80" />
        </div>
      </div>
      <div className={clsx("flex flex-wrap gap-1", compact ? "max-h-[220px] overflow-hidden" : "")} role="list">
        {d.sectors.map((s) => {
          const share = s.value / total;
          return (
            <motion.button key={s.sector} role="listitem" layout onClick={() => setFocus(focus === s.sector ? null : s.sector)}
              title={`${s.sector}: ${s.chg >= 0 ? "+" : ""}${s.chg}% (value-weighted), ${s.adv} up / ${s.dec} down, leader ${s.leader}`}
              className={clsx("rounded-md px-2 py-1.5 text-left min-w-0 transition-shadow", focus === s.sector && "ring-2 ring-ink/60")}
              style={{ background: heat(s.chg), color: inkOn(s.chg), flexGrow: Math.max(1, Math.round(share * 100)),
                flexBasis: `${Math.max(compact ? 64 : 84, share * (compact ? 520 : 900))}px`, minHeight: compact ? 44 : 56 }}>
              <div className="text-[11px] font-medium leading-tight truncate">{SHORT[s.sector] ?? s.sector}</div>
              <div className="num text-[12px] leading-tight mt-0.5">{s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%</div>
            </motion.button>
          );
        })}
      </div>
      {sel ? (
        <div className="rounded-lg border border-line p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold truncate">{sel.sector}</span>
            <span className="text-[11.5px] text-muted shrink-0">{sel.adv} up · {sel.dec} down</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-2">
            {sel.stocks.slice(0, compact ? 6 : 12).map((x) => (
              <div key={x.symbol} className="rounded px-2 py-1 text-[11.5px] flex justify-between gap-2 min-w-0" style={{ background: heat(x.chg), color: inkOn(x.chg) }}>
                <span className="truncate">{x.symbol}</span><span className="num shrink-0">{x.chg >= 0 ? "+" : ""}{x.chg.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : !compact && (
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          {[["Top gainers", d.gainers, ArrowUpRight, "pos"], ["Top losers", d.losers, ArrowDownRight, "neg"]].map(([t, rows, Icon, cls]) => (
            <div key={t as string} className="min-w-0">
              <div className="label mb-1.5 flex items-center gap-1">{(() => { const I = Icon as typeof ArrowUpRight; return <I size={12} />; })()}{t as string}</div>
              {(rows as Stock[]).slice(0, 5).map((x) => (
                <div key={x.symbol} className="flex justify-between gap-2 py-0.5 border-t border-line first:border-0">
                  <span className="truncate">{x.symbol}</span><span className={clsx("num shrink-0", cls as string)}>{x.chg >= 0 ? "+" : ""}{x.chg.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-faint">Tile size = traded value today · colour = value-weighted move · tap a sector for its stocks · as of {d.as_of}</p>
    </div>
  );
}
