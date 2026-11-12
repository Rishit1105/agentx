"use client";
import { useId } from "react";
import { motion } from "motion/react";
import clsx from "clsx";

const CORAL = "#e5484d";

/**
 * A rubber stamp, inked slightly unevenly, that slams onto the page when it scrolls into view:
 * it drops from above at an angle, lands with a little overshoot and leaves a quick ink ring.
 */
export default function RubberStamp({
  top = "₹0",
  bottom = "REAL MONEY",
  rotate = -9,
  color = CORAL,
  className,
}: {
  top?: string;
  bottom?: string;
  rotate?: number;
  color?: string;
  className?: string;
}) {
  const ink = `stamp-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className={clsx("pointer-events-none select-none", className)}>
      <motion.div
        initial={{ opacity: 0, scale: 2.2, rotate: rotate - 12, y: -24 }}
        whileInView={{ opacity: 0.92, scale: 1, rotate, y: 0 }}
        viewport={{ once: true, amount: 0.9 }}
        transition={{ type: "spring", stiffness: 520, damping: 24, mass: 0.9, delay: 0.25 }}
        className="relative"
        role="img"
        aria-label={`Stamp: ${top} ${bottom}`}
      >
        <motion.span
          aria-hidden
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: [0, 0.35, 0], scale: [0.9, 1.25, 1.4] }}
          viewport={{ once: true, amount: 0.9 }}
          transition={{ duration: 0.7, delay: 0.42, ease: "easeOut" }}
          className="absolute inset-0 rounded-[14px] border-2"
          style={{ borderColor: color }}
        />
        <svg viewBox="0 0 200 92" className="block h-auto w-full" aria-hidden>
          <defs>
            {/* uneven ink: fractal noise knocks small holes out of the stamp */}
            <filter id={ink} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
              <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.45" result="speckle" />
              <feComposite in="SourceGraphic" in2="speckle" operator="in" />
            </filter>
          </defs>
          <g filter={`url(#${ink})`} fill={color} stroke={color}>
            <rect x={3} y={3} width={194} height={86} rx={12} fill="none" strokeWidth={3.2} />
            <rect x={10} y={10} width={180} height={72} rx={7} fill="none" strokeWidth={1.1} />
            <text x={100} y={50} textAnchor="middle" fontSize={34} fontWeight={700} letterSpacing={-1} stroke="none"
              style={{ fontFamily: "var(--font-space), ui-sans-serif, system-ui" }}>
              {top}
            </text>
            <text x={100} y={70} textAnchor="middle" fontSize={12.5} fontWeight={700} letterSpacing={3.2} stroke="none"
              style={{ fontFamily: "var(--font-space), ui-sans-serif, system-ui" }}>
              {bottom}
            </text>
            <path d="M22 22 h18 M160 22 h18 M22 70 h10 M168 70 h10" strokeWidth={1.1} fill="none" />
          </g>
        </svg>
      </motion.div>
    </div>
  );
}
