export type KillState = "ARMED" | "HALTING" | "LOCKED" | "RE-ARMED";
export type Mode = "observe" | "advise" | "autopilot";
export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "awaiting_confirm" | "halted";

export interface ClockSnap { mode: "live" | "replay"; speed: number; paused: boolean; now: string; iso: string; hhmm: string;
  date: string; phase: string }
export interface Account { cash: number; equity: number; start: number; realized: number; unrealized: number; fees: number;
  day_pnl: number; day_pnl_pct: number; peak: number; drawdown_pct: number; open_orders: number; positions: number }
export interface Position { symbol: string; qty: number; avg_price: number; stop: number | null; target: number | null;
  opened_ts: string; last: number; unrealized: number; value: number; r_now: number | null; story_id?: string; setup?: string;
  max_loss?: number }
export interface Risk { committed: number; daily_limit: number; trades_used: number; max_trades: number;
  max_loss_per_trade: number; pct: number }
export interface Agent { id: string; label: string; kind: "repo" | "native"; skill: string | null; busy: boolean;
  last: { tool: string; status: string; ms: number; at: string } | null }
export interface Ticket { symbol: string; index: number; plain: string; tool_input: Record<string, string>; fingerprint: string;
  qty: number; entry: number; stop: number; target: number; risk_per_share: number; max_loss: number; reward_risk: number;
  value: number; strategy: string; strategy_label: string; tm_verdict: string; odds: { target?: number; stop?: number; open?: number };
  bt_verdict: string; risk_info: string[]; sizing_limits: { name: string; usd: number; per: number; shares: number; how: string;
  binds: boolean }[]; bound_by: string; flat_by: string; created: string; mode: Mode; say: string; window_s: number }
export interface Mandate { id: string; granted_ts: string; expires_ts: string; max_trades: number; used: number; status: string;
  scope: { strategies: string[]; symbols: string | string[]; max_loss_per_trade: number } }
export interface Story { id: string; ts: string; vclock: string; kind: string; symbol: string | null; headline: string; why: string;
  checked: string; if_wrong: string; outcome: string; spoken: string; pnl: number | null; r: number | null; status: string;
  writer: string; evidence: { bundle?: Record<string, unknown>; files?: { file: string; sha256: string }[] | string[] } }
export interface Caption { id: string; who: "you" | "meridian" | "system"; text: string; ts: number; kind?: string; intent?: string }
export interface PipeStep { step: number; name: string; status: string; detail: string }
export interface EventMsg { id?: number; ts: string; vclock: string; type: string; actor: string; payload: Record<string, any> }
export interface FullState { mode: Mode; clock: ClockSnap; kill: { state: KillState; cooldown_s: number; paused: string | null;
  breakers: Record<string, { value: number | null; limit: number; tripped: boolean }>; last: any; consecutive_stops: number };
  paper: { ok: boolean; broker: string }; limits: Record<string, any>; risk: Risk; account: Account; positions: Position[];
  orders: any[]; mandate: Mandate | null; ticket: Ticket | null; watch: Record<string, any>; agents: Agent[];
  last_scan: any; llm: any; voice: any; replay: { date: string; synthetic_from: string | null; filled_bars?: number };
  market: { exchange: string; currency: string; tz: string; index: string }; names: Record<string, string> }
