import { api } from "./api";
import { useM } from "./store";

let inflight = false;

/** Approve or decline the waiting ticket. A ticket that is already gone (approved on another screen, expired, replaced,
 *  double-clicked) is reported as a notice instead of an unhandled error. */
export async function ticketAction(index: number, action: "approve" | "decline") {
  if (inflight) return;
  inflight = true;
  try {
    await api.post(`/api/orders/${index}/${action}`);
  } catch (e: any) {
    const msg = String(e?.message || e);
    const gone = /no ticket/i.test(msg);
    useM.getState().toast({
      tone: "warn",
      title: gone ? "That ticket is no longer waiting" : `Could not ${action} the ticket`,
      body: gone ? "It was already placed, declined or replaced. Ask Meridian to plan a new trade." : msg,
    });
  } finally {
    inflight = false;
  }
}
