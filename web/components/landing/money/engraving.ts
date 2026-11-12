/*
 * Engraving for the paper notes: guilloche rosettes, a spirograph centre and woven wave bands, the fine
 * line work printed on real banknotes. Everything is computed once at module load, so the server and the
 * client render byte-identical paths.
 */

const f = (n: number) => n.toFixed(1);

/** A guilloche ring: several phase-shifted rose curves around one centre, interlaced like a braid. */
export function rosette(cx: number, cy: number, base: number, amp: number, lobes: number, strands: number, steps = 220) {
  const out: string[] = [];
  for (let s = 0; s < strands; s++) {
    const phase = (s / strands) * Math.PI * 2;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const r = base + amp * Math.sin(lobes * t + phase) + amp * 0.3 * Math.sin(3 * t);
      d += `${i ? "L" : "M"}${f(cx + r * Math.cos(t))},${f(cy + r * Math.sin(t))}`;
    }
    out.push(`${d}Z`);
  }
  return out;
}

/** A hypotrochoid (spirograph) of the given outer radius: the closed knot at the heart of a rosette. */
export function spirograph(cx: number, cy: number, radius: number, steps = 420) {
  const R = 7, r = 3, d = 2.6;
  const k = radius / (R - r + d);
  let path = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 6; // closes after 3 turns for R=7, r=3
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    path += `${i ? "L" : "M"}${f(cx + x * k)},${f(cy + y * k)}`;
  }
  return path;
}

/** A woven band: sine lines with staggered phases between two x positions. */
export function waveBand(x0: number, x1: number, y: number, amp: number, wavelength: number, lines: number, steps = 72) {
  const out: string[] = [];
  for (let l = 0; l < lines; l++) {
    const phase = (l / lines) * Math.PI * 2;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      d += `${i ? "L" : "M"}${f(x)},${f(y + amp * Math.sin(((x - x0) / wavelength) * Math.PI * 2 + phase))}`;
    }
    out.push(d);
  }
  return out;
}

/* The standard note is drawn on a 320 × 150 sheet. */
export const NOTE_W = 320;
export const NOTE_H = 150;

export const NOTE_ROSETTE = rosette(78, 75, 36, 7, 16, 5);
export const NOTE_ROSETTE_INNER = rosette(78, 75, 22, 4, 11, 4, 160);
export const NOTE_KNOT = spirograph(78, 75, 13);
export const NOTE_BAND_TOP = waveBand(132, 306, 22, 3.2, 22, 4);
export const NOTE_BAND_BOTTOM = waveBand(14, 306, 128, 3.2, 18, 4, 110);

/** The cursive "signature" of the Chief Paper Officer. */
export const NOTE_SIGNATURE =
  "M0,6 C3,-2 7,-1 6,5 C5,10 9,10 12,3 C14,-1 16,4 15,7 C18,2 21,1 22,6 C23,9 26,8 28,4 C30,1 32,5 31,7 C34,4 37,3 40,6";
