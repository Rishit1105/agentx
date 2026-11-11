import React, { useEffect, useState } from "react";
import axios from "axios";

// Live: reads /allPositions every 2s, so a trade placed by the Meridian agent appears (and its P&L moves) in front of you.
const Positions = () => {
  const [positions, setPositions] = useState([]);
  const [seen, setSeen] = useState({});

  useEffect(() => {
    const load = () =>
      axios
        .get("http://localhost:3002/allPositions")
        .then((res) => setPositions(res.data))
        .catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // remember first-sight time per position so brand-new rows get a highlight flash
    setSeen((prev) => {
      const next = { ...prev };
      positions.forEach((p) => {
        if (!next[p._id]) next[p._id] = Date.now();
      });
      return next;
    });
  }, [positions]);

  const total = positions.reduce((a, p) => a + (p.price - p.avg) * p.qty, 0);

  return (
    <>
      <h3 className="title">Positions ({positions.length})</h3>

      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Avg.</th>
              <th>LTP</th>
              <th>P&L</th>
              <th>Chg.</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((stock) => {
              const pnl = (stock.price - stock.avg) * stock.qty;
              const fresh = seen[stock._id] && Date.now() - seen[stock._id] < 6000;
              return (
                <tr key={stock._id} style={fresh ? { background: "#e8f5e9", transition: "background 1s" } : { transition: "background 1s" }}>
                  <td>{stock.product}</td>
                  <td>{stock.name}</td>
                  <td>{stock.qty}</td>
                  <td>{Number(stock.avg).toFixed(2)}</td>
                  <td>{Number(stock.price).toFixed(2)}</td>
                  <td className={pnl >= 0 ? "profit" : "loss"}>{pnl.toFixed(2)}</td>
                  <td className={stock.isLoss ? "loss" : "profit"}>{stock.day}</td>
                </tr>
              );
            })}
            {positions.length > 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "right" }}>
                  <b>Total P&L</b>
                </td>
                <td className={total >= 0 ? "profit" : "loss"}>
                  <b>{total.toFixed(2)}</b>
                </td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
        {positions.length === 0 && <p style={{ padding: 16, color: "#888" }}>No open positions.</p>}
      </div>
    </>
  );
};

export default Positions;
