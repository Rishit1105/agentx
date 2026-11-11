"use client";
import Link from "next/link";
import { ArrowUpRight, Mic } from "lucide-react";
import SectorHeatmap from "@/components/SectorHeatmap";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";

const ASK = ["How are sectors doing?", "Scan for breakouts", "Any bulk deals?", "What's moving Reliance?"];

export default function Markets() {
  const ask = async (text: string) => {
    const r = await api.chat(text).catch((e) => ({ reply: (e as Error).message }));
    if (r?.reply) useM.getState().toast({ tone: "info", title: "Meridian", body: r.reply });
  };
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="label">Markets · NSE</div>
          <h1 className="display text-[clamp(1.6rem,3vw,2.2rem)] mt-1 leading-tight">Where the money is moving</h1>
          <p className="text-ink-2 text-[13.5px] mt-1.5 max-w-2xl">Every NIFTY 500 stock grouped by sector. Tile size is today&apos;s traded value and
            colour is the value-weighted move, computed from the same 5-minute bars the agents trade on.</p>
        </div>
        <Link href="/studio" className="btn"><ArrowUpRight size={15} />Open Trade Studio</Link>
      </header>
      <section className="panel p-4 md:p-5"><SectorHeatmap /></section>
      <section className="panel p-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted mr-1"><Mic size={14} />Ask the Conductor</span>
        {ASK.map((q) => <button key={q} className="chip" onClick={() => ask(q)}>{q}</button>)}
      </section>
    </div>
  );
}
