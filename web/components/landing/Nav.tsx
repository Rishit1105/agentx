"use client";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { useScrollRoot } from "./context";
import { EASE, LaunchLink, Wordmark } from "./ui";

const LINKS = [
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
    <nav aria-label="Primary" className="fixed inset-x-0 top-0 z-50">
      <motion.div aria-hidden style={{ opacity: glass }} className="lp-nav-glass absolute inset-0 border-b border-white/[0.07]" />
      <div className="lp-wrap relative flex h-16 items-center gap-4">
        <a href="#top" className="shrink-0 text-[#eef2f7]" aria-label="Meridian, back to top">
          <Wordmark />
        </a>

        <ul className="ml-6 hidden min-w-0 items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-full px-3 py-2 text-[13.5px] text-[#bcc6d3] transition-colors hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="lp-mono hidden items-center gap-2 rounded-full border border-[#4fd49b]/40 px-2.5 py-1 text-[10.5px] tracking-[0.14em] text-[#4fd49b] sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4fd49b]" />
            PAPER ONLY
          </span>
          <LaunchLink className="lp-btn h-9 bg-[#eef2f7] px-4 text-[13.5px] text-[#0e131b] hover:bg-white">
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
            className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-[#eef2f7] lg:hidden"
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
            className="lp-nav-glass relative border-b border-white/[0.08] lg:hidden"
          >
            <ul className="lp-wrap grid gap-1 pb-4 pt-1">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 text-[15px] text-[#eef2f7] hover:bg-white/5"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="px-3 pt-2">
                <span className="lp-mono inline-flex items-center gap-2 text-[11px] tracking-[0.14em] text-[#4fd49b]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4fd49b]" />
                  PAPER ONLY · NO REAL MONEY
                </span>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
