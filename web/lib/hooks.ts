"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { useM } from "./store";
import type { Story } from "./types";

export function useStories(symbol?: string | null) {
  const v = useM((s) => s.storiesV);
  const [stories, setStories] = useState<Story[]>([]);
  useEffect(() => {
    api.get<Story[]>(`/api/stories${symbol ? `?symbol=${symbol}` : ""}`).then(setStories).catch(() => {});
  }, [v, symbol]);
  return stories;
}

/** Query-string param that tracks client navigations (incl. Conductor-driven ones) without a Suspense boundary. */
export function useQueryParam(name: string): string | null {
  const navTo = useM((s) => s.navTo);
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setV(new URLSearchParams(window.location.search).get(name));
    read();
    const t = setTimeout(read, 50);   // after router.push settles
    window.addEventListener("popstate", read);
    return () => { clearTimeout(t); window.removeEventListener("popstate", read); };
  }, [name, navTo]);
  return v;
}

export function useSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
}
