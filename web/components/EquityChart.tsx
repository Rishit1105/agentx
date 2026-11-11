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
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7d8a9c", fontFamily: "var(--font-jet)", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "#1c2633" }, timeScale: { borderColor: "#1c2633" },
      crosshair: { vertLine: { color: "#38e1ff55" }, horzLine: { color: "#38e1ff55" } },
    } as const;
    const c1 = createChart(top.current!, { ...base, height: 280 });
    const c2 = createChart(bot.current!, { ...base, height: 110 });
    const d = (arr: number[]) => arr.map((v, i) => ({ time: eq.t[i], value: v }));
    const strat = c1.addSeries(AreaSeries, { lineColor: "#38e1ff", topColor: "rgba(56,225,255,0.22)", bottomColor: "rgba(56,225,255,0)", lineWidth: 2,
      title: "Meridian" });
    strat.setData(d(eq.strategy));
    c1.addSeries(LineSeries, { color: "#8b7cff", lineWidth: 2, title: "Buy & hold" }).setData(d(eq.buy_hold));
    if (eq.index) c1.addSeries(LineSeries, { color: "#3ddc97", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "NIFTY 50" }).setData(d(eq.index));
    c2.addSeries(AreaSeries, { lineColor: "#ff5c6c", topColor: "rgba(255,92,108,0)", bottomColor: "rgba(255,92,108,0.35)", lineWidth: 1,
      title: "Drawdown %", invertFilledArea: true } as any).setData(d(eq.underwater));
    c1.timeScale().fitContent(); c2.timeScale().fitContent();
    c1.timeScale().subscribeVisibleLogicalRangeChange((r) => r && c2.timeScale().setVisibleLogicalRange(r));
    return () => { c1.remove(); c2.remove(); };
  }, [eq]);
  return <div className="space-y-1"><div ref={top} className="w-full" /><div ref={bot} className="w-full" /></div>;
}
