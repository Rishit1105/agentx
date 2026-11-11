"use client";
import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, LineStyle,
  type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";

const NY = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour12: false, year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** lightweight-charts renders UTC; shift so the axis reads India time (IST). */
function toET(t: number) {
  const p = Object.fromEntries(NY.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) / 1000;
  return asUTC as UTCTimestamp;
}

export interface Levels { entry?: number; stop?: number; target?: number; orHigh?: number; orLow?: number; entryT?: number }

export default function CandleChart({ symbol, levels, height = 380 }: { symbol: string; levels: Levels; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vol = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lines = useRef<any[]>([]);
  const markers = useRef<any>(null);
  const fitted = useRef<string | null>(null);
  const tick = useM((s) => s.st?.clock.hhmm);

  useEffect(() => {
    const c = createChart(el.current!, {
      height, autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#646b76", fontFamily: "var(--font-jet)", fontSize: 11 },
      grid: { vertLines: { color: "rgba(20,24,31,0.05)" }, horzLines: { color: "rgba(20,24,31,0.05)" } },
      rightPriceScale: { borderColor: "#e7e4dc", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: "#e7e4dc", timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { vertLine: { color: "#0a7ea455", labelBackgroundColor: "#0a7ea4" }, horzLine: { color: "#0a7ea455", labelBackgroundColor: "#0a7ea4" } },
    });
    candles.current = c.addSeries(CandlestickSeries, { upColor: "#0e9f6e", downColor: "#e5484d", borderVisible: false,
      wickUpColor: "#0e9f6eaa", wickDownColor: "#e5484daa" });
    vol.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: "#6e56cf44" });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    markers.current = createSeriesMarkers(candles.current, []);
    chart.current = c;
    return () => { c.remove(); chart.current = null; };
  }, [height]);

  useEffect(() => {
    let dead = false;
    api.get(`/api/bars/${symbol}`).then((d) => {
      if (dead || !candles.current) return;
      const bars = d.bars as any[];
      candles.current.setData(bars.map((b) => ({ time: toET(b.t), open: b.o, high: b.h, low: b.l, close: b.c,
        ...(b.synthetic ? { color: b.c >= b.o ? "#0e9f6e99" : "#e5484d99", wickColor: "#646b7688" } : {}) })));
      vol.current?.setData(bars.map((b) => ({ time: toET(b.t), value: b.v, color: b.c >= b.o ? "#0e9f6e33" : "#e5484d33" })));
      const firstSynth = bars.find((b) => b.synthetic);
      const ms: any[] = [];
      if (levels.entryT) ms.push({ time: toET(levels.entryT), position: "belowBar", color: "#0a7ea4", shape: "arrowUp", text: "ENTRY" });
      if (firstSynth) ms.push({ time: toET(firstSynth.t), position: "aboveBar", color: "#b7790b", shape: "circle", text: "simulated →" });
      markers.current?.setMarkers(ms);
      if (!fitted.current || fitted.current !== symbol) { chart.current?.timeScale().fitContent(); fitted.current = symbol; }
      else if (bars.length < 40) chart.current?.timeScale().fitContent();
    }).catch(() => {});
    return () => { dead = true; };
  }, [symbol, tick, levels.entryT]);

  useEffect(() => {
    const s = candles.current;
    if (!s) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    lines.current = [];
    const add = (price: number | undefined, color: string, title: string, style = LineStyle.Dashed, w = 1) => {
      if (price == null) return;
      lines.current.push(s.createPriceLine({ price, color, lineWidth: w as any, lineStyle: style, axisLabelVisible: true, title }));
    };
    add(levels.orHigh, "#b7790b99", "OR high", LineStyle.Dotted);
    add(levels.orLow, "#b7790b99", "OR low", LineStyle.Dotted);
    add(levels.target, "#0e9f6e", "TARGET", LineStyle.Dashed, 2);
    add(levels.entry, "#3d4450", "ENTRY", LineStyle.Solid);
    add(levels.stop, "#e5484d", "STOP", LineStyle.Dashed, 2);
    // keep the whole plan (stop..target) in view, not just the candles
    const keep = [levels.target, levels.stop, levels.entry].filter((v): v is number => v != null);
    s.applyOptions({
      autoscaleInfoProvider: (orig: () => any) => {
        const r = orig();
        if (!r || !keep.length) return r;
        const lo = Math.min(r.priceRange.minValue, ...keep), hi = Math.max(r.priceRange.maxValue, ...keep);
        const pad = (hi - lo) * 0.04;
        return { ...r, priceRange: { minValue: lo - pad, maxValue: hi + pad } };
      },
    });
  }, [levels.entry, levels.stop, levels.target, levels.orHigh, levels.orLow]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
