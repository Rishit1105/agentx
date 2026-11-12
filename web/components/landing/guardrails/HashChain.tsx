"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { Check, Link2, RotateCcw, Unlink } from "lucide-react";
import clsx from "clsx";
import { useReducedMotion } from "../context";

/* One trade, as the Ledger records it. Each block's hash covers its payload and the previous hash. */
const RECORDS = [
  { kind: "Plan", detail: "ETERNAL · 482 @ 370.75 · stop 365.57" },
  { kind: "Risk gate", detail: "PASS · ₹2,496.76 of ₹2,500" },
  { kind: "Voice confirm", detail: "“yes, buy 482 ETERNAL”" },
  { kind: "Paper fill", detail: "482 @ 370.80 · paper only" },
  { kind: "Exit", detail: "target 375.93 · 14:06 IST" },
  { kind: "Story", detail: "6 of 6 numbers checked" },
];
const TAMPERED = "PASS · ₹3,108.00 of ₹2,500";
const GENESIS = "0000000000000000";
const FIRST_ID = 1041;

/** FNV-1a, run twice with different offsets for 64 bits of hex. A stand-in for the desk's SHA-256 chain. */
function hash(text: string) {
  const run = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return run(0x811c9dc5) + run(0x9e3779b9);
}

function chain(tampered: boolean) {
  const out: { kind: string; detail: string; hash: string }[] = [];
  let prev = GENESIS;
  RECORDS.forEach((r, i) => {
    const detail = tampered && i === 1 ? TAMPERED : r.detail;
    const h = hash(`${i}|${r.kind}|${detail}|${prev}`);
    out.push({ kind: r.kind, detail, hash: h });
    prev = h;
  });
  return out;
}
/** The chain as it was first written: what each later block committed to. */
const ORIGINAL = chain(false);
const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;

/** The Ledger, compact: one trade's blocks verified one by one, and a button to tamper with the record. */
export default function HashChain() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const [verified, setVerified] = useState(0);
  const [tampered, setTampered] = useState(false);

  // verify one block at a time once the chain is on screen
  useEffect(() => {
    if (!inView) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setVerified(n);
      if (n >= RECORDS.length) clearInterval(id);
    }, reduced ? 16 : 260);
    return () => clearInterval(id);
  }, [inView, reduced]);

  const blocks = tampered ? chain(true) : ORIGINAL;
  const brokenFrom = blocks.findIndex((b, i) => b.hash !== ORIGINAL[i].hash);
  const showBroken = brokenFrom !== -1 && verified > brokenFrom;

  return (
    <div ref={ref} className="lp-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="lp-eyebrow">The Ledger · one trade</p>
        <p className="lp-mono text-[11px] text-(--lp-muted)">append-only · hash-chained</p>
      </div>

      <ol className="mt-4" aria-label="Hash-chained ledger entries">
        {blocks.map((b, i) => {
          const checked = i < verified;
          const broken = brokenFrom !== -1 && i >= brokenFrom && checked;
          const ok = checked && !broken;
          return (
            <motion.li
              key={b.kind}
              animate={{ opacity: checked ? 1 : 0.45, x: checked ? 0 : -6 }}
              transition={{ duration: 0.3 }}
              className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-(--lp-line) py-2 last:border-b-0"
            >
              <span
                className="grid h-5 w-5 place-items-center rounded-full transition-colors duration-300"
                style={{
                  background: broken ? "var(--lp-coral-soft)" : ok ? "var(--lp-mint-soft)" : "var(--lp-surface-2)",
                  color: broken ? "var(--lp-coral)" : "var(--lp-mint)",
                }}
                aria-label={broken ? "Hash mismatch" : ok ? "Verified" : "Not yet verified"}
              >
                {broken ? <Unlink size={11} /> : ok ? <Check size={12} /> : null}
              </span>
              <span className="min-w-0">
                <span className="text-[13.5px] font-semibold">
                  <span className="lp-mono mr-2 text-[11px] font-normal text-(--lp-muted)">#{FIRST_ID + i}</span>
                  {b.kind}
                </span>
                <span className={clsx("block truncate text-[12.5px]", tampered && i === 1 ? "text-(--lp-coral)" : "text-(--lp-ink-2)")}>
                  {b.detail}
                </span>
              </span>
              <span className="lp-mono text-[11px]" style={{ color: broken ? "var(--lp-coral)" : "var(--lp-muted)" }}>
                {short(b.hash)}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-col gap-3 border-t border-(--lp-line) pt-4 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
        <p className="flex items-start gap-2 text-[13px]">
          {showBroken ? (
            <>
              <Unlink size={15} className="mt-0.5 shrink-0 text-(--lp-coral)" aria-hidden />
              <span><span className="font-semibold text-(--lp-coral)">Chain broken at #{FIRST_ID + brokenFrom}.</span>{" "}
                <span className="text-(--lp-ink-2)">Every later hash disagrees.</span></span>
            </>
          ) : (
            <>
              <Link2 size={15} className="mt-0.5 shrink-0 text-(--lp-mint)" aria-hidden />
              <span className="text-(--lp-ink-2)">
                <span className="lp-mono font-semibold text-(--lp-ink)">{verified}/{RECORDS.length}</span> blocks verified
                {verified >= RECORDS.length ? " · chain intact" : ""}
              </span>
            </>
          )}
        </p>
        <button type="button" onClick={() => setTampered((t) => !t)} className="lp-btn lp-btn-ghost h-9 self-start px-3.5 text-[13px] sm:self-auto">
          {tampered ? <><RotateCcw size={14} aria-hidden /> Restore the record</> : <>Try editing #{FIRST_ID + 1}</>}
        </button>
      </div>
    </div>
  );
}
