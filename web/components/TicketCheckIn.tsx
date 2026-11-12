"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HeartPulse, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";
import type { Ticket } from "@/lib/types";

const MOOD_LABEL: Record<string, string> = {
  calm: "Calm", confident: "Confident", anxious: "Anxious", fomo: "FOMO", revenge: "Revenge", bored: "Bored",
};

/** The pre-entry check-in: tilt warnings from the guard, plus how the trader feels and how sure they are. */
export default function TicketCheckIn({ t }: { t: Ticket }) {
  const [busy, setBusy] = useState(false);
  const send = async (body: { mood?: string; confidence?: number }) => {
    setBusy(true);
    try {
      const r = await api.post("/api/ticket/mood", { mood: body.mood ?? t.mood, confidence: body.confidence ?? t.confidence });
      if (r.cancelled) useM.getState().toast({ tone: "warn", title: "Ticket cancelled", body: r.reason });
    } catch (e) {
      useM.getState().toast({ tone: "warn", title: "Check-in", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const signals = t.tilt?.signals ?? [];
  return (
    <div className="mt-3 space-y-2.5">
      <AnimatePresence>
        {signals.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-[12px] text-amber">
            <div className="flex items-center gap-1.5 font-semibold"><TriangleAlert size={13} />Tilt check</div>
            <ul className="mt-1 space-y-0.5 text-ink-2">{signals.map((s) => <li key={s.text}>· {s.text}</li>)}</ul>
          </motion.div>
        )}
      </AnimatePresence>
      <div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted"><HeartPulse size={12} />How are you feeling?</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(t.moods ?? Object.keys(MOOD_LABEL)).map((m) => (
            <button key={m} disabled={busy} onClick={() => send({ mood: m })}
              className={clsx("chip !h-7 text-[11.5px]", t.mood === m && "!border-ink !text-ink !bg-ink/[0.06]",
                m === "revenge" && "hover:!border-coral hover:!text-coral")}>
              {MOOD_LABEL[m] ?? m}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] text-muted shrink-0">Confidence</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Confidence 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} role="radio" aria-checked={t.confidence === n} disabled={busy} onClick={() => send({ confidence: n })}
              className={clsx("h-7 w-7 rounded-md border text-[12px] num transition-colors",
                t.confidence === n ? "bg-ink text-white border-ink" : "border-line-2 text-ink-2 hover:border-ink-2")}>{n}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
