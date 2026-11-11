"use client";
import { useEffect, useRef } from "react";
import { levels } from "@/lib/voice";
import type { VoiceState } from "@/lib/types";

/** The face of the Conductor. A luminous core, a radial waveform ring, and a "meridian" line that opens like an
 *  eye when listening, shimmers while thinking, pulses to speech energy, turns gold to confirm, coral when halted. */
const PALETTE: Record<string, [number, number, number]> = {
  idle: [56, 225, 255], listening: [56, 225, 255], thinking: [139, 124, 255], speaking: [56, 225, 255],
  awaiting_confirm: [255, 181, 71], halted: [255, 92, 108],
};

export default function Orb({ state, size = 300 }: { state: VoiceState; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stRef = useRef(state);
  stRef.current = state;

  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, t = 0, eye = 0, energy = 0;
    let col = [...PALETTE.idle];
    const N = 120;
    const spokes = new Float32Array(N);

    const draw = () => {
      t += reduced ? 0 : 1 / 60;
      const s = stRef.current;
      const target = PALETTE[s] || PALETTE.idle;
      col = col.map((v, i) => v + (target[i] - v) * 0.06);
      const [r, gg, b] = col.map(Math.round);
      const lvl = s === "listening" ? levels.mic : s === "speaking" ? levels.speak : 0;
      energy += (lvl - energy) * 0.25;
      eye += ((s === "listening" ? 1 : s === "speaking" ? 0.55 : s === "thinking" ? 0.3 : s === "awaiting_confirm" ? 0.7 : 0.08) - eye) * 0.08;
      const cx = size / 2, cy = size / 2;
      const R = size * 0.27;
      const breath = s === "halted" ? 0 : Math.sin(t * 1.3) * 0.025;
      g.clearRect(0, 0, size, size);

      // outer halo
      const halo = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.1);
      halo.addColorStop(0, `rgba(${r},${gg},${b},${0.20 + energy * 0.25})`);
      halo.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = halo;
      g.beginPath(); g.arc(cx, cy, R * 2.1, 0, Math.PI * 2); g.fill();

      // waveform ring (spokes)
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        let amp = 0.04;
        if (s === "listening" || s === "speaking") amp = 0.05 + energy * (0.35 + 0.45 * Math.abs(Math.sin(a * 3 + t * 6) * Math.cos(a * 5 - t * 4)));
        else if (s === "thinking") amp = 0.05 + 0.12 * Math.max(0, Math.sin(a * 2 - t * 4));
        else if (s === "awaiting_confirm") amp = 0.06 + 0.06 * (0.5 + 0.5 * Math.sin(t * 3));
        else amp = 0.03 + 0.02 * Math.sin(a * 4 + t);
        spokes[i] += (amp - spokes[i]) * 0.2;
        const r0 = R * (1.18 + breath), r1 = r0 + R * spokes[i];
        g.strokeStyle = `rgba(${r},${gg},${b},${0.25 + spokes[i] * 1.6})`;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.stroke();
      }

      // thinking: two orbiting arcs
      if (s === "thinking") {
        for (let k = 0; k < 2; k++) {
          g.strokeStyle = `rgba(${r},${gg},${b},0.8)`;
          g.lineWidth = 2;
          g.beginPath();
          const st = t * (2.4 + k) + k * Math.PI;
          g.arc(cx, cy, R * (1.05 + k * 0.06), st, st + 0.9);
          g.stroke();
        }
      }
      if (s === "awaiting_confirm") {
        g.strokeStyle = `rgba(${r},${gg},${b},${0.55 + 0.35 * Math.sin(t * 3)})`;
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(cx, cy, R * 1.09, 0, Math.PI * 2); g.stroke();
      }

      // core sphere
      const core = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R * (1 + breath));
      core.addColorStop(0, `rgba(255,255,255,0.95)`);
      core.addColorStop(0.18, `rgba(${Math.min(255, r + 120)},${Math.min(255, gg + 60)},${Math.min(255, b + 30)},0.9)`);
      core.addColorStop(0.55, `rgba(${r},${gg},${b},0.55)`);
      core.addColorStop(1, `rgba(${r * 0.15},${gg * 0.15},${b * 0.2},0.95)`);
      g.fillStyle = core;
      g.beginPath(); g.arc(cx, cy, R * (1 + breath + energy * 0.06), 0, Math.PI * 2); g.fill();
      // inner rim
      g.strokeStyle = `rgba(${r},${gg},${b},0.6)`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, R * (1 + breath), 0, Math.PI * 2); g.stroke();

      // the meridian line: an eye that opens
      const open = R * 0.62 * eye;
      g.save();
      g.beginPath(); g.arc(cx, cy, R * 0.98, 0, Math.PI * 2); g.clip();
      g.fillStyle = `rgba(3,8,14,${0.55 * eye})`;
      g.beginPath();
      g.moveTo(cx - R, cy);
      g.quadraticCurveTo(cx, cy - open * 1.4, cx + R, cy);
      g.quadraticCurveTo(cx, cy + open * 1.4, cx - R, cy);
      g.fill();
      const pupil = R * (0.16 + 0.1 * energy) * eye;
      if (pupil > 0.5) {
        const pg = g.createRadialGradient(cx, cy, 0, cx, cy, pupil * 2.2);
        pg.addColorStop(0, `rgba(255,255,255,0.95)`);
        pg.addColorStop(0.35, `rgba(${r},${gg},${b},0.9)`);
        pg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        g.fillStyle = pg;
        g.beginPath(); g.arc(cx, cy, pupil * 2.2, 0, Math.PI * 2); g.fill();
      }
      g.restore();
      const shimmer = s === "thinking" ? 0.5 + 0.5 * Math.sin(t * 8) : 1;
      g.strokeStyle = `rgba(255,255,255,${0.5 * shimmer + 0.2})`;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - R * 1.45, cy);
      g.quadraticCurveTo(cx, cy - open * 1.4, cx + R * 1.45, cy);
      if (open > 1) { g.moveTo(cx - R * 1.45, cy); g.quadraticCurveTo(cx, cy + open * 1.4, cx + R * 1.45, cy); }
      g.stroke();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}
