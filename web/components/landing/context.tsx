"use client";
import { createContext, useCallback, useContext, useSyncExternalStore, type RefObject } from "react";

/** The landing page is its own scroll container (the desk app locks <body>), so scroll-linked
 *  effects need the container ref instead of the window. */
export const ScrollCtx = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useScrollRoot() {
  const ref = useContext(ScrollCtx);
  if (!ref) throw new Error("useScrollRoot must be used inside <Landing>");
  return ref;
}

/** "Launch the desk" from anywhere: plays the full-screen zoom transition, then routes to /deck. */
export const LaunchCtx = createContext<() => void>(() => {});
export const useLaunch = () => useContext(LaunchCtx);

/** Media query as an external store, so it never sets state inside an effect. */
export function useMedia(query: string, serverValue = false) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");
export const useIsDesktop = () => useMedia("(min-width: 1024px)", true);

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
