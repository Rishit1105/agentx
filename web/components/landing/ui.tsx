"use client";
import { cloneElement, isValidElement, useEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useInView, useScroll, useSpring, useTransform, type Variants } from "motion/react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { useLaunch, useReducedMotion, useScrollRoot } from "./context";

export type Tone = "cyan" | "violet" | "mint" | "coral" | "amber";

export const TONE: Record<Tone, string> = {
  cyan: "var(--lp-cyan)",
  violet: "var(--lp-violet)",
  mint: "var(--lp-mint)",
  coral: "var(--lp-coral)",
  amber: "var(--lp-amber)",
};
export const TONE_SOFT: Record<Tone, string> = {
  cyan: "var(--lp-cyan-soft)",
  violet: "var(--lp-violet-soft)",
  mint: "var(--lp-mint-soft)",
  coral: "var(--lp-coral-soft)",
  amber: "var(--lp-amber-soft)",
};

export const EASE = [0.2, 0.7, 0.2, 1] as const;

export function OrbMark({ size = 22, className }: { size?: number; className?: string }) {
  return <span aria-hidden className={clsx("lp-orb-mark inline-block shrink-0", className)} style={{ width: size, height: size }} />;
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <OrbMark size={20} />
      <span className="lp-display text-[15px] font-semibold tracking-[0.12em]">MERIDIAN</span>
    </span>
  );
}

/** Shared reveal choreography: a container staggers its children, each child fades and rises. */
export const stagger = (gap = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94, y: 14 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

const wordVariants: Variants = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.75, ease: EASE } },
};

/**
 * Splits every string in a heading into masked words that rise into place one after another (the parent
 * must use `stagger` variants). Wrapping elements, such as a muted <span>, are kept around their words.
 */
export function splitWords(node: ReactNode, key = "w"): ReactNode {
  if (typeof node === "string") {
    return node.split(/(\s+)/).map((part, i) =>
      !part || /^\s+$/.test(part) ? part : (
        <span key={`${key}-${i}`} className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-top">
          <motion.span variants={wordVariants} className="inline-block">{part}</motion.span>
        </span>
      ),
    );
  }
  if (Array.isArray(node)) return node.map((n, i) => splitWords(n, `${key}-${i}`));
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return cloneElement(el, { key }, splitWords(el.props.children, key));
  }
  return node;
}

/**
 * A page section whose content zooms in from 0.9 with depth as it enters and eases back as it leaves,
 * cross-fading with its neighbours. Scroll-linked and spring-smoothed; transform and opacity only.
 */
export function Scene({ id, label, className, innerClassName, children }: {
  id?: string;
  label: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  const container = useScrollRoot();
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start end", "end start"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4, restDelta: 0.0005 });
  const scale = useTransform(p, [0, 0.28, 0.74, 1], reduced ? [1, 1, 1, 1] : [0.9, 1, 1, 0.94]);
  const y = useTransform(p, [0, 0.28, 0.74, 1], reduced ? [0, 0, 0, 0] : [70, 0, 0, -40]);
  const opacity = useTransform(p, [0, 0.2, 0.8, 1], reduced ? [1, 1, 1, 1] : [0.25, 1, 1, 0.35]);

  return (
    <section id={id} ref={ref} aria-label={label} className={clsx("relative overflow-x-clip border-t border-(--lp-line)", id && "lp-anchor", className)}>
      <motion.div style={{ scale, y, opacity }} className={clsx("origin-[50%_30%] will-change-transform", innerClassName)}>
        {children}
      </motion.div>
    </section>
  );
}

/** Section header. `split` puts the lead beside the title on wide screens, which keeps sections short. */
export function SectionHeader({ eyebrow, title, lead, align = "left", split, className }: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  split?: boolean;
  className?: string;
}) {
  return (
    <motion.header
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      variants={stagger(0.08)}
      className={clsx(
        split ? "grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-12" : "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <div className="min-w-0">
        <motion.p variants={fadeUp} className="lp-eyebrow">{eyebrow}</motion.p>
        <motion.h2 variants={stagger(0.045)} className="lp-h2 mt-3 text-balance sm:mt-4">{splitWords(title)}</motion.h2>
      </div>
      {lead && (
        <motion.p variants={fadeUp} className={clsx("lp-lead text-pretty", split ? "lg:pb-1.5" : "mt-4 sm:mt-5")}>
          {lead}
        </motion.p>
      )}
    </motion.header>
  );
}

/** Fades and lifts its children in once they scroll into view. */
export function Reveal({ children, className, delay = 0, y = 18, scale = 1, amount = 0.3 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  scale?: number;
  amount?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y, scale }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Scroll-linked parallax: drifts its children by `distance` px across their pass through the viewport. */
export function Parallax({ children, className, distance = 40 }: { children: ReactNode; className?: string; distance?: number }) {
  const container = useScrollRoot();
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ container, target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [distance, -distance]);
  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}

/** A number that counts up from zero the first time it scrolls into view. */
export function CountUp({ to, prefix = "", suffix = "", className }: { to: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView || reduced || to === 0) return;
    const c = animate(0, to, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = `${prefix}${Math.round(v).toLocaleString("en-IN")}${suffix}`),
    });
    return () => c.stop();
  }, [inView, to, prefix, suffix, reduced]);

  return (
    <span ref={ref} className={clsx("lp-mono", className)}>
      {prefix}{to.toLocaleString("en-IN")}{suffix}
    </span>
  );
}

export type TabItem<T extends string> = { id: T; label: ReactNode };

/**
 * A segmented tab bar whose active pill glides between tabs (shared layoutId). Arrow keys move between
 * tabs, as the WAI-ARIA tabs pattern expects. Panels use id `${idBase}-panel-${id}`.
 */
export function TabBar<T extends string>({ tabs, value, onChange, idBase, label, className }: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  idBase: string;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label}
      className={clsx("inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-(--lp-line-2) bg-(--lp-surface) p-1 shadow-(--lp-shadow)", className)}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={clsx(
              "relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[9px] px-3 py-2 text-[13.5px] font-medium transition-colors duration-200 sm:px-4",
              on ? "text-(--lp-on-primary)" : "text-(--lp-ink-2) hover:text-(--lp-ink)",
            )}
          >
            {on && (
              <motion.span
                layoutId={`${idBase}-pill`}
                className="absolute inset-0 rounded-[9px] bg-(--lp-primary)"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-2">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Slide direction for tab panels: +1 when moving right, -1 when moving left. */
export const panelVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -48, transition: { duration: 0.25, ease: EASE } }),
};

/** Tracks the current tab and which way the last change went, for directional panel transitions. */
export function useTabs<T extends string>(order: readonly T[], initial: T) {
  const [state, setState] = useState<{ tab: T; dir: number }>({ tab: initial, dir: 1 });
  const select = (next: T) =>
    setState((cur) => (cur.tab === next ? cur : { tab: next, dir: order.indexOf(next) > order.indexOf(cur.tab) ? 1 : -1 }));
  return { tab: state.tab, dir: state.dir, select };
}

export type AccordionItem = { id: string; title: ReactNode; meta?: ReactNode; body: ReactNode; icon?: ReactNode };

/** A single-open accordion with a hairline between rows; the open row's chevron turns. */
export function Accordion({ items, initial, className }: { items: AccordionItem[]; initial?: string; className?: string }) {
  const [open, setOpen] = useState<string | null>(initial ?? items[0]?.id ?? null);
  return (
    <motion.ul
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      variants={stagger(0.06)}
      className={clsx("border-t border-(--lp-line)", className)}
    >
      {items.map((it) => {
        const on = open === it.id;
        return (
          <motion.li key={it.id} variants={fadeUp} className="border-b border-(--lp-line)">
            <h3>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={`acc-${it.id}`}
                id={`acc-${it.id}-btn`}
                onClick={() => setOpen(on ? null : it.id)}
                className="group flex w-full items-center gap-3.5 py-3.5 text-left"
              >
                {it.icon}
                <span className="min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em]">{it.title}</span>
                {it.meta}
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={clsx("shrink-0 text-(--lp-muted) transition-transform duration-300 group-hover:text-(--lp-ink)", on && "rotate-180")}
                />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div
                  id={`acc-${it.id}`}
                  role="region"
                  aria-labelledby={`acc-${it.id}-btn`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="pb-4 text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">{it.body}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

/** A link to /deck that plays the launch transition (modifier-clicks still open a new tab). */
export function LaunchLink({ children, className, ariaLabel }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  const launch = useLaunch();
  return (
    <a
      href="/deck"
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        launch();
      }}
    >
      {children}
    </a>
  );
}

export function Bubble({ who, children, tone = "cyan", className }: {
  who: "you" | "meridian";
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const you = who === "you";
  return (
    <div className={clsx("flex min-w-0", you ? "justify-end" : "justify-start", className)}>
      <div
        className={clsx("max-w-[88%] min-w-0 rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-snug",
          you ? "rounded-br-md" : "rounded-bl-md")}
        style={{
          borderColor: you ? "var(--lp-line-2)" : `color-mix(in srgb, ${TONE[tone]} 35%, transparent)`,
          background: you ? "var(--lp-surface-2)" : TONE_SOFT[tone],
        }}
      >
        <span className="lp-eyebrow mb-1 block text-[10px]" style={{ color: you ? "var(--lp-muted)" : TONE[tone] }}>
          {you ? "You" : "Meridian"}
        </span>
        <span className="text-pretty text-(--lp-ink)">{children}</span>
      </div>
    </div>
  );
}
