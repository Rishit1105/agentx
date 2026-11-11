export const CORE = process.env.NEXT_PUBLIC_CORE || "http://localhost:8000";
export const WS_URL = CORE.replace(/^http/, "ws") + "/ws";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(CORE + path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error((data && (data.detail || data.error)) || `HTTP ${r.status}`);
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => req<T>(p),
  post: <T = any>(p: string, body?: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(p: string, body?: unknown) => req<T>(p, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string) => req<T>(p, { method: "DELETE" }),
  chat: (text: string, source = "chat", confidence?: number) => req<any>("/api/chat", { method: "POST",
    body: JSON.stringify({ text, source, confidence }) }),
  kill: (via: string) => req<any>("/api/kill", { method: "POST", body: JSON.stringify({ trigger: via, via }) }),
};
