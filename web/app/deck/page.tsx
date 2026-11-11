"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Bot, Check, Clock3, Loader2, Sparkles } from "lucide-react";
import clsx from "clsx";
import Orb from "@/components/Orb";
import Orrery from "@/components/Orrery";
import { CaptionRibbon, CommandBar, PriceLadder, RiskReservoir, Sundial } from "@/components/Instruments";
import { useSize, useStories } from "@/lib/hooks";
import { fmt, useM } from "@/lib/store";
import { ticketAction } from "@/lib/ticket";
import { mic, speaker } from "@/lib/voice";

const STATE_LABEL: Record<string, string> = { idle: "Standing by", listening: "Listening", thinking: "Working", speaking: "Speaking",
  awaiting_confirm: "Waiting for your yes", halted: "Halted" };

function Pipeline() {
  const pipe = useM((s) => s.pipeline);
  if (!pipe.symbol) return null;
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      <span className="label mr-2">{pipe.symbol}</span>
      {pipe.steps.map((s) => (
        <span key={s.step} title={s.detail} className={clsx("h-6 px-2 rounded-md text-[10.5px] flex items-center gap-1 border transition-all",
          s.status === "done" ? "border-mint/30 text-mint bg-mint/5" : s.status === "running" ? "border-cyan/50 text-cyan bg-cyan/10" :
          s.status === "blocked" || s.status === "error" ? "border-coral/40 text-coral bg-coral/10" : s.status === "waiting" ?
          "border-amber/40 text-amber bg-amber/10" : "border-line text-faint")}>
          {s.status === "done" ? <Check size={11} /> : s.status === "running" ? <Loader2 size={11} className="animate-spin" /> : null}
          {s.name}</span>
      ))}
    </div>
  );
}

function TicketCard() {
  const t = useM((s) => s.st?.ticket);
  if (!t) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel p-4 !border-amber/40"
      style={{ boxShadow: "0 0 0 1px rgba(183,121,11,.15), 0 20px 50px -20px rgba(183,121,11,.25)" }}>
      <div className="flex items-center justify-between"><span className="label !text-amber">Ticket · risk gate PASS</span>
        <span className="num text-[10.5px] text-faint">#{t.fingerprint}</span></div>
      <div className="display text-[22px] mt-1.5">BUY <span className="num">{t.qty}</span> {t.symbol}</div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">
        <div><div className="text-muted">Entry</div><div className="num">{fmt.px(t.entry)}</div></div>
        <div><div className="text-muted">Stop</div><div className="num neg">{fmt.px(t.stop)}</div></div>
        <div><div className="text-muted">Target</div><div className="num pos">{fmt.px(t.target)}</div></div>
      </div>
      <div className="text-[12px] text-ink-2 mt-3">Max loss <span className="num text-ink">{fmt.usd(t.max_loss)}</span> · stop can fill worse in a fast market.</div>
      <div className="text-[11.5px] text-amber/90 mt-1">{t.tm_verdict}</div>
      <div className="flex gap-2 mt-4">
        <button className="btn btn-mint flex-1" onClick={() => ticketAction(t.index, "approve")}>“{t.say}”</button>
        <button className="btn" onClick={() => ticketAction(t.index, "decline")}>No</button>
      </div>
      <Link href="/studio" className="mt-3 inline-flex items-center gap-1 text-[12px] text-cyan">Open in Trade Studio <ArrowUpRight size={13} /></Link>
    </motion.div>
  );
}

export default function Deck() {
  const st = useM((s) => s.st);
  const voice = useM((s) => s.voice);
  const stories = useStories();
  const [ref, size] = useSize<HTMLDivElement>();
  const orrery = Math.max(300, Math.min(size.w - 40, size.h - 40, 620));
  const latest = stories[0];
  const pos = st?.positions?.[0];
  const mandate = st?.mandate;

  return (
    <div className="h-full grid gap-4 p-4 grid-cols-1 lg:grid-cols-[1fr_330px] xl:grid-cols-[250px_1fr_340px]">
      {/* left: the Sundial */}
      <section className="panel p-4 hidden xl:flex flex-col min-h-0">
        <div className="flex items-center justify-between"><span className="label">Session Sundial</span>
          <Clock3 size={14} className="text-faint" /></div>
        <div className="flex-1 min-h-0 mt-4"><Sundial stories={stories} /></div>
        {st?.watch && Object.keys(st.watch).length > 0 && (
          <div className="mt-3 text-[12px] text-amber">Watching {Object.keys(st.watch).join(", ")} bar by bar</div>
        )}
      </section>

      {/* centre: Orb inside the Orrery */}
      <section className="flex flex-col min-h-[640px] min-w-0">
        <div ref={ref} className="relative flex-1 min-h-[420px] grid place-items-center">
          {size.w > 0 && (
            <Orrery size={orrery}>
              <button onClick={async () => {
                  speaker.ensure();
                  if (mic.recording && mic.mode === "ptt") { mic.pttUp(); return; }
                  if (await mic.start()) mic.pttDown();
                }}
                className="rounded-full" aria-label="Talk to Meridian (click to start, click again to send)">
                <Orb state={voice} size={Math.round(orrery * 0.5)} />
              </button>
            </Orrery>
          )}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <span className={clsx("chip", voice === "halted" ? "!text-coral" : voice === "awaiting_confirm" ? "!text-amber" : "!text-cyan")}>
              <Sparkles size={13} />{STATE_LABEL[voice] || voice}</span>
            {mandate && <span className="chip !text-violet !border-violet/40"><Bot size={13} />Mandate {mandate.id} · {mandate.used}/{mandate.max_trades}
              · until {mandate.expires_ts.slice(11, 16)}</span>}
          </div>
        </div>
        <div className="space-y-4 max-w-[760px] w-full mx-auto">
          <Pipeline />
          <CaptionRibbon />
          <CommandBar />
        </div>
      </section>

      {/* right: risk, position/ticket, balance, latest story */}
      <aside className="flex flex-col gap-4 min-h-0">
        <section className="panel p-4"><RiskReservoir /></section>
        <TicketCard />
        {pos && <section className="panel p-4"><div className="label mb-3">Open position</div><PriceLadder p={pos} /></section>}
        <section className="panel p-4">
          <div className="label">Paper balance</div>
          <div className="display text-[30px] num mt-1">{fmt.usd(st?.account.equity)}</div>
          <div className="flex gap-4 text-[12px] mt-1">
            <span className="text-muted">Day <span className={clsx("num", (st?.account.day_pnl ?? 0) >= 0 ? "pos" : "neg")}>{fmt.usd(st?.account.day_pnl)}</span></span>
            <span className="text-muted">Cash <span className="num text-ink-2">{fmt.usd(st?.account.cash)}</span></span>
            <span className="text-muted">DD <span className="num text-ink-2">{st?.account.drawdown_pct?.toFixed(2)}%</span></span>
          </div>
        </section>
        {latest && (
          <Link href={`/ledger?story=${latest.id}`} className="panel p-4 block hover:!border-line-2 transition-colors">
            <div className="flex items-center justify-between"><span className="label">Latest story</span>
              <span className="chip !h-5 !text-[10px] uppercase">{latest.kind}</span></div>
            <p className="text-[14px] mt-2 leading-snug">{latest.headline}</p>
            <p className="text-[12px] text-muted mt-2 line-clamp-2">{latest.why}</p>
          </Link>
        )}
      </aside>
    </div>
  );
}
