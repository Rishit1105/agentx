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
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7d8a9c", fontFamily: "var(--font-jet)", fontSize: 11 },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "#1c2633", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: "#1c2633", timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { vertLine: { color: "#38e1ff55", labelBackgroundColor: "#0e3a46" }, horzLine: { color: "#38e1ff55", labelBackgroundColor: "#0e3a46" } },
    });
    candles.current = c.addSeries(CandlestickSeries, { upColor: "#3ddc97", downColor: "#ff5c6c", borderVisible: false,
      wickUpColor: "#3ddc97aa", wickDownColor: "#ff5c6caa" });
    vol.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: "#8b7cff44" });
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
        ...(b.synthetic ? { color: b.c >= b.o ? "#3ddc9799" : "#ff5c6c99", wickColor: "#7d8a9c88" } : {}) })));
      vol.current?.setData(bars.map((b) => ({ time: toET(b.t), value: b.v, color: b.c >= b.o ? "#3ddc9733" : "#ff5c6c33" })));
      const firstSynth = bars.find((b) => b.synthetic);
      const ms: any[] = [];
      if (levels.entryT) ms.push({ time: toET(levels.entryT), position: "belowBar", color: "#38e1ff", shape: "arrowUp", text: "ENTRY" });
      if (firstSynth) ms.push({ time: toET(firstSynth.t), position: "aboveBar", color: "#ffb547", shape: "circle", text: "simulated →" });
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
    add(levels.orHigh, "#ffb54799", "OR high", LineStyle.Dotted);
    add(levels.orLow, "#ffb54799", "OR low", LineStyle.Dotted);
    add(levels.target, "#3ddc97", "TARGET", LineStyle.Dashed, 2);
    add(levels.entry, "#b4c0cf", "ENTRY", LineStyle.Solid);
    add(levels.stop, "#ff5c6c", "STOP", LineStyle.Dashed, 2);
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
