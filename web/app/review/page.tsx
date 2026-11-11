"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Download, FileText, Receipt, Timer } from "lucide-react";
import clsx from "clsx";
import { api, CORE } from "@/lib/api";
import { fmt, useM } from "@/lib/store";
import Scorecard from "@/components/Scorecard";

interface Trade {
  symbol: string; name: string; qty: number; entry: number; exit: number; exit_label: string; entry_ts: string; exit_ts: string;
  stop: number | null; target: number | null; hold_min: number; gross: number; fees: number; net: number;
  r: number | null; mae_r: number | null; mfe_r: number | null; left_on_table_r: number | null; efficiency: number | null; verdict: string;
}
interface Review {
  trades: Trade[]; count: number; wins: number; losses: number; win_rate: number | null; net: number; avg_r: number | null;
  avg_mfe_r: number | null; charges: { components: Record<string, number>; total: number; turnover: number; bps_of_turnover: number };
}

const R_MIN = -2, R_MAX = 3;
const pct = (r: number) => ((Math.max(R_MIN, Math.min(R_MAX, r)) - R_MIN) / (R_MAX - R_MIN)) * 100;

/** One trade on an R axis: the grey band is the full excursion (MAE → MFE), the dot is where it actually closed. */
function ExcursionBar({ t }: { t: Trade }) {
  if (t.r == null || t.mae_r == null || t.mfe_r == null) return <span className="text-faint text-[12px]">no stop recorded</span>;
  const lo = pct(t.mae_r), hi = pct(t.mfe_r), at = pct(t.r);
  return (
    <div className="relative h-7 min-w-[180px]" aria-label={`MAE ${t.mae_r}R, MFE ${t.mfe_r}R, closed at ${t.r}R`}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {[-1, 0, 1, 2].map((m) => (
        <div key={m} className="absolute top-1 bottom-1 w-px bg-line-2" style={{ left: `${pct(m)}%` }}>
          <span className="absolute -bottom-3 -translate-x-1/2 text-[9.5px] text-faint num">{m > 0 ? `+${m}` : m}R</span>
        </div>
      ))}
      <motion.div className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full bg-ink/10 origin-left"
        style={{ left: `${lo}%`, width: `${hi - lo}%` }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6 }} />
      <motion.span className={clsx("absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow",
        t.r >= 0 ? "bg-mint" : "bg-coral")} style={{ left: `${at}%` }} initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 400, damping: 20 }} />
    </div>
  );
}

export default function ReviewPage() {
  const v = useM((s) => s.storiesV);
  const [d, setD] = useState<Review | null>(null);
  useEffect(() => { api.get<Review>("/api/review").then(setD).catch(() => {}); }, [v]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label">Trade review</div>
          <h1 className="display text-[clamp(1.6rem,3vw,2.2rem)] mt-1 leading-tight">How each trade actually went</h1>
          <p className="text-ink-2 text-[13.5px] mt-1.5 max-w-2xl">A post-mortem of every round trip on the real bars: how far it went against
            you (MAE) and for you (MFE), measured in R from the original stop, plus what the charges cost.</p>
        </div>
        <a className="btn btn-primary" href={`${CORE}/api/report/day.pdf`} target="_blank" rel="noreferrer">
          <Download size={15} />End-of-day report (PDF)</a>
      </header>

      <Scorecard />

      {!d ? <div className="skeleton h-40" /> : (
        <>
          <section className="panel grid grid-cols-2 md:grid-cols-5 divide-x divide-line">
            {[
              ["Closed trades", String(d.count), "text-ink"],
              ["Win rate", d.win_rate == null ? "—" : `${d.win_rate}%`, "text-ink"],
              ["Net P&L", fmt.usd(d.net), d.net >= 0 ? "pos" : "neg"],
              ["Average R", d.avg_r == null ? "—" : `${d.avg_r > 0 ? "+" : ""}${d.avg_r}R`, (d.avg_r ?? 0) >= 0 ? "pos" : "neg"],
              ["Charges paid", fmt.usd(d.charges.total), "text-ink"],
            ].map(([k, val, cls]) => (
              <div key={k} className="p-4 min-w-0">
                <div className="label !text-[10px]">{k}</div>
                <div className={clsx("num text-[22px] mt-1 truncate", cls)}>{val}</div>
              </div>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="panel p-4 min-w-0">
              <div className="flex items-center gap-2 mb-3"><FileText size={15} className="text-muted" />
                <h2 className="display text-[16px]">Post-mortem</h2></div>
              {d.trades.length === 0 ? (
                <p className="text-[13px] text-muted py-6">No closed trades yet. Once a position exits (stop, target, flat-by or a manual close),
                  its post-mortem appears here.</p>
              ) : (
                <div className="space-y-3">
                  {d.trades.map((t, i) => (
                    <motion.article key={`${t.symbol}-${t.entry_ts}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }} className="rounded-xl border border-line p-4 grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_150px] items-center">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2"><span className="font-semibold">{t.symbol}</span>
                          <span className="text-[12px] text-muted truncate">{t.name}</span></div>
                        <div className="text-[12px] text-ink-2 num mt-1">{t.qty} @ {t.entry} → {t.exit}</div>
                        <div className="flex items-center gap-1.5 text-[11.5px] text-muted mt-1"><Timer size={12} />
                          {t.entry_ts.slice(11, 16)}–{t.exit_ts.slice(11, 16)} · {t.hold_min} min · {t.exit_label}</div>
                      </div>
                      <div className="min-w-0 pb-3">
                        <ExcursionBar t={t} />
                        <p className="text-[12.5px] text-ink-2 mt-4 leading-snug">{t.verdict}</p>
                      </div>
                      <div className="text-right">
                        <div className={clsx("num text-[18px]", t.net >= 0 ? "pos" : "neg")}>{fmt.usd(t.net)}</div>
                        <div className="text-[11.5px] text-muted num">{t.r != null ? `${t.r > 0 ? "+" : ""}${t.r}R` : ""} · fees {fmt.usd(t.fees)}</div>
                        {t.mfe_r != null && <div className="text-[11.5px] text-muted num">MAE {t.mae_r}R · MFE +{t.mfe_r}R</div>}
                      </div>
                    </motion.article>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-5 min-w-0">
              <section className="panel p-4">
                <div className="flex items-center gap-2 mb-3"><Receipt size={15} className="text-muted" />
                  <h2 className="display text-[16px]">What the trades cost</h2></div>
                <div className="space-y-2">
                  {Object.entries(d.charges.components).map(([k, val]) => {
                    const share = d.charges.total ? val / d.charges.total : 0;
                    return (
                      <div key={k} className="text-[12.5px]">
                        <div className="flex justify-between"><span className="uppercase text-muted text-[11px] tracking-wide">{k}</span>
                          <span className="num">{fmt.usd(val)}</span></div>
                        <div className="h-1 rounded-full bg-line mt-1 overflow-hidden">
                          <motion.div className="h-full bg-ink/70 origin-left" style={{ width: "100%" }} initial={{ scaleX: 0 }}
                            animate={{ scaleX: share }} transition={{ duration: 0.6 }} /></div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[12px] text-ink-2 mt-3 pt-3 border-t border-line">
                  {fmt.usd(d.charges.total)} on {fmt.usd(d.charges.turnover, 0)} of turnover: <span className="num">{d.charges.bps_of_turnover}</span> bps.
                  Tight stops make charges a bigger share of the risk; the What-if panel in Trade Studio warns you before that happens.
                </p>
              </section>
              <section className="panel p-4 text-[12.5px] text-ink-2 space-y-2">
                <h2 className="display text-[15px] text-ink">Reading the bar</h2>
                <p><b className="text-ink">Grey band:</b> the full range the trade travelled, from its worst point (MAE) to its best (MFE).</p>
                <p><b className="text-ink">Dot:</b> where it actually closed, in R.</p>
                <p>A trade that reached +1R and then stopped out is the case for the <b className="text-ink">Breakeven guard</b> automation.</p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
