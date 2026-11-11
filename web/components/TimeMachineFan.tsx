"use client";
import { useEffect, useRef } from "react";

/** The Time Machine fan: the 5th–95th / 25th–75th percentile envelope of 10,000 simulated rest-of-day paths,
 *  with the median, the target and the stop. Turns "honest odds" into a picture. */
export default function TimeMachineFan({ bands, entry, stop, target, height = 190 }:
  { bands: number[][]; entry: number; stop: number; target: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const W = c.clientWidth, H = height, dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    if (!bands?.length) return;
    const all = bands.flat().concat([stop, target]);
    const lo = Math.min(...all) - 0.5, hi = Math.max(...all) + 0.5;
    const X = (i: number) => 8 + (i / (bands.length - 1)) * (W - 64);
    const Y = (v: number) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 16);
    const band = (a: number, b: number, fill: string | CanvasGradient) => {
      g.beginPath();
      bands.forEach((q, i) => (i ? g.lineTo(X(i), Y(q[a])) : g.moveTo(X(i), Y(q[a]))));
      for (let i = bands.length - 1; i >= 0; i--) g.lineTo(X(i), Y(bands[i][b]));
      g.closePath(); g.fillStyle = fill; g.fill();
    };
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "rgba(139,124,255,0.06)"); grad.addColorStop(1, "rgba(139,124,255,0.22)");
    band(0, 4, grad);
    const grad2 = g.createLinearGradient(0, 0, W, 0);
    grad2.addColorStop(0, "rgba(56,225,255,0.10)"); grad2.addColorStop(1, "rgba(56,225,255,0.32)");
    band(1, 3, grad2);
    g.strokeStyle = "#38e1ff"; g.lineWidth = 1.6;
    g.beginPath(); bands.forEach((q, i) => (i ? g.lineTo(X(i), Y(q[2])) : g.moveTo(X(i), Y(q[2])))); g.stroke();
    const hline = (v: number, col: string, label: string) => {
      g.setLineDash([5, 4]); g.strokeStyle = col; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(8, Y(v)); g.lineTo(W - 56, Y(v)); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.font = "600 10px var(--font-jet), monospace"; g.fillText(`${label} ${v.toFixed(2)}`, W - 54, Y(v) + 3);
    };
    hline(target, "#3ddc97", "T"); hline(stop, "#ff5c6c", "S");
    g.fillStyle = "#e8eef6"; g.beginPath(); g.arc(X(0), Y(entry), 3.5, 0, Math.PI * 2); g.fill();
  }, [bands, entry, stop, target, height]);
  return <canvas ref={ref} style={{ width: "100%", height }} aria-label="Time Machine fan of simulated paths" />;
}
