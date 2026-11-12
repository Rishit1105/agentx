import clsx from "clsx";
import {
  NOTE_BAND_BOTTOM, NOTE_BAND_TOP, NOTE_H, NOTE_KNOT, NOTE_ROSETTE, NOTE_ROSETTE_INNER, NOTE_SIGNATURE, NOTE_W,
} from "./engraving";

export type NoteTint = "mint" | "cyan" | "amber";

const INK = "#14181f";
const TINT: Record<NoteTint, string> = { mint: "#0e9f6e", cyan: "#0a7ea4", amber: "#b7790b" };

const DISPLAY = { fontFamily: "var(--font-space), ui-sans-serif, system-ui" };
const MONO = { fontFamily: "var(--font-jet), ui-monospace, monospace" };

/** The Meridian orb as a watermark: a pearl with latitude lines and a faint core. */
function OrbWatermark({ cx, cy, r, tint }: { cx: number; cy: number; r: number; tint: string }) {
  return (
    <g opacity={0.9}>
      <circle cx={cx} cy={cy} r={r} fill={tint} fillOpacity={0.05} stroke={INK} strokeOpacity={0.16} strokeWidth={0.6} />
      {[0.25, 0.55, 0.82].map((k) => (
        <ellipse key={k} cx={cx} cy={cy} rx={r} ry={r * k} fill="none" stroke={INK} strokeOpacity={0.1} strokeWidth={0.5} />
      ))}
      <ellipse cx={cx} cy={cy} rx={r * 0.38} ry={r} fill="none" stroke={INK} strokeOpacity={0.08} strokeWidth={0.5} />
      <circle cx={cx} cy={cy} r={r * 0.24} fill={tint} fillOpacity={0.16} />
      <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={INK} strokeOpacity={0.08} strokeWidth={0.5} />
    </g>
  );
}

/**
 * A stylised paper banknote, engraved in ink lines: a guilloche rosette, woven bands, an orb watermark,
 * a serial and the signature of the Chief Paper Officer. Purely decorative and obviously not legal tender.
 */
export default function Banknote({
  denomination = "500",
  tint = "mint",
  serial = "MRD 482 370 75",
  className,
}: {
  denomination?: string;
  tint?: NoteTint;
  serial?: string;
  className?: string;
}) {
  const c = TINT[tint];
  return (
    <svg viewBox={`0 0 ${NOTE_W} ${NOTE_H}`} className={clsx("block h-auto w-full", className)} aria-hidden>
      {/* the sheet and its double frame */}
      <rect x={0.5} y={0.5} width={NOTE_W - 1} height={NOTE_H - 1} rx={9} style={{ fill: `color-mix(in srgb, ${c} 6%, #fbfaf7)` }}
        stroke={INK} strokeOpacity={0.2} />
      <rect x={6} y={6} width={NOTE_W - 12} height={NOTE_H - 12} rx={6} fill="none" stroke={c} strokeOpacity={0.55} strokeWidth={0.8} />
      <rect x={10} y={10} width={NOTE_W - 20} height={NOTE_H - 20} rx={4} fill="none" stroke={INK} strokeOpacity={0.2} strokeWidth={0.5} />

      {/* engraving */}
      <g fill="none" stroke={c} strokeLinejoin="round">
        {NOTE_ROSETTE.map((d, i) => <path key={i} d={d} strokeWidth={0.45} strokeOpacity={0.6} />)}
        {NOTE_ROSETTE_INNER.map((d, i) => <path key={i} d={d} strokeWidth={0.4} strokeOpacity={0.45} />)}
        <path d={NOTE_KNOT} strokeWidth={0.45} strokeOpacity={0.7} />
        {NOTE_BAND_TOP.map((d, i) => <path key={i} d={d} strokeWidth={0.4} strokeOpacity={0.45} />)}
        {NOTE_BAND_BOTTOM.map((d, i) => <path key={i} d={d} strokeWidth={0.4} strokeOpacity={0.4} />)}
      </g>
      <circle cx={78} cy={75} r={9.5} style={{ fill: `color-mix(in srgb, ${c} 6%, #fbfaf7)` }} />
      <text x={78} y={78} textAnchor="middle" fontSize={7.5} fontWeight={600} letterSpacing={0.6} fill={c} style={DISPLAY}>PAPER</text>

      <OrbWatermark cx={236} cy={80} r={25} tint={c} />

      {/* legends */}
      <text x={132} y={42} fontSize={8} fontWeight={600} letterSpacing={2.2} fill={INK} fillOpacity={0.82} style={DISPLAY}>
        MERIDIAN PAPER RESERVE
      </text>
      <text x={132} y={52} fontSize={5.4} letterSpacing={0.7} fill={INK} fillOpacity={0.55} style={DISPLAY}>
        PROMISES TO PAY THE BEARER EXACTLY NOTHING
      </text>
      <text x={NOTE_W - 18} y={30} textAnchor="end" fontSize={11} fontWeight={600} fill={c} style={DISPLAY}>{denomination}</text>
      <text x={NOTE_W - 18} y={113} textAnchor="end" fontSize={denomination.length > 4 ? 22 : 30} fontWeight={600}
        letterSpacing={-0.8} fill={INK} style={DISPLAY}>
        ₹{denomination}
      </text>
      <text x={132} y={102} fontSize={7} letterSpacing={0.6} fill={c} style={MONO}>{serial}</text>

      {/* signature */}
      <path d={NOTE_SIGNATURE} transform="translate(132 72) scale(0.95)" fill="none" stroke={INK} strokeOpacity={0.6} strokeWidth={0.8}
        strokeLinecap="round" />
      <text x={132} y={89} fontSize={4.4} letterSpacing={0.6} fill={INK} fillOpacity={0.5} style={DISPLAY}>CHIEF PAPER OFFICER</text>

      <text x={NOTE_W / 2} y={NOTE_H - 13.5} textAnchor="middle" fontSize={4.2} letterSpacing={1.4} fill={INK} fillOpacity={0.45} style={DISPLAY}>
        NOT LEGAL TENDER · PAPER TRADING ONLY · ₹0 REAL MONEY
      </text>
    </svg>
  );
}
