"use client";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { useScrollRoot } from "./context";
import { EASE, LaunchLink, Wordmark } from "./ui";

const LINKS = [
  { href: "#problem", label: "Why" },
  { href: "#agents", label: "Agents" },
  { href: "#safety", label: "Safety" },
  { href: "#automations", label: "Automations" },
  { href: "#backtest", label: "Backtest" },
  { href: "#how", label: "How it works" },
];

export default function Nav() {
  const container = useScrollRoot();
  const { scrollY } = useScroll({ container });
  const glass = useTransform(scrollY, [0, 80], [0, 1]);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", () => {
    if (open) setOpen(false);
  });

  return (
    <nav aria-label="Primary" className="lp-nav fixed inset-x-0 top-0 z-50">
      <motion.div aria-hidden style={{ opacity: glass }} className="lp-nav-bar absolute inset-0" />
      <div className="lp-wrap relative flex h-16 items-center gap-4">
        <a href="#top" className="shrink-0 text-(--lp-ink)" aria-label="Meridian, back to top">
          <Wordmark />
        </a>

        <ul className="ml-6 hidden min-w-0 items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-lg px-3 py-2 text-[13.5px] text-(--lp-ink-2) transition-colors hover:bg-(--lp-surface) hover:text-(--lp-ink)">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-md border border-(--lp-line-2) bg-(--lp-surface) px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-(--lp-ink-2) sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-(--lp-mint)" />
            Paper only
          </span>
          <LaunchLink className="lp-btn lp-btn-primary h-9 px-3.5 text-[13.5px]">
            <span className="hidden sm:inline">Launch the desk</span>
            <span className="sm:hidden">Launch</span>
            <ArrowRight size={15} aria-hidden />
          </LaunchLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="lp-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-(--lp-line-2) bg-(--lp-surface) text-(--lp-ink) lg:hidden"
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="lp-mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="lp-nav-bar relative lg:hidden"
          >
            <ul className="lp-wrap grid gap-1 pb-4 pt-1">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-[10px] px-3 py-3 text-[15px] text-(--lp-ink) hover:bg-(--lp-surface)"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="px-3 pt-2">
                <span className="lp-eyebrow inline-flex items-center gap-2 text-(--lp-ink-2)">
                  <span className="h-1.5 w-1.5 rounded-full bg-(--lp-mint)" />
                  Paper only · no real money
                </span>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
