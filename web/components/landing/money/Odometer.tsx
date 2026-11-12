import clsx from "clsx";

const DIGITS = "0123456789".split("");

/**
 * A figure whose digits roll like a mechanical counter. Each digit is a column of 0–9 (repeated `spins`
 * extra times for a longer roll) moved with a CSS transform, so a change in value only animates transform.
 * Until `play` is true every digit rests on 0, which makes the first reveal roll up from zero.
 */
export default function Odometer({
  value,
  play = true,
  spins = 0,
  duration = 650,
  stagger = 0,
  className,
}: {
  value: string;
  play?: boolean;
  /** Extra full turns each column makes on its way to the digit. */
  spins?: number;
  /** Roll time per column, in ms. */
  duration?: number;
  /** Extra delay per column from the left, in ms. */
  stagger?: number;
  className?: string;
}) {
  const chars = value.split("");
  const reel = Array.from({ length: spins + 1 }, () => DIGITS).flat();

  return (
    <span className={clsx("lp-mono inline-flex h-[1.25em] leading-[1.25em]", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((ch, i) => {
          // keyed from the right so the units column stays put when the length changes
          const key = chars.length - i;
          if (!/\d/.test(ch)) return <span key={key}>{ch}</span>;
          const stop = play ? spins * 10 + Number(ch) : 0;
          return (
            <span key={key} className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden">
              <span
                className="lp-digit-col absolute left-0 top-0 flex flex-col"
                style={{
                  transform: `translateY(${-stop * 1.25}em)`,
                  transitionDuration: `${duration}ms`,
                  transitionDelay: play ? `${i * stagger}ms` : "0ms",
                }}
              >
                {reel.map((n, k) => (
                  <span key={k} className="block h-[1.25em]">{n}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
