"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Fingerprint, Link2, Lock, Mic2, RefreshCcw, ShieldCheck, ShieldOff, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import HaltLever from "@/components/HaltLever";
import { api } from "@/lib/api";
import { fmt, useM } from "@/lib/store";

const LIMITS: [string, string, (v: any) => string, string][] = [
  ["max_loss_per_trade_usd", "Max loss per trade", (v) => fmt.usd(v, 0), "tighten only"],
  ["max_daily_loss_usd", "Daily loss limit", (v) => fmt.usd(v, 0), "tighten only"],
  ["max_trades_per_day", "Trades per day", (v) => String(v), "tighten only"],
  ["min_reward_risk", "Min reward : risk", (v) => `${v}`, "raise only"],
  ["max_position_pct", "Position cap", (v) => `${v}%`, "tighten only"],
  ["max_order_usd", "Max order", (v) => fmt.usd(v, 0), "tighten only"],
  ["cash_buffer_pct", "Cash buffer", (v) => `${v}%`, "raise only"],
  ["meridian_max_drawdown_pct", "Max intraday drawdown", (v) => `${v}%`, "tighten only"],
];

export default function Guardrails() {
  const st = useM((s) => s.st);
  const ev = useM((s) => s.eventsLog.length);
  const [audit, setAudit] = useState<any[]>([]);
  const [verify, setVerify] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api.get("/api/audit?n=40").then(setAudit).catch(() => {}); }, [ev]);
  if (!st) return <div className="p-6"><div className="skeleton h-60" /></div>;
  const L = st.limits, k = st.kill;
  const locked = k.state !== "ARMED";
  const layers = [
    { id: "L0", name: "Paper-only assertion", ok: st.paper.ok, d: "Boot check: paper=true, mock/paper broker, live-key patterns rejected." },
    { id: "L1", name: "Trade gate", ok: true, d: "Repo trader-risk PASS/BLOCK, fingerprinted per exact order + Policy engine." },
    { id: "L2", name: "Mandate", ok: true, d: st.mandate ? `Active ${st.mandate.id}: ${st.mandate.used}/${st.mandate.max_trades} until ${st.mandate.expires_ts.slice(11, 16)}` : "No autopilot authority granted." },
    { id: "L3", name: "Circuit breakers", ok: !k.paused, d: k.paused ? `Paused: ${k.paused}` : "Daily loss, drawdown, stale data, error storm — armed." },
    { id: "L4", name: "Kill switch", ok: !locked, d: locked ? `LOCKED by ${k.last?.trigger ?? "?"}` : "Hold-to-halt · voice · Esc×2 · API · auto-triggers." },
  ];
  const tighten = async (key: string) => {
    setMsg(null);
    const r = await api.post("/api/limits", { [key]: Number(val) }).catch((e) => ({ ok: false, reason: e.message }));
    setMsg(r.ok ? `Tightened ${key.replaceAll("_", " ")}.` : r.reason);
    setEdit(null);
  };
  const rearm = async () => {
    const r = await api.post("/api/rearm", { reason }).catch((e) => ({ ok: false, why: e.message }));
    setMsg(r.ok ? "Re-armed." : r.why); if (r.ok) setReason("");
  };

  return (
    <div className="p-4 space-y-4">
      <div><div className="label">Guardrails & kill switch</div><h1 className="display text-3xl mt-1">Limits the model cannot argue with</h1></div>
      {msg && <div className="panel px-4 py-2.5 text-[13px] text-amber">{msg}</div>}
      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {LIMITS.map(([key, label, f, rule]) => (
              <div key={key} className="panel p-4">
                <div className="flex items-center justify-between"><span className="label">{label}</span><Lock size={12} className="text-faint" /></div>
                {edit === key ? (
                  <div className="flex gap-1.5 mt-2"><input autoFocus className="input !h-9 num" value={val} onChange={(e) => setVal(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && tighten(key)} /><button className="btn !h-9" onClick={() => tighten(key)}>Set</button></div>
                ) : (
                  <button className="display text-[26px] num mt-1 hover:text-cyan transition-colors" onClick={() => { setEdit(key); setVal(String(L[key])); }}
                    title="Click to tighten">{f(L[key])}</button>
                )}
                <div className="text-[11px] text-muted mt-0.5">{rule} · voice too</div>
              </div>
            ))}
          </section>
          <section className="panel p-5">
            <div className="label mb-3">Five defence layers · fail closed</div>
            <div className="grid gap-2 md:grid-cols-5">
              {layers.map((l, i) => (
                <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={clsx("rounded-xl border p-3", l.ok ? "border-mint/25 bg-mint/[0.04]" : "border-coral/40 bg-coral/[0.06]")}>
                  <div className="flex items-center justify-between"><span className="num text-[12px] text-muted">{l.id}</span>
                    {l.ok ? <ShieldCheck size={15} className="text-mint" /> : <ShieldOff size={15} className="text-coral" />}</div>
                  <div className="text-[13px] font-semibold mt-1.5">{l.name}</div>
                  <div className="text-[11.5px] text-ink-2 mt-1 leading-snug">{l.d}</div>
                </motion.div>
              ))}
            </div>
          </section>
          <section className="panel p-5">
            <div className="label mb-3">Live circuit breakers (Sentinel)</div>
            <div className="grid gap-3 md:grid-cols-4">
              {Object.entries(k.breakers || {}).map(([name, b]) => {
                const pct = b.value == null || !b.limit ? 0 : Math.min(1, Math.abs(Number(b.value)) / b.limit);
                return (
                  <div key={name}>
                    <div className="flex justify-between text-[12px]"><span className="capitalize text-ink-2">{name.replace("_", " ")}</span>
                      <span className="num text-muted">{b.value == null ? "—" : Number(b.value).toFixed(name === "drawdown" ? 3 : 0)} / {b.limit}</span></div>
                    <div className="h-1.5 rounded-full bg-white/5 mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct < 0.5 ? "#3ddc97" : pct < 0.8 ? "#ffb547" : "#ff5c6c" }} /></div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11.5px] text-muted mt-3">Auto-halt on daily loss reached, drawdown breach, paper-assertion failure, or 5 consecutive tool errors.
              {" "}{k.consecutive_stops ? `${k.consecutive_stops} consecutive stop(s) today.` : ""}</p>
          </section>
          <section className="panel p-5">
            <div className="flex items-center justify-between mb-3"><span className="label">Hash-chained audit log</span>
              <button className="btn !h-8 !text-[12px]" onClick={() => api.get("/api/audit/verify").then(setVerify)}><Link2 size={14} />Verify chain</button></div>
            {verify && <div className={clsx("mb-3 text-[12.5px] flex items-center gap-2", verify.ok ? "text-mint" : "text-coral")}>
              {verify.ok ? <Check size={15} /> : <TriangleAlert size={15} />}{verify.ok ? `Chain intact · ${verify.rows} rows · head ${verify.head.slice(0, 16)}…` :
                `Broken at row ${verify.broken_at}: ${verify.why}`}</div>}
            <div className="max-h-[300px] scroll space-y-1">
              {audit.map((a) => (
                <div key={a.id} className="grid grid-cols-[52px_150px_1fr_110px] gap-2 text-[11.5px] num items-center border-t border-line pt-1">
                  <span className="text-faint">#{a.id}</span><span className="text-cyan truncate">{a.event.kind}</span>
                  <span className="text-ink-2 truncate">{a.event.tool || a.event.verdict || a.event.reason || a.event.trigger || ""} {a.event.status || ""}</span>
                  <span className="text-faint truncate" title={a.hash}><Fingerprint size={11} className="inline mr-1" />{a.hash.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="panel p-6 flex flex-col items-center text-center">
            <HaltLever big />
            <p className="text-[12.5px] text-ink-2 mt-5 max-w-[300px]">Cancels every open order, flattens every position at market, revokes the mandate, writes the audit
              record and a Kill Story. Works even if the language model is down.</p>
            {locked && (
              <div className="w-full mt-5 text-left space-y-2">
                <div className="label">Re-arm</div>
                <div className="text-[12px] text-muted">Cool-down {k.cooldown_s > 0 ? <span className="num text-amber">{Math.floor(k.cooldown_s / 60)}m {k.cooldown_s % 60}s</span> : <span className="text-mint">complete</span>} (virtual clock)</div>
                <input className="input" placeholder="Type a reason (8+ characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn w-full" disabled={reason.trim().length < 8 || k.cooldown_s > 0} onClick={rearm}><RefreshCcw size={14} />Re-arm entries</button>
              </div>
            )}
          </section>
          {st.mandate && (
            <section className="panel p-5">
              <div className="label">Active mandate</div>
              <div className="display text-xl mt-1">{st.mandate.id}</div>
              <div className="text-[12.5px] text-ink-2 mt-1">{st.mandate.used}/{st.mandate.max_trades} trades · until {st.mandate.expires_ts.slice(11, 16)} ·
                max loss {fmt.usd(st.mandate.scope.max_loss_per_trade)} · {st.mandate.scope.strategies.join(", ")}</div>
              <button className="btn btn-danger w-full mt-3" onClick={() => api.del("/api/mandate")}>Revoke mandate</button>
            </section>
          )}
          <section className="panel p-5">
            <div className="flex items-center gap-2"><Mic2 size={15} className="text-cyan" /><span className="label">What voice cannot do</span></div>
            <ul className="mt-3 space-y-2 text-[12.5px] text-ink-2">
              {["Loosen any limit (it can only tighten)", "Turn on autopilot without an on-screen mandate", "Approve more than one order per “yes”",
                "Accept “ok”, “sure” or “go ahead” as approval", "Re-arm after a halt", "Reach a non-paper endpoint", "Act on instructions inside news or filings"].map((x) => (
                <li key={x} className="flex gap-2"><span className="text-coral mt-[1px]">✕</span>{x}</li>))}
            </ul>
          </section>
          <section className="panel p-5 text-[12px] text-ink-2 space-y-1.5">
            <div className="label mb-2">Fixed rules</div>
            <div className="flex justify-between"><span>Entry window</span><span className="num">{L.no_entries_before}–{L.no_entries_after} IST</span></div>
            <div className="flex justify-between"><span>Flat by</span><span className="num">{L.flat_by} IST (before MIS auto square-off)</span></div>
            <div className="flex justify-between"><span>Stop required</span><span>{L.require_stop ? "yes" : "no"}</span></div>
            <div className="flex justify-between"><span>F&O · MIS leverage · shorts</span><span>off · off · off</span></div>
            <div className="flex justify-between"><span>Consecutive-stop pause</span><span className="num">{L.meridian_consecutive_stop_pause?.stops} stops → {L.meridian_consecutive_stop_pause?.minutes} min</span></div>
          </section>
        </aside>
      </div>
    </div>
  );
}
