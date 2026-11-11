"use client";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { Check, Link2, RotateCcw, Unlink } from "lucide-react";
import clsx from "clsx";
import { useScrollRoot } from "./context";
import { SectionHeader } from "./ui";

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
  const out: { kind: string; detail: string; prev: string; hash: string }[] = [];
  let prev = GENESIS;
  RECORDS.forEach((r, i) => {
    const detail = tampered && i === 1 ? TAMPERED : r.detail;
    const h = hash(`${i}|${r.kind}|${detail}|${prev}`);
    out.push({ kind: r.kind, detail, prev, hash: h });
    prev = h;
  });
  return out;
}
/** The chain as it was first written: what each later block committed to. */
const ORIGINAL = chain(false);
const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;

/** The Ledger: every event of a trade, hash-chained, verified block by block as you scroll. */
export default function Ledger() {
  const container = useScrollRoot();
  const ref = useRef<HTMLOListElement>(null);
  const [verified, setVerified] = useState(0);
  const [tampered, setTampered] = useState(false);

  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start 0.85", "end 0.6"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const n = Math.min(RECORDS.length, Math.max(0, Math.floor(v * (RECORDS.length + 0.6))));
    setVerified((cur) => (cur === n ? cur : n));
  });

  const blocks = tampered ? chain(true) : ORIGINAL;
  // a block is intact while its hash still matches the one written when the chain was sealed
  const brokenFrom = blocks.findIndex((b, i) => b.hash !== ORIGINAL[i].hash);
  const allChecked = verified >= RECORDS.length;
  const showBroken = brokenFrom !== -1 && verified > brokenFrom;

  return (
    <section id="ledger" aria-label="The Ledger" className="lp-anchor lp-white relative border-t border-(--lp-line)">
      <div className="lp-wrap py-24 sm:py-32">
        <SectionHeader
          eyebrow="The Ledger"
          title={<>Every decision, sealed. <span className="text-(--lp-muted)">Change one and the chain says so.</span></>}
          lead="Each event of a trade is written to an append-only ledger. Every entry carries the hash of the one before it, so nothing can be edited quietly after the fact."
        />

        <ol ref={ref} className="mt-12 flex flex-col sm:mt-16 lg:flex-row lg:items-stretch" aria-label="Hash-chained ledger entries">
          {blocks.map((b, i) => {
            const checked = i < verified;
            const broken = brokenFrom !== -1 && i >= brokenFrom && checked;
            const ok = checked && !broken;
            return (
              <li key={b.kind} className="flex min-w-0 flex-col lg:flex-1 lg:flex-row">
                {i > 0 && (
                  <span aria-hidden className="relative mx-auto h-6 w-px shrink-0 bg-(--lp-line-2) lg:mx-0 lg:my-auto lg:h-px lg:w-3 xl:w-5">
                    <span
                      className="absolute inset-0 origin-top transition-transform duration-500 lg:origin-left"
                      style={{
                        background: broken ? "var(--lp-coral)" : "var(--lp-mint)",
                        transform: checked ? "scale(1)" : "scale(0)",
                      }}
                    />
                  </span>
                )}
                <motion.div
                  animate={{ y: checked ? 0 : 6, opacity: checked ? 1 : 0.55 }}
                  transition={{ duration: 0.35 }}
                  className="relative flex min-w-0 flex-1 flex-col rounded-xl border bg-(--lp-surface) p-3.5 transition-colors duration-300"
                  style={{
                    borderColor: broken ? "var(--lp-coral)" : ok ? "color-mix(in srgb, var(--lp-mint) 55%, var(--lp-line))" : "var(--lp-line)",
                    boxShadow: "var(--lp-shadow)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="lp-mono text-[11px] text-(--lp-muted)">#{1041 + i}</span>
                    <span
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-300"
                      style={{
                        background: broken ? "var(--lp-coral-soft)" : ok ? "var(--lp-mint-soft)" : "var(--lp-surface-2)",
                        color: broken ? "var(--lp-coral)" : "var(--lp-mint)",
                      }}
                      aria-label={broken ? "Hash mismatch" : ok ? "Verified" : "Not yet verified"}
                    >
                      {broken ? <Unlink size={11} /> : ok ? <Check size={12} /> : null}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] font-semibold tracking-[-0.01em]">{b.kind}</p>
                  <p className={clsx("mt-1 text-pretty text-[12.5px] leading-snug", tampered && i === 1 ? "text-(--lp-coral)" : "text-(--lp-ink-2)")}>
                    {b.detail}
                  </p>
                  <div className="lp-mono mt-auto space-y-0.5 pt-3 text-[10.5px] text-(--lp-muted)">
                    <p>prev {short(b.prev)}</p>
                    <p style={{ color: broken ? "var(--lp-coral)" : undefined }}>hash {short(b.hash)}</p>
                  </div>
                </motion.div>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-col gap-4 border-t border-(--lp-line) pt-6 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
          <p className="flex items-center gap-2 text-[14px]">
            {showBroken ? (
              <>
                <Unlink size={15} className="shrink-0 text-(--lp-coral)" aria-hidden />
                <span><span className="font-semibold text-(--lp-coral)">Chain broken at #{1041 + brokenFrom}.</span>{" "}
                  <span className="text-(--lp-ink-2)">Someone edited the risk verdict, and every later hash disagrees.</span></span>
              </>
            ) : (
              <>
                <Link2 size={15} className="shrink-0 text-(--lp-mint)" aria-hidden />
                <span className="text-(--lp-ink-2)">
                  <span className="lp-mono font-semibold text-(--lp-ink)">{verified}/{RECORDS.length}</span> blocks verified
                  {allChecked ? " · chain intact" : ""}
                </span>
              </>
            )}
          </p>
          <button type="button" onClick={() => setTampered((t) => !t)} className="lp-btn lp-btn-ghost h-9 self-start px-3.5 text-[13px] sm:self-auto">
            {tampered ? <><RotateCcw size={14} aria-hidden /> Restore the record</> : <>Try editing #1042</>}
          </button>
        </div>
      </div>
    </section>
  );
}
