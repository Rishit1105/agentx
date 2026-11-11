"use client";
import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, LineSeries, LineStyle } from "lightweight-charts";

export default function EquityChart({ eq }: { eq: { t: string[]; strategy: number[]; buy_hold: number[]; index: number[] | null;
  underwater: number[] } }) {
  const top = useRef<HTMLDivElement>(null);
  const bot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const base = {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#646b76", fontFamily: "var(--font-jet)", fontSize: 11 },
      grid: { vertLines: { color: "rgba(20,24,31,0.05)" }, horzLines: { color: "rgba(20,24,31,0.05)" } },
      rightPriceScale: { borderColor: "#e7e4dc" }, timeScale: { borderColor: "#e7e4dc" },
      crosshair: { vertLine: { color: "#0a7ea455" }, horzLine: { color: "#0a7ea455" } },
    } as const;
    const c1 = createChart(top.current!, { ...base, height: 280 });
    const c2 = createChart(bot.current!, { ...base, height: 110 });
    const d = (arr: number[]) => arr.map((v, i) => ({ time: eq.t[i], value: v }));
    const strat = c1.addSeries(AreaSeries, { lineColor: "#0a7ea4", topColor: "rgba(10,126,164,0.22)", bottomColor: "rgba(10,126,164,0)", lineWidth: 2,
      title: "Meridian" });
    strat.setData(d(eq.strategy));
    c1.addSeries(LineSeries, { color: "#6e56cf", lineWidth: 2, title: "Buy & hold" }).setData(d(eq.buy_hold));
    if (eq.index) c1.addSeries(LineSeries, { color: "#0e9f6e", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "NIFTY 50" }).setData(d(eq.index));
    c2.addSeries(AreaSeries, { lineColor: "#e5484d", topColor: "rgba(229,72,77,0)", bottomColor: "rgba(229,72,77,0.35)", lineWidth: 1,
      title: "Drawdown %", invertFilledArea: true } as any).setData(d(eq.underwater));
    c1.timeScale().fitContent(); c2.timeScale().fitContent();
    c1.timeScale().subscribeVisibleLogicalRangeChange((r) => r && c2.timeScale().setVisibleLogicalRange(r));
    return () => { c1.remove(); c2.remove(); };
  }, [eq]);
  return <div className="space-y-1"><div ref={top} className="w-full" /><div ref={bot} className="w-full" /></div>;
}
