"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView } from "motion/react";
import { useReducedMotion } from "./context";
import Odometer from "./money/Odometer";

/** Illustrative quotes for the simulated tape (paper only, not live data). */
const QUOTES = [
  { sym: "NIFTY 50", px: 24318.75 },
  { sym: "ETERNAL", px: 370.75 },
  { sym: "RELIANCE", px: 1298.4 },
  { sym: "HDFCBANK", px: 1742.15 },
  { sym: "SUNTV", px: 612.3 },
  { sym: "INFY", px: 1563.9 },
  { sym: "TCS", px: 3412.55 },
  { sym: "ICICIBANK", px: 1281.3 },
  { sym: "SBIN", px: 812.45 },
  { sym: "LT", px: 3566.2 },
];

/** Agent events interleaved with the quotes, in the order they appear. */
const EVENTS = [
  { who: "Scanner", what: "130 of 497 above the 15-min range", tone: "var(--lp-violet)" },
  { who: "Risk", what: "PASS · rk_9f3a…c1", tone: "var(--lp-cyan)" },
  { who: "Sentinel", what: "data fresh · 0.4 s", tone: "var(--lp-amber)" },
  { who: "Journalist", what: "Story written · 6/6 checked", tone: "var(--lp-violet)" },
  { who: "Paper Exchange", what: "filled 482 @ 370.80", tone: "var(--lp-mint)" },
];

const fmt = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Quote = { sym: string; px: number; open: number };

function Item({ q }: { q: Quote }) {
  const chg = ((q.px - q.open) / q.open) * 100;
  const up = chg >= 0;
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap px-5 text-[13px]">
      <span className="font-semibold tracking-[-0.01em] text-(--lp-ink)">{q.sym}</span>
      <span className="text-(--lp-ink-2)"><Odometer value={fmt(q.px)} /></span>
      <span className="lp-mono text-[12px]" style={{ color: up ? "var(--lp-mint)" : "var(--lp-coral)" }}>
        {up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
      </span>
    </span>
  );
}

function Event({ e }: { e: (typeof EVENTS)[number] }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap px-5 text-[12.5px]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.tone }} />
      <span className="font-medium text-(--lp-ink-2)">{e.who}</span>
      <span className="text-(--lp-muted)">{e.what}</span>
    </span>
  );
}

/** A simulated NSE tape: rolling-digit quotes with the agents' own events woven in. */
export default function Tape() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const reduced = useReducedMotion();
  const [quotes, setQuotes] = useState<Quote[]>(() => QUOTES.map((q) => ({ ...q, open: q.px * 0.996 })));

  // a gentle random walk, a few symbols per tick, only while the tape is on screen
  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => {
      setQuotes((qs) =>
        qs.map((q) => {
          if (Math.random() > 0.35) return q;
          const step = q.px * (Math.random() - 0.48) * 0.0016;
          return { ...q, px: Math.round((q.px + step) * 20) / 20 };
        }),
      );
    }, 1400);
    return () => clearInterval(id);
  }, [inView, reduced]);

  // quotes and events woven together: two quotes, one event, and so on
  const row: ReactNode[] = [];
  quotes.forEach((q, i) => {
    row.push(<Item key={q.sym} q={q} />);
    if (i % 2 === 1) {
      const e = EVENTS[((i - 1) / 2) % EVENTS.length];
      row.push(<Event key={e.who} e={e} />);
    }
  });

  return (
    <div ref={ref} role="group" aria-label="Simulated market tape" className="lp-white relative border-t border-(--lp-line)">
      <p className="sr-only">
        A simulated NSE tape for illustration, paper only: {QUOTES.map((q) => q.sym).join(", ")}, interleaved with agent events such as{" "}
        {EVENTS.map((e) => `${e.who}: ${e.what}`).join("; ")}.
      </p>
      <div aria-hidden className="flex h-12 items-stretch">
        <span className="z-10 flex shrink-0 items-center gap-2 border-r border-(--lp-line) bg-(--lp-bg) pl-4 pr-4 sm:pl-6">
          <span className="relative flex h-1.5 w-1.5">
            {!reduced && <span className="lp-ping absolute inset-0 rounded-full bg-(--lp-mint)" />}
            <span className="relative h-1.5 w-1.5 rounded-full bg-(--lp-mint)" />
          </span>
          <span className="lp-eyebrow text-[10.5px] text-(--lp-ink-2)">
            <span className="hidden sm:inline">Simulated </span>tape
          </span>
        </span>
        <div className="lp-tape-viewport relative min-w-0 flex-1 overflow-hidden">
          <div className="lp-marquee flex h-full items-center">
            <div className="flex shrink-0 items-center">{row}</div>
            <div className="flex shrink-0 items-center">{row}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
