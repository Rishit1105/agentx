import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import "./BuyActionWindow.css";

const API = "http://localhost:3002";
const MERIDIAN_URL = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inFrame = window.self !== window.top;

// Everything the Meridian agent does on this screen:
//  1. an order intent arrives -> the Buy window opens, the quantity and price are typed in, Buy is pressed (animated),
//  2. the screen then walks Orders -> Funds -> Positions so each page can be seen updating,
//  3. when the stop / target / flatten exit fills, a "trade closed" card shows the realised P&L (and, when this tab was
//     opened by Meridian rather than shown inside its split view, returns to Meridian after a few seconds).
const AgentLayer = () => {
  const navigate = useNavigate();
  const busy = useRef(false);
  const handled = useRef(new Set());
  const seenOrders = useRef(null);
  const [win, setWin] = useState(null); // { intent, qty, price, pressing }
  const [cards, setCards] = useState([]);
  const [closed, setClosed] = useState(null);
  const [countdown, setCountdown] = useState(null);
  // the big "Meridian" cursor: { x, y, show, clicks } (clicks increments to retrigger the ripple)
  const [cur, setCur] = useState({ x: window.innerWidth - 120, y: 110, show: false, clicks: 0 });

  const centerOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const waitFor = async (find, tries = 20) => {
    for (let i = 0; i < tries; i++) {
      const el = find();
      if (el) return el;
      await sleep(100);
    }
    return null;
  };
  const moveTo = async (el, { click = false } = {}) => {
    if (!el) return;
    const p = centerOf(el);
    setCur((c) => ({ ...c, ...p, show: true }));
    await sleep(850); // glide time (matches the CSS transition)
    if (click) {
      setCur((c) => ({ ...c, clicks: c.clicks + 1 }));
      await sleep(350);
    }
  };
  const navLink = (name) => () =>
    [...document.querySelectorAll("a")].find((a) => {
      try {
        return new URL(a.href).pathname.replace(/\/+$/, "").endsWith("/" + name);
      } catch (e) {
        return false;
      }
    });
  const clickNav = async (name) => {
    await moveTo(await waitFor(navLink(name)), { click: true });
    navigate("/" + name);
  };
  const hideCursor = () => setCur((c) => ({ ...c, show: false }));

  const typeInto = async (key, text) => {
    let shown = "";
    for (const ch of String(text)) {
      shown += ch;
      setWin((w) => w && { ...w, [key]: shown });
      await sleep(110);
    }
  };

  const runIntent = async (intent) => {
    busy.current = true;
    handled.current.add(intent.ref);
    try {
      await axios.post(`${API}/intent/${encodeURIComponent(intent.ref)}/claim`);
    } catch (e) {
      busy.current = false;
      return;
    }
    navigate("/orders");
    setCur((c) => ({ ...c, x: window.innerWidth - 140, y: 120, show: true }));
    setWin({ intent, qty: "", price: "", pressing: false });
    await sleep(700);
    await moveTo(await waitFor(() => document.querySelector("[data-cur=qty]")), { click: true });
    await typeInto("qty", intent.qty);
    await sleep(250);
    await moveTo(await waitFor(() => document.querySelector("[data-cur=price]")), { click: true });
    await typeInto("price", Number(intent.price).toFixed(2));
    await sleep(300);
    await moveTo(await waitFor(() => document.querySelector("[data-cur=buy]")));
    setWin((w) => w && { ...w, pressing: true });
    setCur((c) => ({ ...c, clicks: c.clicks + 1 }));
    await sleep(600);
    await axios.post(`${API}/intent/${encodeURIComponent(intent.ref)}/execute`).catch(() => {});
    setWin(null);
    // walk the screens with the cursor: Orders (order + pending stop/target) -> Funds (margin used) -> Positions
    await clickNav("orders");
    await sleep(2800);
    await clickNav("funds");
    await sleep(2800);
    await clickNav("positions");
    await sleep(1500);
    hideCursor();
    busy.current = false;
  };

  useEffect(() => {
    const poll = async () => {
      try {
        if (!busy.current) {
          const { data } = await axios.get(`${API}/intent/pending`);
          const next = data.find((i) => !handled.current.has(i.ref));
          if (next) runIntent(next);
        }
        const { data: orders } = await axios.get(`${API}/allOrders`);
        const done = orders.filter((o) => o.source === "meridian" && o.status === "COMPLETE");
        if (seenOrders.current === null) {
          // first load: only orders from the last 30s count as "just happened"
          seenOrders.current = new Set(
            done.filter((o) => Date.now() - new Date(o.completedAt || o.createdAt).getTime() > 30000).map((o) => o._id)
          );
        }
        const fresh = done.filter((o) => !seenOrders.current.has(o._id));
        fresh.reverse().forEach((o) => {
          seenOrders.current.add(o._id);
          setCards((c) => [...c, o]);
          setTimeout(() => setCards((c) => c.filter((x) => x._id !== o._id)), 9000);
          if (o.mode === "SELL") {
            setClosed(o);
            if (!busy.current) {
              busy.current = true;
              clickNav("orders").then(() => sleep(1800)).then(hideCursor).finally(() => { busy.current = false; });
            }
          }
        });
      } catch (e) {
        /* backend not up yet */
      }
    };
    poll();
    const t = setInterval(poll, 800);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  // auto-return to Meridian after an exit, but only when this page was opened by Meridian (not inside its split view)
  useEffect(() => {
    if (!closed || inFrame) return;
    let n = 10;
    setCountdown(n);
    const t = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(t);
        window.location.href = MERIDIAN_URL;
      }
    }, 1000);
    return () => clearInterval(t);
  }, [closed]);

  const sideColor = (m) => (m === "BUY" ? "#387ed1" : "#df514c");

  return (
    <>
      <style>{`
        @keyframes meridianRipple { from { transform: translate(-50%,-50%) scale(.2); opacity: .9 } to { transform: translate(-50%,-50%) scale(1.6); opacity: 0 } }
        @keyframes meridianBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      `}</style>
      <div
        aria-hidden
        style={{
          position: "fixed", left: 0, top: 0, zIndex: 10000, pointerEvents: "none",
          transform: `translate(${cur.x}px, ${cur.y}px)`,
          transition: "transform 850ms cubic-bezier(.45,.05,.25,1), opacity 300ms",
          opacity: cur.show ? 1 : 0,
        }}
      >
        <span
          key={cur.clicks}
          style={{
            position: "absolute", left: 0, top: 0, width: 70, height: 70, borderRadius: "50%",
            border: "3px solid #38e1ff", background: "rgba(56,225,255,.25)",
            animation: cur.clicks ? "meridianRipple 600ms ease-out" : "none", opacity: 0,
          }}
        />
        <div style={{ animation: "meridianBob 1.4s ease-in-out infinite" }}>
          <svg width="52" height="52" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,.45)) drop-shadow(0 0 12px rgba(56,225,255,.7))" }}>
            <path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.2 L18 13 Z" fill="#0b1320" stroke="#38e1ff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <div
            style={{
              position: "absolute", left: 34, top: 40, whiteSpace: "nowrap", fontSize: 13, fontWeight: 700,
              letterSpacing: 1.5, color: "#031118", background: "linear-gradient(180deg,#5beaff,#19bfe0)",
              padding: "4px 12px", borderRadius: 14, boxShadow: "0 4px 14px rgba(0,0,0,.35)",
            }}
          >
            MERIDIAN
          </div>
        </div>
      </div>

      {win && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", zIndex: 9990 }}>
          <div className="container" id="buy-window" style={{ position: "fixed", top: 150, left: "38%", zIndex: 9991 }}>
            <div style={{ fontSize: 11, color: "#387ed1", padding: "6px 10px 0", letterSpacing: 0.5 }}>
              MERIDIAN AGENT IS PLACING AN ORDER · {win.intent.name} · NSE
            </div>
            <div className="regular-order">
              <div className="inputs">
                <fieldset>
                  <legend>Qty.</legend>
                  <input data-cur="qty" type="text" readOnly value={win.qty} />
                </fieldset>
                <fieldset>
                  <legend>Price</legend>
                  <input data-cur="price" type="text" readOnly value={win.price} />
                </fieldset>
              </div>
            </div>
            <div className="buttons">
              <span>
                Margin required ₹
                {(Number(win.intent.qty) * Number(win.intent.price)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <div>
                <span
                  data-cur="buy"
                  className="btn btn-blue"
                  style={win.pressing ? { transform: "scale(.92)", boxShadow: "0 0 0 4px rgba(56,126,209,.35)" } : undefined}
                >
                  Buy
                </span>
                <span className="btn btn-grey">Cancel</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "fixed", top: 120, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10 }}>
        {cards.map((o) => (
          <div
            key={o._id}
            style={{
              background: "#fff",
              borderLeft: `5px solid ${sideColor(o.mode)}`,
              boxShadow: "0 6px 24px rgba(0,0,0,.18)",
              borderRadius: 6,
              padding: "12px 16px",
              minWidth: 300,
              fontSize: 14,
            }}
          >
            <div style={{ fontSize: 11, color: "#888", letterSpacing: 0.5 }}>
              ORDER EXECUTED · placed by Meridian{o.note ? ` · ${o.note}` : ""}
            </div>
            <div style={{ marginTop: 4, fontWeight: 600 }}>
              <span style={{ color: sideColor(o.mode) }}>{o.mode}</span> {o.name} · {o.qty} qty @ ₹{Number(o.price).toFixed(2)}
            </div>
            <div style={{ marginTop: 4, color: "#4caf50", fontSize: 12 }}>COMPLETE · MIS</div>
          </div>
        ))}
      </div>

      {closed && (
        <div
          style={{
            position: "fixed",
            bottom: 60,
            right: 20,
            zIndex: 9999,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 8px 30px rgba(0,0,0,.25)",
            padding: "16px 20px",
            minWidth: 300,
            borderTop: `4px solid ${(closed.pnl || 0) >= 0 ? "#4caf50" : "#df514c"}`,
          }}
        >
          <div style={{ fontSize: 11, color: "#888", letterSpacing: 0.5 }}>
            TRADE CLOSED · {closed.name} · {closed.note}
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6, color: (closed.pnl || 0) >= 0 ? "#4caf50" : "#df514c" }}>
            {closed.pnl == null
              ? ""
              : `${closed.pnl >= 0 ? "+" : "−"}₹${Math.abs(closed.pnl).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Sold {closed.qty} @ ₹{Number(closed.price).toFixed(2)} · realised P&L
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            {!inFrame && (
              <a href={MERIDIAN_URL} className="btn btn-blue" style={{ textDecoration: "none" }}>
                Back to Meridian{countdown != null ? ` (${countdown})` : ""}
              </a>
            )}
            <span
              className="btn btn-grey"
              onClick={() => {
                setClosed(null);
                setCountdown(null);
              }}
            >
              Stay here
            </span>
          </div>
        </div>
      )}

      {!inFrame && (
        <a
          href={MERIDIAN_URL}
          style={{
            position: "fixed",
            bottom: 16,
            left: 16,
            zIndex: 9999,
            background: "#111",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 20,
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← Back to Meridian
        </a>
      )}
    </>
  );
};

export default AgentLayer;
