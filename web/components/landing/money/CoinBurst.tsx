import type { CSSProperties } from "react";

const COINS = 7;

/** A paper rupee coin: milled edge, an inner ring and the ₹ glyph, in ink on paper. */
export function Coin({ tint = "#b7790b", size = 26 }: { tint?: string; size?: number }) {
  return (
    <svg viewBox="0 0 26 26" width={size} height={size} aria-hidden className="block">
      <circle cx={13} cy={13} r={12} fill="#fbfaf7" stroke={tint} strokeWidth={1.2} />
      <circle cx={13} cy={13} r={9.6} fill="none" stroke={tint} strokeWidth={0.6} strokeDasharray="1 1.2" />
      <text x={13} y={17.2} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={tint}
        style={{ fontFamily: "var(--font-space), ui-sans-serif, system-ui" }}>
        ₹
      </text>
    </svg>
  );
}

/**
 * Coins that arc in from around the dial and drop into its hub, the vault. Mount with `key={burst}`
 * so each new burst replays; burst 0 renders nothing. The flight is one CSS keyframe (transform and
 * opacity only) fed by per-coin custom properties; positions are fixed per index, so render stays pure.
 */
export default function CoinBurst({ burst }: { burst: number }) {
  if (burst === 0) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      {Array.from({ length: COINS }, (_, i) => {
        const angle = Math.PI * (1.08 + (i / (COINS - 1)) * 0.84) + (burst % 2) * 0.12; // the upper arc
        const dist = 120 + (i % 3) * 22;
        const style = {
          "--coin-x": `${(Math.cos(angle) * dist).toFixed(1)}px`,
          "--coin-y": `${(Math.sin(angle) * dist * 0.8).toFixed(1)}px`,
          "--coin-r": `${-40 + i * 12}deg`,
          animationDelay: `${i * 60}ms`,
        } as CSSProperties;
        return (
          <span key={i} className="lp-coin absolute" style={style}>
            <Coin tint={i % 3 === 1 ? "#0e9f6e" : "#b7790b"} />
          </span>
        );
      })}
    </div>
  );
}
