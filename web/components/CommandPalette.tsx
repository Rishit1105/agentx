"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight, BookText, Briefcase, CandlestickChart, Command, CornerDownLeft, FlaskConical, Home, LayoutGrid, Mic,
  OctagonX, Pause, Play, Search, Shield, Workflow,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";

type Item = { id: string; group: string; label: string; hint?: string; icon: typeof Search; run: () => void | Promise<void>; tone?: string };

const SAY: [string, string][] = [
  ["Good morning briefing", "Hey Meridian, good morning"],
  ["Scan for breakouts", "Scan for breakouts"],
  ["Plan a trade on Zomato", "Plan a trade on Zomato"],
  ["What are the odds?", "What are the odds?"],
  ["Where's the stop?", "Where's the stop?"],
  ["Any bulk deals?", "Any bulk deals?"],
  ["How are sectors doing?", "How are sectors doing?"],
  ["What if I buy 300 Infosys?", "what if I buy 300 infosys"],
  ["Move my stop to breakeven", "move my stop to breakeven"],
  ["How did Reliance's results look?", "How did Reliance's earnings look?"],
  ["Backtest against buy and hold", "Backtest it against buy and hold"],
  ["What are my guardrails?", "What are my guardrails?"],
  ["How am I doing?", "How am I doing?"],
  ["Why did you buy?", "Why did you buy?"],
  ["Every 15 minutes scan and watch the best one", "every 15 minutes scan for breakouts and watch the best one"],
  ["If I'm down ₹5,000, lock the desk", "if I'm down 5000 lock the desk"],
  ["List my automations", "list my automations"],
];

/** ⌘K / Ctrl-K: jump anywhere, or say anything to the Conductor without the mic. */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const paused = useM((s) => s.st?.clock?.paused);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setQ(""); setIdx(0); setOpen((o) => !o);
      }
    };
    const onOpen = () => { setQ(""); setIdx(0); setOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("meridian:palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("meridian:palette", onOpen); };
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 20); }, [open]);

  const close = () => setOpen(false);
  const say = (text: string) => async () => {
    close();
    const r = await api.chat(text).catch((e) => ({ reply: e.message }));
    if (r?.reply) useM.getState().toast({ tone: "info", title: "Meridian", body: r.reply });
  };
  const go = (href: string) => () => { close(); router.push(href); };

  const items: Item[] = useMemo(() => [
    { id: "n-deck", group: "Go to", label: "Command Deck", icon: LayoutGrid, run: go("/deck"), hint: "1" },
    { id: "n-markets", group: "Go to", label: "Markets · sector heatmap", icon: LayoutGrid, run: go("/markets"), hint: "2" },
    { id: "n-studio", group: "Go to", label: "Trade Studio", icon: CandlestickChart, run: go("/studio"), hint: "3" },
    { id: "n-bt", group: "Go to", label: "Backtest Lab", icon: FlaskConical, run: go("/backtest"), hint: "4" },
    { id: "n-pf", group: "Go to", label: "My Portfolio", icon: Briefcase, run: go("/portfolio"), hint: "5" },
    { id: "n-review", group: "Go to", label: "Trade Review · post-mortem", icon: BookText, run: go("/review"), hint: "6" },
    { id: "n-ledger", group: "Go to", label: "Ledger & Scorecard", icon: BookText, run: go("/ledger"), hint: "7" },
    { id: "n-auto", group: "Go to", label: "Automations", icon: Workflow, run: go("/automations"), hint: "8" },
    { id: "n-guard", group: "Go to", label: "Guardrails", icon: Shield, run: go("/guardrails"), hint: "9" },
    { id: "n-home", group: "Go to", label: "Landing page", icon: Home, run: go("/") },
    { id: "r-play", group: "Replay", label: paused ? "Play the NSE replay" : "Pause the NSE replay", icon: paused ? Play : Pause,
      run: async () => { close(); await api.post("/api/replay/control", { paused: !paused }).catch(() => {}); } },
    ...SAY.map(([label, text], i) => ({ id: `s-${i}`, group: "Say to Meridian", label, icon: Mic, run: say(text) })),
    { id: "k-halt", group: "Safety", label: "Stop everything (kill switch)", icon: OctagonX, tone: "coral",
      run: async () => { close(); await api.kill("palette").catch(() => {}); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [paused]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = t ? items.filter((it) => (it.label + " " + it.group).toLowerCase().split(" ").some((w) => w.startsWith(t)) ||
      it.label.toLowerCase().includes(t)) : items;
    if (t && !base.some((b) => b.group === "Say to Meridian" && b.label.toLowerCase() === t)) {
      return [...base, { id: "free", group: "Say to Meridian", label: `Say “${q.trim()}”`, icon: Mic, run: say(q.trim()) } as Item];
    }
    return base;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, items]);
  const active = Math.min(idx, Math.max(0, filtered.length - 1));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); filtered[active]?.run(); }
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] bg-[#05080d]/60 backdrop-blur-sm flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}
            initial={{ y: -12, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -8, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="panel w-full max-w-[640px] overflow-hidden !rounded-2xl">
            <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
              <Search size={17} className="text-muted shrink-0" />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey}
                placeholder="Jump to a screen, or say anything to Meridian…" aria-label="Command"
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-faint" />
              <kbd className="chip !h-6 text-[11px] shrink-0">esc</kbd>
            </div>
            <ul className="max-h-[52vh] scroll py-2" role="listbox">
              {filtered.map((it, i) => {
                const head = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                return (
                  <li key={it.id}>
                    {head && <div className="label px-4 pt-3 pb-1.5 !text-[9.5px]">{head}</div>}
                    <button role="option" aria-selected={i === active} onMouseEnter={() => setIdx(i)} onClick={() => it.run()}
                      className={clsx("w-full flex items-center gap-3 px-4 h-11 text-left text-[13.5px] transition-colors",
                        i === active ? "bg-cyan/10 text-ink" : "text-ink-2")}>
                      <it.icon size={16} className={clsx("shrink-0", it.tone === "coral" ? "text-coral" : i === active ? "text-cyan" : "text-muted")} />
                      <span className="flex-1 min-w-0 truncate">{it.label}</span>
                      {it.hint && <kbd className="num text-[11px] text-faint">{it.hint}</kbd>}
                      {i === active && <CornerDownLeft size={14} className="text-muted shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 px-4 h-10 border-t border-line text-[11.5px] text-faint">
              <span className="flex items-center gap-1"><Command size={12} />K to toggle</span>
              <span className="flex items-center gap-1"><ArrowRight size={12} />Enter to run</span>
              <span className="ml-auto hidden sm:inline">Orders still need a spoken “yes”.</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
