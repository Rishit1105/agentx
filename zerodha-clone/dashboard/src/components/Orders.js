import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const badge = (status) => {
  const c = status === "COMPLETE" ? "#4caf50" : status === "OPEN" ? "#ff9800" : "#9e9e9e";
  return (
    <span style={{ background: c + "22", color: c, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
      {status || "COMPLETE"}
    </span>
  );
};

const Orders = () => {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const load = () =>
      axios
        .get("http://localhost:3002/allOrders")
        .then((res) => setOrders(res.data))
        .catch(() => {});
    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, []);

  if (orders.length === 0) {
    return (
      <div className="orders">
        <div className="no-orders">
          <p>You haven't placed any orders today</p>

          <Link to={"/"} className="btn">
            Get started
          </Link>
        </div>
      </div>
    );
  }

  const open = orders.filter((o) => o.status === "OPEN").length;

  return (
    <div className="orders">
      <h3 className="title">
        Orders ({orders.length}){open > 0 ? ` · ${open} pending` : ""}
      </h3>
      <div className="order-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Instrument</th>
              <th>Qty.</th>
              <th>Price / Trigger</th>
              <th>Status</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const pending = o.status === "OPEN";
              return (
                <tr key={o._id} style={pending ? { background: "#fffaf0" } : undefined}>
                  <td>{o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : ""}</td>
                  <td style={{ color: o.mode === "BUY" ? "#387ed1" : "#df514c" }}>{o.mode}</td>
                  <td>{o.name}</td>
                  <td>{o.qty}</td>
                  <td>
                    {pending
                      ? `${o.kind === "stop" ? "SL-M trigger" : "Limit"} ${Number(o.trigger || o.price).toFixed(2)}`
                      : Number(o.price).toFixed(2)}
                  </td>
                  <td>{badge(o.status)}</td>
                  <td>{o.source === "meridian" ? "Meridian" + (o.note ? " · " + o.note : "") : "Manual"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Orders;
