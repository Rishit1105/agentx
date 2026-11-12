import Link from "next/link";
import { Wordmark } from "./ui";

const LINKS = [
  { href: "/deck", label: "Command Deck" },
  { href: "/studio", label: "Trade Studio" },
  { href: "/backtest", label: "Backtest Lab" },
  { href: "/ledger", label: "Ledger" },
  { href: "/guardrails", label: "Guardrails" },
];

/** Footer: the fine print, before the final zoom into the desk. */
export default function FinePrint() {
  return (
    <footer className="lp-soft relative border-y border-(--lp-line)">
      <div className="lp-wrap grid gap-8 py-9 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:py-10">
        <div className="min-w-0">
          <Wordmark />
          <p className="mt-4 max-w-xl text-pretty text-[14px] leading-relaxed text-(--lp-ink-2)">
            <span className="font-semibold text-(--lp-ink)">Educational prototype. Paper trading only. Not investment advice.</span>{" "}
            Meridian never touches real money and has no live broker route. SEBI&apos;s own research found that most
            individual intraday traders lose money. Treat every number here as a lesson, not a signal.
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-(--lp-muted)">
            Built with <span className="text-(--lp-ink-2)">day-trader-skill</span> (MIT) and{" "}
            <span className="text-(--lp-ink-2)">OmniVoice</span> (Apache-2.0). Market data for NSE India; replay of 11 Nov 2026.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-(--lp-muted)">
            The video is embedded from YouTube in privacy-enhanced mode and loads only when you press play. It belongs to
            CNBC-TV18 and is not an endorsement of Meridian.
          </p>
        </div>
        <nav aria-label="Desk" className="min-w-0 md:justify-self-end">
          <p className="lp-eyebrow">The desk</p>
          <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2.5 text-[14px]">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-(--lp-ink-2) transition-colors hover:text-(--lp-ink)">{l.label}</Link>
              </li>
            ))}
          </ul>
          <p className="lp-eyebrow mt-6 text-[11px] text-(--lp-faint)">© 2026 Meridian · simulated trading</p>
        </nav>
      </div>
    </footer>
  );
}
