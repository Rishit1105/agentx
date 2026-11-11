"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { fmt, useM } from "@/lib/store";

/** Autopilot needs a Mandate confirmed on screen: scoped, time-boxed, never looser than the global limits. */
export default function MandateSheet() {
  const prop = useM((s) => s.mandateProposal);
  const limits = useM((s) => s.st?.limits);
  const set = useM((s) => s.set);
  const [m, setM] = useState({ minutes: 120, max_trades: 3, orb: true, level: true, max_loss: 50 });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (prop) setM({ minutes: prop.minutes ?? 120, max_trades: prop.max_trades ?? 3, orb: true, level: true,
      max_loss: prop.max_loss_per_trade ?? limits?.max_loss_per_trade_usd ?? 50 });
  }, [prop, limits]);
  const maxLoss = limits?.max_loss_per_trade_usd ?? 50;
  const maxTrades = limits?.max_trades_per_day ?? 3;
  const confirm = async () => {
    setBusy(true);
    try {
      await api.post("/api/mandate", { minutes: m.minutes, max_trades: m.max_trades, max_loss_per_trade: m.max_loss,
        strategies: [m.orb && "orb", m.level && "level"].filter(Boolean), confirmed_on_screen: true });
      set({ mandateProposal: null });
    } catch (e: any) { useM.getState().toast({ tone: "bad", title: "Mandate refused", body: e.message }); }
    setBusy(false);
  };
  return (
    <AnimatePresence>
      {prop && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" initial={{ opacity: 0 }}
          animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="dialog" aria-modal aria-labelledby="mtitle" className="panel w-[480px] max-w-full p-6"
            initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, opacity: 0 }}>
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl grid place-items-center bg-violet/15 text-violet"><Bot size={20} /></span>
              <div><div className="label">Autopilot · paper</div><h2 id="mtitle" className="display text-xl">Grant a mandate</h2></div>
            </div>
            <p className="text-[13px] text-ink-2 mt-3">Meridian may place paper orders that pass the risk gate, inside this scope only. It expires on
              its own; HALT revokes it instantly. Each order is logged in the repo's approval log exactly like a manual “yes”.</p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <label className="text-[12px] text-muted">Duration (minutes)
                <input type="number" min={5} max={390} className="input num mt-1" value={m.minutes}
                  onChange={(e) => setM({ ...m, minutes: +e.target.value })} /></label>
              <label className="text-[12px] text-muted">Max trades (≤ {maxTrades})
                <input type="number" min={1} max={maxTrades} className="input num mt-1" value={m.max_trades}
                  onChange={(e) => setM({ ...m, max_trades: Math.min(maxTrades, +e.target.value) })} /></label>
              <label className="text-[12px] text-muted col-span-2">Max loss per trade (≤ {fmt.usd(maxLoss)})
                <input type="number" min={1} max={maxLoss} className="input num mt-1" value={m.max_loss}
                  onChange={(e) => setM({ ...m, max_loss: Math.min(maxLoss, +e.target.value) })} /></label>
            </div>
            <div className="flex gap-2 mt-4">
              {(["orb", "level"] as const).map((k) => (
                <button key={k} onClick={() => setM({ ...m, [k]: !m[k] })}
                  className={`chip ${m[k] ? "!border-violet/60 !text-ink bg-violet/10" : ""}`}>
                  {k === "orb" ? "Opening-range breakout" : "Level breakout"}</button>
              ))}
              <span className="chip">Long only</span>
            </div>
            <div className="flex items-center gap-2 mt-5 text-[12px] text-mint"><ShieldCheck size={15} /> Equal to or tighter than your global limits.</div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="btn btn-ghost" onClick={() => set({ mandateProposal: null })}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || (!m.orb && !m.level)} onClick={confirm}>Confirm on screen</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
