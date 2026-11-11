"use client";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlarmClock, ArrowRight, Bell, Bot, CircleCheck, CircleX, Gauge, Mic, Moon, Play, Plus, Radar, Repeat, Shield,
  Sparkles, Sunrise, Trash2, TrendingDown, Zap,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";

type Trigger = { type: string; [k: string]: any };
type Action = { type: string; [k: string]: any };
interface Rule {
  id: string; name: string; enabled: boolean; trigger: Trigger; action: Action; cooldown_min: number; fires: number;
  last_fired: string | null; last_result: any; template: string | null; describe: string;
}
interface Template { key: string; name: string; icon: string; blurb: string; trigger: Trigger; action: Action }
interface Run { id: number; vclock: string; name: string; ok: boolean; detail: any; action: string }

const TPL_ICON: Record<string, any> = { sunrise: Sunrise, radar: Radar, shield: Shield, gauge: Gauge, bell: Bell, zap: Zap, moon: Moon };
const TRIGGERS: { type: string; label: string; icon: any }[] = [
  { type: "time", label: "At a time", icon: AlarmClock },
  { type: "every", label: "Every N minutes", icon: Repeat },
  { type: "price", label: "Price crosses", icon: Bell },
  { type: "day_pnl", label: "Day P&L falls to", icon: TrendingDown },
  { type: "risk_used", label: "Risk budget used", icon: Gauge },
  { type: "scan_hits", label: "Scan finds ≥ N", icon: Radar },
];
const ACTIONS: { type: string; label: string; tone: string }[] = [
  { type: "briefing", label: "Market briefing", tone: "cyan" },
  { type: "summary", label: "Status summary", tone: "cyan" },
  { type: "say", label: "Say a message", tone: "cyan" },
  { type: "scan", label: "Scan for breakouts", tone: "violet" },
  { type: "plan", label: "Plan a trade (needs yes)", tone: "violet" },
  { type: "flatten", label: "Flatten positions", tone: "amber" },
  { type: "halt", label: "Halt the desk", tone: "coral" },
];
const VOICE_EXAMPLES = [
  "every 15 minutes scan for breakouts and watch the best one",
  "at 3 pm give me a status update",
  "if I'm down 5000 lock the desk",
  "alert me if Reliance goes above 1500",
];
const trigIcon = (t: string) => TRIGGERS.find((x) => x.type === t)?.icon ?? Zap;
const toneOf = (a: string) => ACTIONS.find((x) => x.type === a)?.tone ?? "cyan";

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={clsx("relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        on ? "bg-mint/20 border-mint/50" : "bg-white/5 border-line-2")}>
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 35 }}
        className={clsx("absolute top-0.5 h-[18px] w-[18px] rounded-full", on ? "right-0.5 bg-mint shadow-[0_0_10px_#3ddc97]" : "left-0.5 bg-muted")} />
    </button>
  );
}

function RuleCard({ r, busy, onToggle, onRun, onDelete }: {
  r: Rule; busy: boolean; onToggle: () => void; onRun: () => void; onDelete: () => void;
}) {
  const tone = toneOf(r.action.type);
  const res = r.last_result;
  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      className={clsx("panel p-4 flex flex-col gap-3 min-w-0 transition-opacity", !r.enabled && "opacity-70")}>
      <header className="flex items-start gap-3 min-w-0">
        <span className={clsx("h-10 w-10 shrink-0 grid place-items-center rounded-xl border",
          r.enabled ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-line-2 bg-white/[0.03] text-muted")}>
          {createElement(trigIcon(r.trigger.type), { size: 18 })}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[14.5px] leading-snug break-words">{r.name}</h3>
          <p className="text-[12.5px] text-ink-2 mt-0.5 leading-relaxed break-words">{r.describe}</p>
        </div>
        <Toggle on={r.enabled} onChange={onToggle} label={`${r.enabled ? "Disable" : "Enable"} ${r.name}`} />
      </header>
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <span className="chip !h-6">WHEN · {TRIGGERS.find((x) => x.type === r.trigger.type)?.label}</span>
        <ArrowRight size={12} className="text-faint" />
        <span className="chip !h-6" style={{ color: `var(--${tone})`, borderColor: `color-mix(in srgb, var(--${tone}) 45%, transparent)` }}>
          DO · {ACTIONS.find((x) => x.type === r.action.type)?.label}</span>
        {r.cooldown_min > 0 && <span className="chip !h-6 text-muted">cool-down {r.cooldown_min}m</span>}
      </div>
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 border-t border-line text-[12px]">
        <span className="text-muted">Fired <span className="num text-ink">{r.fires}</span>×</span>
        {r.last_fired && <span className="text-muted">last <span className="num text-ink-2">{r.last_fired.slice(11, 16)}</span></span>}
        {res && (
          <span className={clsx("inline-flex items-center gap-1 min-w-0", res.ok ? "text-mint" : "text-amber")}>
            {res.ok ? <CircleCheck size={13} /> : <CircleX size={13} />}
            <span className="truncate max-w-[220px]">{res.said || res.skipped || res.error || res.note ||
              (res.watching ? `watching ${res.watching}` : res.planned ? `planned ${res.planned}` : res.top ? `top ${res.top[0]}` : "done")}</span>
          </span>
        )}
        <span className="flex-1" />
        <button className="btn !h-8 !px-3 text-[12px]" onClick={onRun} disabled={busy} title="Run this action now">
          <Play size={13} />{busy ? "Running…" : "Run now"}</button>
        <button className="btn btn-ghost !h-8 !w-8 !p-0 text-muted hover:!text-coral" onClick={onDelete} aria-label={`Delete ${r.name}`}>
          <Trash2 size={14} /></button>
      </footer>
    </motion.article>
  );
}

function Builder({ onCreate }: { onCreate: (body: any) => Promise<void> }) {
  const [tt, setTt] = useState("every");
  const [at, setAt] = useState("09:30");
  const [mins, setMins] = useState(15);
  const [sym, setSym] = useState("RELIANCE");
  const [op, setOp] = useState("above");
  const [px, setPx] = useState(1500);
  const [pnl, setPnl] = useState(5000);
  const [pct, setPct] = useState(80);
  const [hits, setHits] = useState(20);
  const [at2, setAt2] = useState("scan");
  const [then, setThen] = useState("watch");
  const [text, setText] = useState("Heads up: {risk_pct}% of the risk budget is used.");
  const [planSym, setPlanSym] = useState("ETERNAL");
  const [cool, setCool] = useState(0);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const trigger = useMemo(() => ({
    time: { type: "time", at }, every: { type: "every", minutes: mins },
    price: { type: "price", symbol: sym.toUpperCase(), op, price: px },
    day_pnl: { type: "day_pnl", value: -Math.abs(pnl) }, risk_used: { type: "risk_used", pct },
    scan_hits: { type: "scan_hits", min: hits },
  } as Record<string, Trigger>)[tt], [tt, at, mins, sym, op, px, pnl, pct, hits]);
  const action = useMemo(() => ({
    scan: { type: "scan", then }, say: { type: "say", text }, plan: { type: "plan", symbol: planSym.toUpperCase() },
    flatten: { type: "flatten", symbol: "ALL" },
  } as Record<string, Action>)[at2] ?? { type: at2 }, [at2, then, text, planSym]);

  const submit = async () => {
    setErr(null);
    try { await onCreate({ name, trigger, action, cooldown_min: cool, enabled: true }); setName(""); }
    catch (e: any) { setErr(e.message); }
  };
  const field = "flex flex-col gap-1.5 min-w-0";
  return (
    <section className="panel p-4 space-y-4">
      <div className="flex items-center gap-2"><Plus size={16} className="text-cyan" /><h2 className="display text-[17px]">Build a rule</h2></div>
      <div>
        <div className="label mb-2">When</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {TRIGGERS.map((t) => (
            <button key={t.type} onClick={() => setTt(t.type)}
              className={clsx("h-auto min-h-9 px-2.5 py-2 rounded-lg border text-[12px] flex items-center gap-1.5 text-left transition-colors",
                tt === t.type ? "border-cyan/60 bg-cyan/10 text-ink" : "border-line-2 text-ink-2 hover:border-line-2 hover:bg-white/[0.03]")}>
              <t.icon size={14} className="shrink-0" /><span className="min-w-0">{t.label}</span></button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tt === "time" && <label className={field}><span className="text-[11.5px] text-muted">Time (IST)</span>
            <input className="input num" type="time" value={at} onChange={(e) => setAt(e.target.value)} /></label>}
          {tt === "every" && <label className={field}><span className="text-[11.5px] text-muted">Minutes (5–240)</span>
            <input className="input num" type="number" min={5} max={240} value={mins} onChange={(e) => setMins(+e.target.value)} /></label>}
          {tt === "price" && <>
            <label className={field}><span className="text-[11.5px] text-muted">NSE symbol</span>
              <input className="input num uppercase" value={sym} onChange={(e) => setSym(e.target.value)} /></label>
            <label className={field}><span className="text-[11.5px] text-muted">Goes</span>
              <select className="input" value={op} onChange={(e) => setOp(e.target.value)}><option value="above">above</option><option value="below">below</option></select></label>
            <label className={field}><span className="text-[11.5px] text-muted">Price ₹</span>
              <input className="input num" type="number" value={px} onChange={(e) => setPx(+e.target.value)} /></label>
          </>}
          {tt === "day_pnl" && <label className={field}><span className="text-[11.5px] text-muted">Loss of ₹</span>
            <input className="input num" type="number" value={pnl} onChange={(e) => setPnl(+e.target.value)} /></label>}
          {tt === "risk_used" && <label className={field}><span className="text-[11.5px] text-muted">% of daily limit</span>
            <input className="input num" type="number" min={1} max={100} value={pct} onChange={(e) => setPct(+e.target.value)} /></label>}
          {tt === "scan_hits" && <label className={field}><span className="text-[11.5px] text-muted">Breakouts ≥</span>
            <input className="input num" type="number" min={1} value={hits} onChange={(e) => setHits(+e.target.value)} /></label>}
        </div>
      </div>
      <div>
        <div className="label mb-2">Do</div>
        <select className="input" value={at2} onChange={(e) => setAt2(e.target.value)} aria-label="Action">
          {ACTIONS.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
        </select>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {at2 === "scan" && <label className={clsx(field, "col-span-2")}><span className="text-[11.5px] text-muted">Then</span>
            <select className="input" value={then} onChange={(e) => setThen(e.target.value)}>
              <option value="notify">just tell me the top hits</option><option value="watch">watch the cleanest breakout</option>
              <option value="plan">plan the top hit (I still say yes)</option></select></label>}
          {at2 === "say" && <label className={clsx(field, "col-span-2")}><span className="text-[11.5px] text-muted">Message · {"{equity} {day_pnl} {risk_pct} {price}"}</span>
            <input className="input" value={text} maxLength={240} onChange={(e) => setText(e.target.value)} /></label>}
          {at2 === "plan" && <label className={field}><span className="text-[11.5px] text-muted">Symbol</span>
            <input className="input num uppercase" value={planSym} onChange={(e) => setPlanSym(e.target.value)} /></label>}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <label className={field}><span className="text-[11.5px] text-muted">Name (optional)</span>
          <input className="input" value={name} maxLength={60} placeholder="My rule" onChange={(e) => setName(e.target.value)} /></label>
        <label className={field}><span className="text-[11.5px] text-muted">Cool-down min</span>
          <input className="input num" type="number" min={0} value={cool} onChange={(e) => setCool(+e.target.value)} /></label>
      </div>
      {err && <p className="text-[12.5px] text-coral">{err}</p>}
      <button className="btn btn-primary w-full" onClick={submit}><Sparkles size={15} />Create automation</button>
      <p className="text-[11.5px] text-faint leading-relaxed">Automations can brief, scan, plan, flatten and halt. They can never place an order: a planned
        ticket still waits for your spoken “yes” or an active autopilot Mandate, and every order still passes the Risk gate.</p>
    </section>
  );
}

export default function Automations() {
  const ev = useM((s) => s.eventsLog);
  const [rules, setRules] = useState<Rule[]>([]);
  const [tpls, setTpls] = useState<Template[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => api.get("/api/automations").then((d) => {
    setRules(d.automations); setTpls(d.templates); setRuns(d.runs); setLoaded(true);
  }).catch(() => setLoaded(true)), []);
  useEffect(() => { load(); }, [load]);
  const last = ev[ev.length - 1];
  useEffect(() => {
    if (last && (last.type === "automation.changed" || last.type === "automation.run" || last.type === "replay.started")) load();
  }, [last, load]);

  const toast = useM.getState().toast;
  const create = async (body: any) => { await api.post("/api/automations", body); await load(); };
  const toggle = async (r: Rule) => { await api.patch(`/api/automations/${r.id}`, { enabled: !r.enabled }).catch((e) => toast({ tone: "warn", title: "Automation", body: e.message })); load(); };
  const run = async (r: Rule) => { setBusy(r.id); await api.post(`/api/automations/${r.id}/run`).catch((e) => toast({ tone: "warn", title: "Automation", body: e.message })); setBusy(null); load(); };
  const del = async (r: Rule) => { await api.del(`/api/automations/${r.id}`).catch(() => {}); load(); };
  const speak = async (text: string) => {
    if (!text.trim()) return;
    setReply(null);
    const r = await api.chat(text).catch((e) => ({ reply: e.message }));
    setReply(r.reply); setSaid(""); load();
  };

  const on = rules.filter((r) => r.enabled).length;
  const fires = rules.reduce((a, r) => a + r.fires, 0);
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label">Automations · when X, do Y</div>
          <h1 className="display text-[clamp(1.6rem,3vw,2.2rem)] mt-1 leading-tight">Put the desk on rails</h1>
          <p className="text-ink-2 text-[13.5px] mt-1.5 max-w-2xl">Rules that run on the market clock: briefings, breakout radar, loss guards and
            price alerts. Set them up here or just say them.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
          {[["Active", on, "text-mint"], ["Saved", rules.length, "text-ink"], ["Fired", fires, "text-cyan"]].map(([l, v, c]) => (
            <div key={l as string} className="panel px-3 sm:px-4 py-2.5 sm:min-w-[110px] min-w-0">
              <div className="label !text-[9.5px]">{l}</div>
              <div className={clsx("num text-2xl mt-0.5", c as string)}>{v as number}</div>
            </div>
          ))}
        </div>
      </header>

      <section className="panel p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><Mic size={16} className="text-cyan" /><h2 className="display text-[16px] whitespace-nowrap">Say it</h2>
          <span className="text-[12px] text-muted basis-full sm:basis-auto">Type or speak a rule; the Conductor turns it into an automation.</span></div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); speak(said); }}>
          <input className="input flex-1 min-w-0" value={said} onChange={(e) => setSaid(e.target.value)}
            placeholder="every 15 minutes scan for breakouts and watch the best one" aria-label="Spoken automation" />
          <button className="btn btn-primary shrink-0" type="submit"><Bot size={15} /><span className="hidden sm:inline">Create</span></button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {VOICE_EXAMPLES.map((x) => <button key={x} className="chip text-left !h-auto py-1 leading-snug" onClick={() => speak(x)}>“{x}”</button>)}
        </div>
        <AnimatePresence>{reply && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-[13px] text-ink-2 border-l-2 border-cyan pl-3">{reply}</motion.p>)}</AnimatePresence>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5 min-w-0">
          <section>
            <h2 className="label mb-3">Your rules</h2>
            {!loaded ? <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-40" />)}</div> :
              rules.length === 0 ? <div className="panel p-8 text-center text-muted text-[13px]">No rules yet. Start from a template below.</div> : (
                <div className="grid gap-3 md:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {rules.map((r) => <RuleCard key={r.id} r={r} busy={busy === r.id} onToggle={() => toggle(r)}
                      onRun={() => run(r)} onDelete={() => del(r)} />)}
                  </AnimatePresence>
                </div>)}
          </section>
          <section>
            <h2 className="label mb-3">Templates</h2>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {tpls.map((t) => {
                const Icon = TPL_ICON[t.icon] ?? Zap;
                return (
                  <motion.button key={t.key} whileHover={{ y: -2 }} onClick={() => create({ template: t.key }).catch((e) => toast({ tone: "warn", title: "Template", body: e.message }))}
                    className="panel p-4 text-left flex gap-3 items-start group min-w-0">
                    <span className="h-9 w-9 shrink-0 grid place-items-center rounded-lg bg-violet/10 text-violet border border-violet/30"><Icon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[13.5px]">{t.name}</span>
                      <span className="block text-[12px] text-ink-2 mt-1 leading-relaxed">{t.blurb}</span>
                      <span className="inline-flex items-center gap-1 mt-2 text-[11.5px] text-cyan opacity-80 group-hover:opacity-100"><Plus size={12} />Add rule</span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </section>
        </div>
        <aside className="space-y-5 min-w-0">
          <Builder onCreate={create} />
          <section className="panel p-4">
            <h2 className="label mb-3">Activity</h2>
            {runs.length === 0 ? <p className="text-[12.5px] text-muted">Nothing has fired yet this session. Press play on the replay or “Run now”.</p> : (
              <ol className="relative space-y-3 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-line">
                {runs.slice(0, 14).map((r) => (
                  <li key={r.id} className="relative pl-5 text-[12.5px]">
                    <span className={clsx("absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-canvas", r.ok ? "bg-mint" : "bg-amber")} />
                    <div className="flex items-baseline gap-2 min-w-0"><span className="num text-muted shrink-0">{r.vclock.slice(11, 16)}</span>
                      <span className="font-medium break-words min-w-0">{r.name}</span></div>
                    <div className="text-ink-2 break-words">{r.detail?.said || r.detail?.skipped || r.detail?.error ||
                      (r.detail?.watching ? `Watching ${r.detail.watching} · plan ${r.detail.plan}` : r.detail?.planned ? `Planned ${r.detail.planned} · ${r.detail.plan}` :
                        r.detail?.top ? `${r.detail.hits} breakouts · top ${r.detail.top.slice(0, 3).join(", ")}` : r.detail?.halted ? "Desk halted" :
                          r.detail?.flattened ? `Flattened ${r.detail.flattened.join(", ") || "nothing"}` : "Done")}</div>
                  </li>
                ))}
              </ol>)}
          </section>
        </aside>
      </div>
    </div>
  );
}
