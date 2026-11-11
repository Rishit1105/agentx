"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertOctagon, Ban, CircleSlash, FileJson, Flag, ScrollText, ShieldAlert, TrendingUp, Volume2, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useQueryParam, useStories } from "@/lib/hooks";
import { fmt, useM } from "@/lib/store";
import type { Story } from "@/lib/types";
import Scorecard from "@/components/Scorecard";

const KIND: Record<string, { c: string; icon: any; label: string }> = {
  trade: { c: "#0e9f6e", icon: TrendingUp, label: "Trade" }, skip: { c: "#646b76", icon: CircleSlash, label: "Skip" },
  block: { c: "#b7790b", icon: Ban, label: "Block" }, halt: { c: "#e5484d", icon: AlertOctagon, label: "Halt" },
  summary: { c: "#0a7ea4", icon: Flag, label: "Summary" }, mode: { c: "#6e56cf", icon: ShieldAlert, label: "Mandate" },
};

function Evidence({ file, onClose }: { file: string; onClose: () => void }) {
  const [doc, setDoc] = useState<any>(null);
  useEffect(() => { api.get(`/api/evidence?file=${encodeURIComponent(file)}`).then(setDoc).catch((e) => setDoc({ error: e.message })); }, [file]);
  return (
    <motion.div className="fixed inset-0 z-50 bg-ink/30 grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel w-[760px] max-w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()} initial={{ y: 20 }} animate={{ y: 0 }}>
        <div className="flex justify-between items-center p-4 border-b border-line"><span className="num text-[13px] text-cyan">{file}</span>
          <button onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <pre className="p-4 scroll text-[11.5px] num text-ink-2 whitespace-pre-wrap">{doc ? JSON.stringify(doc, null, 2) : "loading…"}</pre>
      </motion.div>
    </motion.div>
  );
}

function StoryView({ s }: { s: Story }) {
  const [ev, setEv] = useState<string | null>(null);
  const k = KIND[s.kind] || KIND.summary;
  const files = (s.evidence?.files || []) as any[];
  const sections = [["Why", s.why], ["What I checked", s.checked], ["If I'm wrong", s.if_wrong], ["Outcome", s.outcome]];
  return (
    <motion.article key={s.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="panel p-6 space-y-5">
      <div className="flex items-start gap-4">
        <span className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: k.c + "1f", color: k.c }}><k.icon size={20} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><span className="label" style={{ color: k.c }}>{k.label}</span>
            {s.symbol && <span className="chip !h-5 num !text-[11px]">{s.symbol}</span>}
            <span className="text-[11.5px] text-faint num">{s.vclock}</span></div>
          <h2 className="display text-[24px] leading-tight mt-1.5">{s.headline}</h2>
        </div>
        {s.pnl != null && <div className="text-right"><div className={clsx("num text-2xl", s.pnl >= 0 ? "pos" : "neg")}>{fmt.usd(s.pnl)}</div>
          {s.r != null && <div className="num text-[12px] text-muted">{fmt.sgn(s.r)}R</div>}</div>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map(([h, t]) => t ? (
          <div key={h} className="rounded-xl border border-line bg-black/20 p-4">
            <div className="label mb-1.5">{h}</div><p className="text-[13.5px] leading-relaxed text-ink-2">{t}</p></div>) : null)}
      </div>
      <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-4 flex gap-3 items-start">
        <Volume2 size={16} className="text-cyan mt-0.5 shrink-0" />
        <p className="text-[13.5px] flex-1">“{s.spoken}”</p>
        <button className="btn !h-8 !text-[12px]" onClick={() => api.post("/api/tts/speak", { text: s.spoken })}>Read aloud</button>
      </div>
      {files.length > 0 && (
        <div>
          <div className="label mb-2">Evidence trail</div>
          <div className="flex flex-wrap gap-2">{files.map((f: any) => {
            const name = typeof f === "string" ? f : f.file;
            return <button key={name} onClick={() => setEv(name)} className="chip num !text-[11px] hover:!text-cyan"><FileJson size={12} />{name.replace("trader/", "")}
              {typeof f !== "string" && f.sha256 && <span className="text-faint">#{f.sha256.slice(0, 8)}</span>}</button>;
          })}</div>
        </div>
      )}
      <div className="text-[11px] text-faint flex items-center gap-1.5"><ScrollText size={12} />Written by {s.writer}. Every number is checked against the tool evidence.</div>
      <AnimatePresence>{ev && <Evidence file={ev} onClose={() => setEv(null)} />}</AnimatePresence>
    </motion.article>
  );
}

function Ledger() {
  const focus = useM((s) => s.storyFocus);
  const [filter, setFilter] = useState<string | null>(null);
  const stories = useStories();
  const qs = useQueryParam("story");
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (qs) setSel(qs); }, [qs]);
  useEffect(() => { if (focus) setSel(focus); }, [focus]);
  const list = stories.filter((s) => !filter || s.kind === filter);
  const current = stories.find((s) => s.id === sel) || list[0];
  return (
    <div className="p-4 flex flex-col gap-4 lg:h-full min-h-0">
    <Scorecard />
    <div className="grid gap-4 lg:grid-cols-[380px_1fr] flex-1 min-h-0">
      <section className="panel p-4 flex flex-col min-h-0">
        <div className="flex items-center justify-between"><div><div className="label">Ledger</div><h1 className="display text-2xl mt-1">Every decision, explained</h1></div></div>
        <div className="flex gap-1.5 mt-4 flex-wrap">
          {[null, "trade", "skip", "block", "halt", "summary"].map((k) => (
            <button key={k ?? "all"} onClick={() => setFilter(k)} className={clsx("chip !h-7 capitalize", filter === k && "!text-cyan !border-cyan/50 bg-cyan/10")}>
              {k ?? "all"} <span className="num text-faint">{k ? stories.filter((s) => s.kind === k).length : stories.length}</span></button>
          ))}
        </div>
        <div className="mt-4 flex-1 min-h-0 scroll -mr-2 pr-2">
          {!list.length && <p className="text-muted text-[13px] mt-6">No stories yet. Trades, skips, blocks and halts all land here, with evidence.</p>}
          <ol className="relative border-l border-line ml-2 space-y-1">
            {list.map((s) => {
              const k = KIND[s.kind] || KIND.summary;
              return (
                <li key={s.id}>
                  <button onClick={() => setSel(s.id)} className={clsx("w-full text-left pl-5 pr-3 py-2.5 rounded-r-xl relative transition-colors",
                    current?.id === s.id ? "bg-ink/[0.05]" : "hover:bg-ink/[0.03]")}>
                    <span className="absolute -left-[6px] top-4 h-[11px] w-[11px] rounded-full border-2" style={{ borderColor: k.c, background: "#f6f5f1" }} />
                    <div className="flex items-center gap-2 text-[11px]"><span style={{ color: k.c }}>{k.label}</span>
                      <span className="num text-faint">{s.vclock.slice(11, 16)}</span>
                      {s.pnl != null && <span className={clsx("num ml-auto", s.pnl >= 0 ? "pos" : "neg")}>{fmt.usd(s.pnl)}</span>}</div>
                    <div className="text-[13px] mt-0.5 leading-snug line-clamp-2">{s.headline}</div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
      <div className="min-w-0">{current ? <StoryView s={current} /> : <div className="panel p-10 text-muted">Select a story.</div>}</div>
    </div>
    </div>
  );
}

export default function Page() {
  return <Ledger />;
}
