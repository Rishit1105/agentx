"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Calculator, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { fmt } from "@/lib/store";

interface Scenario { exit: number; gross: number; charges: number; net: number }
interface WhatIf {
  symbol: string; qty: number; entry: number; stop: number; stop_rule: string; target: number; max_loss: number;
  notional: number; pct_of_budget: number; pct_of_daily_limit: number | null; caps: Record<string, number>;
  binding: string; max_allowed: number; verdict: "PASS" | "BLOCK"; breaches: string[]; why: string;
  scenarios: Record<string, Scenario>; warnings: string[];
}

/** Drag a size, see the rules answer: max loss, the limit that binds, charges and a gap-through-stop case. */
export default function WhatIfPanel({ symbol }: { symbol: string }) {
  const [qty, setQty] = useState<number | null>(null);
  const [stop, setStop] = useState<string>("");
  const [r, setR] = useState<WhatIf | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.post<WhatIf>("/api/whatif", { symbol, qty: qty ?? undefined, stop: stop ? Number(stop) : undefined })
        .then((x) => { setR(x); setErr(null); if (qty == null) setQty(x.max_allowed); })
        .catch((e) => { setErr(e.message); setR(null); });
    }, 180);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [symbol, qty, stop]);

  const max = Math.max(10, Math.round((r?.max_allowed ?? 100) * 1.6));
  const pass = r?.verdict === "PASS";
  return (
    <section className="panel p-4 space-y-3" aria-label="What-if risk simulator">
      <div className="flex items-center justify-between gap-2">
        <span className="label flex items-center gap-1.5"><Calculator size={12} />What-if · {symbol}</span>
        {r && <span className={clsx("chip !h-6 font-semibold", pass ? "!text-mint !border-mint/40" : "!text-coral !border-coral/40")}>
          {pass ? <ShieldCheck size={13} /> : <ShieldX size={13} />}{r.verdict}</span>}
      </div>
      {err && <p className="text-[12.5px] text-coral">{err}</p>}
      {r && (
        <>
          <div>
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-muted">Shares</span>
              <span className="num text-[18px] text-ink">{qty ?? r.qty}</span>
            </div>
            <input type="range" min={1} max={max} value={qty ?? r.qty} onChange={(e) => setQty(+e.target.value)}
              className="w-full accent-[var(--ink)] mt-1" aria-label="Shares" />
            <div className="flex justify-between text-[11px] text-faint num"><span>1</span>
              <span>max allowed {r.max_allowed}</span><span>{max}</span></div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-muted">Stop
            <input className="input !h-8 num" placeholder={`${r.stop} (${r.stop_rule})`} value={stop}
              onChange={(e) => setStop(e.target.value)} inputMode="decimal" /></label>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-lg bg-panel-3 p-2.5"><div className="text-muted">Max loss at stop</div>
              <div className="num text-[16px] text-ink mt-0.5">{fmt.usd(r.max_loss)}</div>
              <div className="text-faint">{r.pct_of_daily_limit ?? "—"}% of daily limit</div></div>
            <div className="rounded-lg bg-panel-3 p-2.5"><div className="text-muted">Position</div>
              <div className="num text-[16px] text-ink mt-0.5">{fmt.usd(r.notional, 0)}</div>
              <div className="text-faint">{r.pct_of_budget}% of budget</div></div>
          </div>
          <div className="space-y-1.5">
            {Object.entries(r.caps).map(([k, cap]) => {
              const used = Math.min(1, (qty ?? r.qty) / Math.max(1, cap));
              const over = (qty ?? r.qty) > cap;
              return (
                <div key={k} className="text-[11.5px]">
                  <div className="flex justify-between gap-2"><span className={clsx(k === r.binding ? "text-ink font-medium" : "text-muted")}>
                    {k}{k === r.binding && " · binds"}</span><span className={clsx("num", over ? "neg" : "text-ink-2")}>≤ {cap.toLocaleString("en-IN")}</span></div>
                  <div className="h-1 rounded-full bg-line mt-1 overflow-hidden">
                    <motion.div className={clsx("h-full origin-left", over ? "bg-coral" : used > 0.8 ? "bg-amber" : "bg-mint")}
                      initial={false} animate={{ scaleX: used }} style={{ width: "100%" }} transition={{ duration: 0.25 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <table className="w-full text-[11.5px]">
            <thead><tr className="text-faint text-left"><th className="font-normal">Scenario</th><th className="font-normal text-right">Exit</th>
              <th className="font-normal text-right">Charges</th><th className="font-normal text-right">Net</th></tr></thead>
            <tbody>
              {Object.entries(r.scenarios).map(([k, s]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1 capitalize">{k}</td><td className="num text-right">{s.exit}</td>
                  <td className="num text-right text-muted">{fmt.usd(s.charges)}</td>
                  <td className={clsx("num text-right", s.net >= 0 ? "pos" : "neg")}>{fmt.usd(s.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <AnimatePresence>
            {r.warnings.map((w) => (
              <motion.p key={w} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex gap-2 text-[12px] text-amber"><TriangleAlert size={14} className="shrink-0 mt-0.5" />{w}</motion.p>
            ))}
          </AnimatePresence>
          <p className="text-[11.5px] text-ink-2">{r.why}</p>
          <p className="text-[11px] text-faint">Simulation only. No ticket is created; the Risk gate re-checks at order time.</p>
        </>
      )}
    </section>
  );
}
