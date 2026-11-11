"use client";
import { create } from "zustand";
import type { Caption, EventMsg, FullState, PipeStep, Story, Ticket, VoiceState } from "./types";

export interface Toast { id: string; tone: "info" | "good" | "bad" | "warn"; title: string; body?: string }
export interface Thread { id: string; agent: string; t: number }

interface S {
  connected: boolean;
  st: FullState | null;
  voice: VoiceState;
  captions: Caption[];
  partial: string;
  active: Record<string, { tool: string; since: number }>;
  pulses: Thread[];
  pipeline: { symbol: string | null; steps: PipeStep[] };
  toasts: Toast[];
  mandateProposal: any | null;
  navTo: { screen: string; symbol?: string | null; t: number } | null;
  storyFocus: string | null;
  storiesV: number;
  tm: any | null;
  strategy: any | null;
  scan: any | null;
  backtestV: number;
  eventsLog: EventMsg[];
  drawerAgent: string | null;
  set: (p: Partial<S>) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
  apply: (e: EventMsg) => void;
}

const PIPE = ["Scan", "News", "Strategy", "Entry", "Plan", "Test", "Size", "Gate", "Approve", "Fill"];
const blankSteps = (): PipeStep[] => PIPE.map((name, i) => ({ step: i + 1, name, status: "idle", detail: "" }));
let refetchTimer: any = null;

export const useM = create<S>((set, get) => ({
  connected: false, st: null, voice: "idle", captions: [], partial: "", active: {}, pulses: [],
  pipeline: { symbol: null, steps: blankSteps() }, toasts: [], mandateProposal: null, navTo: null, storyFocus: null,
  storiesV: 0, tm: null, strategy: null, scan: null, backtestV: 0, eventsLog: [], drawerAgent: null,
  set: (p) => set(p),
  toast: (t) => {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.tone === "bad" ? 7000 : 4500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  apply: (e) => {
    const p = e.payload || {};
    const s = get();
    if (e.type !== "clock.tick") set({ eventsLog: [...s.eventsLog.slice(-199), e] });
    const refetch = () => {
      clearTimeout(refetchTimer);
      refetchTimer = setTimeout(async () => {
        try {
          const { api } = await import("./api");
          set({ st: await api.get<FullState>("/api/state") });
        } catch {}
      }, 120);
    };
    switch (e.type) {
      case "hello":
        set({ st: p as FullState });
        break;
      case "clock.tick":
        if (s.st) set({ st: { ...s.st, clock: { ...s.st.clock, ...p } as any, account: p.account ?? s.st.account,
          kill: { ...s.st.kill, state: p.kill ?? s.st.kill.state } } });
        break;
      case "voice.state":
        set({ voice: p.state as VoiceState });
        break;
      case "voice.final":
        set({ captions: [...s.captions.slice(-40), { id: String(e.id ?? Date.now()), who: "you", text: p.text, ts: Date.now(),
          intent: p.intent }], partial: "" });
        break;
      case "voice.say":
        set({ captions: [...s.captions.slice(-40), { id: p.id, who: "meridian", text: p.text, ts: Date.now(), kind: p.kind }] });
        break;
      case "agent.start": {
        const active = { ...s.active, [p.agent]: { tool: p.tool, since: Date.now() } };
        set({ active, pulses: [...s.pulses.slice(-24), { id: Math.random().toString(36).slice(2), agent: p.agent, t: Date.now() }] });
        break;
      }
      case "agent.done": {
        const active = { ...s.active };
        delete active[p.agent];
        set({ active });
        if (p.status === "error") s.toast({ tone: "bad", title: `${p.agent} failed`, body: (p.error || "").slice(0, 160) });
        break;
      }
      case "pipeline.start":
        set({ pipeline: { symbol: p.symbol, steps: blankSteps() } });
        break;
      case "pipeline.step": {
        const steps = s.pipeline.steps.map((x) => (x.step === p.step ? { ...x, status: p.status, detail: p.detail } : x));
        set({ pipeline: { symbol: p.symbol, steps } });
        break;
      }
      case "ticket.ready":
        if (s.st) set({ st: { ...s.st, ticket: p as Ticket } });
        break;
      case "ticket.cleared":
        if (s.st) set({ st: { ...s.st, ticket: null } });
        break;
      case "timemachine.ready":
        set({ tm: p });
        break;
      case "strategy.chosen":
        set({ strategy: p });
        break;
      case "scan.done":
        set({ scan: p });
        break;
      case "backtest.ready":
        set({ backtestV: s.backtestV + 1 });
        break;
      case "story.created":
        set({ storiesV: s.storiesV + 1 });
        if (["trade", "block", "halt"].includes(p.kind))
          s.toast({ tone: p.kind === "trade" ? "good" : "bad", title: p.kind === "trade" ? "Story written" : p.kind === "block" ?
            "Blocked by the risk gate" : "Desk halted", body: p.headline });
        break;
      case "story.updated":
        set({ storiesV: s.storiesV + 1 });
        break;
      case "policy.decision":
        if (p.verdict === "deny") s.toast({ tone: "warn", title: "Policy denied " + p.tool, body: p.reason });
        refetch();
        break;
      case "alert.ring":
        s.toast({ tone: "warn", title: "Alert rang", body: p.text || p.message || JSON.stringify(p).slice(0, 120) });
        break;
      case "sentinel.pause":
        if (p.paused) s.toast({ tone: "warn", title: "Entries paused", body: p.reason });
        refetch();
        break;
      case "ui.navigate":
        set({ navTo: { screen: p.screen, symbol: p.symbol, t: Date.now() } });
        break;
      case "ui.mandate":
        set({ mandateProposal: p.proposal });
        break;
      case "ui.story":
        set({ storyFocus: p.id });
        break;
      case "kill.state":
        if (s.st) set({ st: { ...s.st, kill: { ...s.st.kill, state: p.state } } });
        refetch();
        break;
      case "replay.started":
        set({ pipeline: { symbol: null, steps: blankSteps() }, captions: [], tm: null, strategy: null, scan: null,
          storiesV: s.storiesV + 1 });
        refetch();
        break;
      case "order.update": case "risk.update": case "mode.changed": case "mandate.granted": case "mandate.revoked":
      case "limits.changed": case "watch.added": case "watch.triggered": case "clock.control": case "replay.ended":
        refetch();
        break;
    }
  },
}));

/** Rupees with Indian digit grouping: 500000 -> ₹5,00,000.00 */
const inr = (n: number | null | undefined, d = 2) =>
  n == null || isNaN(n) ? "—" : (n < 0 ? "−₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  usd: inr,
  inr,
  lakh: (n: number | null | undefined) => (n == null ? "—" : Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n, 0)),
  sgn: (n: number | null | undefined, d = 2) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d)),
  pct: (n: number | null | undefined, d = 1) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(d)}%`),
  px: (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2)),
};
