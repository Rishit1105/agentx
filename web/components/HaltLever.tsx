"use client";
import { useEffect, useRef, useState } from "react";
import { OctagonX, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useM } from "@/lib/store";
import { speaker } from "@/lib/voice";

/** Hold-to-halt: press and hold 1 s (the ring fills) — deliberate, accident-resistant, always in the same place. */
export default function HaltLever({ big = false }: { big?: boolean }) {
  const kill = useM((s) => s.st?.kill.state ?? "ARMED");
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(0);
  const fired = useRef(false);
  const HOLD = 1000;

  const fire = async (via: string) => {
    fired.current = true;
    speaker.stop();
    try { navigator.vibrate?.([60, 40, 200]); } catch {}
    try { await api.kill(via); } catch (e: any) { useM.getState().toast({ tone: "bad", title: "Halt failed", body: e.message }); }
  };
  const down = (e: React.PointerEvent) => {
    if (kill !== "ARMED") return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    fired.current = false;
    t0.current = performance.now();
    const step = () => {
      const v = Math.min(1, (performance.now() - t0.current) / HOLD);
      setP(v);
      if (v >= 1 && !fired.current) { fire("ui-hold"); return; }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  const up = () => { cancelAnimationFrame(raf.current); if (!fired.current) setP(0); };
  useEffect(() => { if (kill === "ARMED") setP(0); }, [kill]);

  const locked = kill !== "ARMED";
  const S = big ? 168 : 30;
  const r = S / 2 - (big ? 6 : 3);
  const C = 2 * Math.PI * r;
  if (big) {
    return (
      <button onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} disabled={locked}
        className="relative grid place-items-center select-none rounded-full transition-transform active:scale-[0.98]"
        style={{ width: S, height: S, background: locked ? "radial-gradient(circle,#2a0f14,#12090b)" :
          "radial-gradient(circle at 50% 40%, #3a1219, #1a0a0e 70%)", boxShadow: `0 0 ${20 + p * 60}px rgba(229,72,77,${0.25 + p * 0.5})` }}
        aria-label="Hold for one second to halt everything">
        <svg width={S} height={S} className="absolute inset-0 -rotate-90">
          <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke="#f6d4d5" strokeWidth={8} />
          <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke="#e5484d" strokeWidth={8} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - (locked ? 1 : p))} />
        </svg>
        <div className="flex flex-col items-center gap-1 text-coral">
          {locked ? <Lock size={30} /> : <OctagonX size={34} />}
          <span className="display text-sm font-semibold tracking-[0.2em]">{locked ? "LOCKED" : "HOLD TO HALT"}</span>
          <span className="text-[10px] text-muted">{locked ? "re-arm below" : "1 s · Esc×2 · “stop everything”"}</span>
        </div>
      </button>
    );
  }
  return (
    <button onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
      className="relative flex items-center gap-2 h-9 pl-1.5 pr-3.5 rounded-full select-none overflow-hidden transition-all"
      style={{ background: locked ? "rgba(229,72,77,0.18)" : "rgba(229,72,77,0.1)", border: "1px solid rgba(229,72,77,0.45)",
        boxShadow: p > 0 ? `0 0 ${p * 30}px rgba(229,72,77,0.6)` : "none" }}
      aria-label="Hold one second to halt all trading" title="Hold 1 s to halt (or press Esc twice)">
      <span className="absolute inset-y-0 left-0 bg-coral/25" style={{ width: `${(locked ? 1 : p) * 100}%` }} />
      <svg width={S} height={S} className="relative -rotate-90">
        <circle cx={S / 2} cy={S / 2} r={r} fill="#e5484d22" stroke="#e5484d55" strokeWidth={2} />
        <circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke="#e5484d" strokeWidth={2.5} strokeDasharray={C}
          strokeDashoffset={C * (1 - (locked ? 1 : p))} />
      </svg>
      <span className="relative display text-[12px] font-semibold tracking-[0.16em] text-coral">{locked ? "HALTED" : "HALT"}</span>
    </button>
  );
}
