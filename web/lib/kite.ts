export const KITE_URL = process.env.NEXT_PUBLIC_KITE_URL || "http://localhost:3001";
const SPLIT_KEY = "meridian.split";

/** Take the user to Kite with `symbol` added to its watchlist and its Buy window opened (nothing is bought automatically).
 *  Full redirect normally; in split view the Kite pane is pointed there instead. */
export function goToKite(symbol: string) {
  const url = `${KITE_URL}/?add=${encodeURIComponent(symbol)}`;
  let split = false;
  try { split = localStorage.getItem(SPLIT_KEY) === "1"; } catch {}
  if (split) window.dispatchEvent(new CustomEvent("meridian-kite", { detail: { url } }));
  else window.location.href = url;
}
