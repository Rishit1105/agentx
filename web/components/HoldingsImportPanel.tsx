"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { FileUp, Lock, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { fmt } from "@/lib/store";

interface Item { symbol: string; name: string; sector: string; qty: number; avg_cost: number | null; price: number | null;
  value: number; pnl: number | null; day_chg: number | null; weight: number }
interface View { items: Item[]; unknown: string[]; total: number; day_pnl: number; sectors: { sector: string; weight: number }[];
  notes: string[]; note: string }

const SAMPLE = "Instrument,Qty.,Avg. cost\nRELIANCE,40,1250.5\nHDFCBANK,60,900\nINFY,25,1500\nTCS,10,3100\n";

/** Read-only: analyse holdings exported from a real broker next to the paper desk. Never logs in, never trades. */
export default function HoldingsImportPanel() {
  const [v, setV] = useState<View | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api.get<View>("/api/holdings/imported").then(setV).catch(() => {}); }, []);

  const load = async (t: string) => {
    setErr(null);
    try { setV(await api.post<View>("/api/holdings/import", { text: t })); setText(""); }
    catch (e) { setErr((e as Error).message); }
  };
  const onFile = async (f?: File) => { if (f) load(await f.text()); };
  const clear = async () => { await api.del("/api/holdings/imported").catch(() => {}); setV(await api.get<View>("/api/holdings/imported")); };

  return (
    <section className="panel p-4 space-y-4" aria-label="Imported broker holdings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display text-[17px] flex items-center gap-2"><Lock size={15} className="text-muted" />Your real holdings, read-only</h2>
          <p className="text-[12.5px] text-ink-2 mt-1 max-w-2xl">Export holdings from your broker (Zerodha Console → Holdings → Download CSV) and drop
            the file here. Meridian analyses concentration and today&apos;s move next to the paper desk. It never logs in and never places anything.</p>
        </div>
        {v && v.items.length > 0 && <button className="btn btn-ghost !h-8 text-[12px]" onClick={clear}><Trash2 size={13} />Clear</button>}
      </div>

      {(!v || v.items.length === 0) && (
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <textarea className="input !h-24 py-2.5 num text-[12px] resize-none" placeholder={SAMPLE} value={text}
            onChange={(e) => setText(e.target.value)} aria-label="Holdings CSV or JSON" />
          <div className="flex md:flex-col gap-2">
            <button className="btn btn-primary" onClick={() => load(text)} disabled={!text.trim()}>Analyse</button>
            <button className="btn" onClick={() => file.current?.click()}><FileUp size={14} />Upload CSV</button>
            <button className="btn btn-ghost text-[12px]" onClick={() => load(SAMPLE)}>Try a sample</button>
            <input ref={file} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </div>
      )}
      {err && <p className="text-[12.5px] text-coral">{err}</p>}

      {v && v.items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <table className="w-full text-[12.5px] min-w-0">
            <thead><tr className="text-left text-faint"><th className="font-normal py-1">Stock</th><th className="font-normal text-right">Qty</th>
              <th className="font-normal text-right">Value</th><th className="font-normal text-right">Weight</th><th className="font-normal text-right">Today</th>
              <th className="font-normal text-right">P&amp;L</th></tr></thead>
            <tbody>{v.items.map((i, k) => (
              <motion.tr key={i.symbol} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.03 }} className="border-t border-line">
                <td className="py-1.5"><div className="font-medium">{i.symbol}</div><div className="text-[11px] text-muted truncate max-w-[200px]">{i.sector}</div></td>
                <td className="num text-right">{i.qty}</td><td className="num text-right">{fmt.usd(i.value, 0)}</td>
                <td className="num text-right">{i.weight}%</td>
                <td className={clsx("num text-right", (i.day_chg ?? 0) >= 0 ? "pos" : "neg")}>{i.day_chg == null ? "—" : `${i.day_chg > 0 ? "+" : ""}${i.day_chg}%`}</td>
                <td className={clsx("num text-right", (i.pnl ?? 0) >= 0 ? "pos" : "neg")}>{i.pnl == null ? "—" : fmt.usd(i.pnl, 0)}</td>
              </motion.tr>
            ))}</tbody>
          </table>
          <div className="space-y-3 min-w-0">
            <div><div className="label">Total value</div><div className="num text-[22px]">{fmt.usd(v.total, 0)}</div>
              <div className={clsx("num text-[12px]", v.day_pnl >= 0 ? "pos" : "neg")}>{fmt.usd(v.day_pnl, 0)} today</div></div>
            <div className="space-y-1.5">{v.sectors.slice(0, 6).map((s) => (
              <div key={s.sector} className="text-[11.5px]"><div className="flex justify-between"><span className="truncate">{s.sector}</span>
                <span className="num">{s.weight}%</span></div>
                <div className="h-1 rounded-full bg-line mt-1 overflow-hidden"><motion.div className="h-full bg-ink/70 origin-left" style={{ width: "100%" }}
                  initial={{ scaleX: 0 }} animate={{ scaleX: s.weight / 100 }} transition={{ duration: 0.6 }} /></div></div>
            ))}</div>
            {v.notes.map((n) => <p key={n} className="text-[12px] text-amber">⚠ {n}</p>)}
            {v.unknown.length > 0 && <p className="text-[11.5px] text-faint">Not in the NIFTY 500 replay: {v.unknown.join(", ")}</p>}
          </div>
        </div>
      )}
      <p className="text-[11px] text-faint">{v?.note}</p>
    </section>
  );
}
