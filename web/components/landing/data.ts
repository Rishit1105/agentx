import {
  ArrowLeftRight, BellRing, BookOpen, ChartColumn, Compass, Eye, FileText, FlaskConical, Gauge, Hand, History,
  Landmark, Layers, Lock, LogOut, Mic, Newspaper, PenLine, Radar, Scale, ShieldCheck, Target, Timer, TrendingUp,
  Wallet, Lightbulb, Receipt, Crosshair, Search, type LucideIcon,
} from "lucide-react";

export type Agent = {
  id: string;
  name: string;
  kind: "skill" | "service";
  icon: LucideIcon;
  role: string;
  detail: string;
};

export const AGENTS: Agent[] = [
  { id: "scanner", name: "Scanner", kind: "skill", icon: Radar, role: "Sweeps the NIFTY 500 for setups.",
    detail: "Scans all 497 tradable NSE stocks for opening-range breakouts and ranks the cleanest ones." },
  { id: "news", name: "News", kind: "skill", icon: Newspaper, role: "Reads the tape behind the tape.",
    detail: "Pulls the latest headlines for a symbol and flags anything that should stop a trade." },
  { id: "entry", name: "Entry Timer", kind: "skill", icon: Timer, role: "Waits for the right bar.",
    detail: "Decides when an entry is valid on the market clock, and when the window has closed." },
  { id: "exit", name: "Exit Planner", kind: "skill", icon: LogOut, role: "Sets stop and target first.",
    detail: "Places the stop and target before any entry, so every trade knows its way out." },
  { id: "timemachine", name: "Time Machine", kind: "skill", icon: History, role: "Replays the future 10,000 times.",
    detail: "Runs 10,000 Monte-Carlo sessions plus 60 real NSE sessions to stress a plan before you take it." },
  { id: "budget", name: "Budget", kind: "skill", icon: Wallet, role: "Sizes every position.",
    detail: "Turns your ₹2,500 per-trade risk cap into an exact share count, never a rupee over." },
  { id: "risk", name: "Risk", kind: "skill", icon: ShieldCheck, role: "The gate every order passes.",
    detail: "Checks each order against your limits and fingerprints the verdict to that exact order." },
  { id: "broker", name: "Broker", kind: "skill", icon: Landmark, role: "A Kite-style paper mirror.",
    detail: "Mirrors positions and orders in a Zerodha Kite-style view, entirely on paper." },
  { id: "alerts", name: "Alerts", kind: "skill", icon: BellRing, role: "Speaks up when it matters.",
    detail: "Watches price levels and P&L, and tells you out loud when something crosses." },
  { id: "analyst", name: "Analyst", kind: "skill", icon: ChartColumn, role: "Knows the quarterly numbers.",
    detail: "Reads quarterly results in ₹ crore so a plan never ignores the fundamentals." },
  { id: "deals", name: "Bulk Deals", kind: "skill", icon: Layers, role: "Follows the big money.",
    detail: "Tracks NSE bulk and block deals for the symbols on your watch." },
  { id: "strategist", name: "Strategist", kind: "service", icon: Compass, role: "Turns a hit into a plan.",
    detail: "Combines scan, news, timing and exits into one plan with entry, stop, target and size." },
  { id: "backtester", name: "Backtester", kind: "service", icon: FlaskConical, role: "Tells you if it ever worked.",
    detail: "Tests strategies against buy-and-hold and NIFTY 50, with an honest verdict and a PDF." },
  { id: "journalist", name: "Journalist", kind: "service", icon: PenLine, role: "Writes the Story of every trade.",
    detail: "Explains every trade, skip, block and halt in plain English, numbers checked against evidence." },
  { id: "sentinel", name: "Sentinel", kind: "service", icon: Eye, role: "Trips the circuit breakers.",
    detail: "Watches loss, drawdown and data freshness, and halts the desk the moment a line is crossed." },
  { id: "exchange", name: "Paper Exchange", kind: "service", icon: ArrowLeftRight, role: "Fills orders, never real ones.",
    detail: "Simulates fills with Indian intraday charges: brokerage, STT, exchange, SEBI, GST and stamp duty." },
];

export const LAYERS = [
  { id: "L0", name: "Paper-only assertion", tone: "mint" as const, icon: Lock,
    body: "Checked at boot. If the desk is not in paper mode, it does not start. There is no live route to break." },
  { id: "L1", name: "Risk gate", tone: "cyan" as const, icon: ShieldCheck,
    body: "Every order is checked against your limits. The verdict is fingerprinted to that exact order, so it can't be reused." },
  { id: "L2", name: "Mandate", tone: "violet" as const, icon: Timer,
    body: "Autopilot only runs inside a time-boxed mandate you grant. When the clock runs out, so does its permission." },
  { id: "L3", name: "Sentinel circuit breakers", tone: "amber" as const, icon: Gauge,
    body: "Trips on daily loss, drawdown or stale market data, before a bad minute becomes a bad day." },
  { id: "L4", name: "Kill switch", tone: "coral" as const, icon: Hand,
    body: "Hold to halt, say “stop everything”, press Esc twice, call the API, or let it fire on its own. Flat and locked." },
];

export const LIMITS = [
  { label: "Paper budget", value: "₹5,00,000" },
  { label: "Max loss per trade", value: "₹2,500" },
  { label: "Daily loss limit", value: "₹7,500" },
  { label: "Trades per day", value: "3" },
];

export type Step = { n: number; name: string; who: string; body: string; tone: "cyan" | "violet" | "amber" | "mint"; icon: LucideIcon };

export const LIFECYCLE: Step[] = [
  { n: 1, name: "Scan", who: "Scanner", tone: "violet", icon: Search, body: "497 stocks checked for an opening-range breakout." },
  { n: 2, name: "News", who: "News", tone: "violet", icon: Newspaper, body: "Headlines read for anything that should stop the trade." },
  { n: 3, name: "Strategy", who: "Strategist", tone: "violet", icon: Compass, body: "The setup becomes a named strategy with rules." },
  { n: 4, name: "Entry", who: "Entry Timer", tone: "violet", icon: Crosshair, body: "Entry only inside the valid window on the market clock." },
  { n: 5, name: "Plan", who: "Exit Planner", tone: "violet", icon: Target, body: "Stop and target set before anything else." },
  { n: 6, name: "Test", who: "Time Machine", tone: "violet", icon: History, body: "10,000 simulated sessions and 60 real ones." },
  { n: 7, name: "Size", who: "Budget", tone: "amber", icon: Scale, body: "Shares sized so the stop costs at most ₹2,500." },
  { n: 8, name: "Gate", who: "Risk", tone: "amber", icon: ShieldCheck, body: "Limits checked. Verdict fingerprinted to the order." },
  { n: 9, name: "Approve", who: "You", tone: "cyan", icon: Mic, body: "Nothing happens until you say “yes”." },
  { n: 10, name: "Fill", who: "Paper Exchange", tone: "mint", icon: ArrowLeftRight, body: "Simulated fill with Indian intraday charges." },
  { n: 11, name: "Watch", who: "Sentinel", tone: "amber", icon: Eye, body: "Loss, drawdown and stale data watched live." },
  { n: 12, name: "Exit", who: "Exit Planner", tone: "violet", icon: LogOut, body: "Stop, target or flat-by time, whichever comes first." },
  { n: 13, name: "Record", who: "Broker", tone: "violet", icon: Receipt, body: "Every order lands in the Kite-style ledger." },
  { n: 14, name: "Story", who: "Journalist", tone: "cyan", icon: FileText, body: "Plain English, numbers validated against evidence." },
  { n: 15, name: "Learn", who: "Backtester", tone: "cyan", icon: Lightbulb, body: "Honest verdicts feed the next plan." },
];

export const TEMPLATES = [
  { name: "Opening-bell briefing", when: "09:20", then: "Briefing", icon: BookOpen },
  { name: "Breakout radar", when: "Every 15 min", then: "Scan & watch top hit", icon: Radar },
  { name: "Soft loss guard", when: "Day P&L ≤ −₹5,000", then: "Halt the desk", icon: Hand },
  { name: "Risk budget warning", when: "Risk used ≥ 75%", then: "Spoken summary", icon: Gauge },
  { name: "Price alert", when: "ETERNAL crosses ₹375", then: "Briefing", icon: BellRing },
  { name: "Momentum day planner", when: "Scan hits ≥ 3", then: "Plan top hit", icon: TrendingUp },
  { name: "Pre-close wrap-up", when: "15:10", then: "Summary", icon: FileText },
];

export const DIALOGUE: { you: string; meridian: string; tone: "cyan" | "mint" | "coral" | "amber" }[] = [
  { you: "Hey Meridian, scan for breakouts.",
    meridian: "130 of the 497 NSE stocks scanned closed above their fifteen-minute opening range. SUNTV is the cleanest.",
    tone: "cyan" },
  { you: "Plan a trade on Zomato.",
    meridian: "Opening-range breakout. Entry 370.75, stop 365.57, target 375.93. 482 shares, risking ₹2,496.76. Risk gate passed. Say “yes, buy 482 ETERNAL”.",
    tone: "mint" },
  { you: "Buy 600 Zomato.",
    meridian: "Blocked. 600 shares would risk ₹3,108, over your ₹2,500 per-trade limit.",
    tone: "coral" },
  { you: "Raise my daily loss limit.",
    meridian: "I can't do that. Voice can tighten your limits, never loosen them. It stays at ₹7,500.",
    tone: "amber" },
  { you: "Stop everything.",
    meridian: "Halted. All positions flat. Desk locked.",
    tone: "coral" },
];
