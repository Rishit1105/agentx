require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");

const { HoldingsModel } = require("./model/HoldingsModel");

const { PositionsModel } = require("./model/PositionsModel");
const { OrdersModel } = require("./model/OrdersModel");

const PORT = process.env.PORT || 3002;
const uri = process.env.MONGO_URL;

const app = express();

app.use(cors());
app.use(bodyParser.json());

// app.get("/addHoldings", async (req, res) => {
//   let tempHoldings = [
//     {
//       name: "BHARTIARTL",
//       qty: 2,
//       avg: 538.05,
//       price: 541.15,
//       net: "+0.58%",
//       day: "+2.99%",
//     },
//     {
//       name: "HDFCBANK",
//       qty: 2,
//       avg: 1383.4,
//       price: 1522.35,
//       net: "+10.04%",
//       day: "+0.11%",
//     },
//     {
//       name: "HINDUNILVR",
//       qty: 1,
//       avg: 2335.85,
//       price: 2417.4,
//       net: "+3.49%",
//       day: "+0.21%",
//     },
//     {
//       name: "INFY",
//       qty: 1,
//       avg: 1350.5,
//       price: 1555.45,
//       net: "+15.18%",
//       day: "-1.60%",
//       isLoss: true,
//     },
//     {
//       name: "ITC",
//       qty: 5,
//       avg: 202.0,
//       price: 207.9,
//       net: "+2.92%",
//       day: "+0.80%",
//     },
//     {
//       name: "KPITTECH",
//       qty: 5,
//       avg: 250.3,
//       price: 266.45,
//       net: "+6.45%",
//       day: "+3.54%",
//     },
//     {
//       name: "M&M",
//       qty: 2,
//       avg: 809.9,
//       price: 779.8,
//       net: "-3.72%",
//       day: "-0.01%",
//       isLoss: true,
//     },
//     {
//       name: "RELIANCE",
//       qty: 1,
//       avg: 2193.7,
//       price: 2112.4,
//       net: "-3.71%",
//       day: "+1.44%",
//     },
//     {
//       name: "SBIN",
//       qty: 4,
//       avg: 324.35,
//       price: 430.2,
//       net: "+32.63%",
//       day: "-0.34%",
//       isLoss: true,
//     },
//     {
//       name: "SGBMAY29",
//       qty: 2,
//       avg: 4727.0,
//       price: 4719.0,
//       net: "-0.17%",
//       day: "+0.15%",
//     },
//     {
//       name: "TATAPOWER",
//       qty: 5,
//       avg: 104.2,
//       price: 124.15,
//       net: "+19.15%",
//       day: "-0.24%",
//       isLoss: true,
//     },
//     {
//       name: "TCS",
//       qty: 1,
//       avg: 3041.7,
//       price: 3194.8,
//       net: "+5.03%",
//       day: "-0.25%",
//       isLoss: true,
//     },
//     {
//       name: "WIPRO",
//       qty: 4,
//       avg: 489.3,
//       price: 577.75,
//       net: "+18.08%",
//       day: "+0.32%",
//     },
//   ];

//   tempHoldings.forEach((item) => {
//     let newHolding = new HoldingsModel({
//       name: item.name,
//       qty: item.qty,
//       avg: item.avg,
//       price: item.price,
//       net: item.day,
//       day: item.day,
//     });

//     newHolding.save();
//   });
//   res.send("Done!");
// });

// app.get("/addPositions", async (req, res) => {
//   let tempPositions = [
//     {
//       product: "CNC",
//       name: "EVEREADY",
//       qty: 2,
//       avg: 316.27,
//       price: 312.35,
//       net: "+0.58%",
//       day: "-1.24%",
//       isLoss: true,
//     },
//     {
//       product: "CNC",
//       name: "JUBLFOOD",
//       qty: 1,
//       avg: 3124.75,
//       price: 3082.65,
//       net: "+10.04%",
//       day: "-1.35%",
//       isLoss: true,
//     },
//   ];

//   tempPositions.forEach((item) => {
//     let newPosition = new PositionsModel({
//       product: item.product,
//       name: item.name,
//       qty: item.qty,
//       avg: item.avg,
//       price: item.price,
//       net: item.net,
//       day: item.day,
//       isLoss: item.isLoss,
//     });

//     newPosition.save();
//   });
//   res.send("Done!");
// });

app.get("/allHoldings", async (req, res) => {
  let allHoldings = await HoldingsModel.find({});
  res.json(allHoldings);
});

app.get("/allPositions", async (req, res) => {
  let allPositions = await PositionsModel.find({});
  res.json(allPositions);
});

app.get("/allOrders", async (req, res) => {
  let allOrders = await OrdersModel.find({}).sort({ createdAt: -1 });
  res.json(allOrders);
});

// ---------------------------------------------------------------- order execution (shared by UI, API and fallback)
async function applyToPosition({ name, qty, price, mode }) {
  let pos = await PositionsModel.findOne({ name, product: "MIS" });
  if (mode === "BUY") {
    if (pos && pos.qty > 0) {
      const total = pos.qty + qty;
      pos.avg = (pos.avg * pos.qty + price * qty) / total;
      pos.qty = total;
    } else if (pos) {
      pos.qty = qty;
      pos.avg = price;
    } else {
      pos = new PositionsModel({ product: "MIS", name, qty, avg: price });
    }
  } else if (pos) {
    pos.qty = Math.max(0, pos.qty - qty);
  }
  if (!pos) return;
  if (pos.qty === 0) {
    await PositionsModel.deleteOne({ _id: pos._id });
  } else {
    pos.price = price;
    const pct = pos.avg ? ((price - pos.avg) / pos.avg) * 100 : 0;
    pos.net = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
    pos.day = pos.net;
    pos.isLoss = pct < 0;
    await pos.save();
  }
}

// Saves an executed order and updates positions. If an order with the same `ref` already exists (a pending stop/target
// Meridian synced earlier) it is completed instead of duplicated.
async function executeOrder(body) {
  const name = body.name;
  const qty = Number(body.qty);
  const price = Number(body.price);
  const mode = String(body.mode || "").toUpperCase();
  if (!name || !(qty > 0) || !(price >= 0) || !["BUY", "SELL"].includes(mode)) {
    throw new Error("name, qty > 0, price and mode BUY|SELL are required");
  }
  let order = body.ref ? await OrdersModel.findOne({ ref: body.ref }) : null;
  if (order && order.status === "COMPLETE") return order;
  if (!order) order = new OrdersModel({ ref: body.ref });
  Object.assign(order, {
    name, qty, price, mode,
    source: body.source || "manual",
    note: body.note || "",
    status: "COMPLETE",
    pnl: body.pnl == null ? undefined : Number(body.pnl),
    createdAt: order.createdAt && body.ref ? order.createdAt : new Date(),
    completedAt: new Date(),
  });
  await order.save();
  await applyToPosition({ name, qty, price, mode });
  return order;
}

app.post("/newOrder", async (req, res) => {
  try {
    await executeOrder(req.body);
    res.send("Order saved!");
  } catch (e) {
    res.status(400).send(String(e.message || e));
  }
});

// ---------------------------------------------------------------- intents: Meridian says "I am placing this order".
// The Kite dashboard claims it and performs the order in front of the user. If no dashboard is open it is executed here
// after a grace period, so the order is never lost.
const INTENT_GRACE_MS = 12000;
const INTENT_CLAIM_MS = 25000;
const intents = new Map();

app.post("/intent", (req, res) => {
  const b = req.body;
  if (!b.ref || !b.name) return res.status(400).send("ref and name required");
  if (!intents.has(b.ref)) {
    intents.set(b.ref, { ...b, state: "PENDING", expiresAt: Date.now() + INTENT_GRACE_MS });
  }
  res.send("ok");
});

app.get("/intent/pending", (req, res) => {
  const list = [...intents.values()].filter((i) => i.state === "PENDING");
  res.json(list.map(({ state, expiresAt, ...rest }) => rest));
});

app.post("/intent/:ref/claim", (req, res) => {
  const i = intents.get(req.params.ref);
  if (!i || i.state !== "PENDING") return res.status(404).send("gone");
  i.expiresAt = Date.now() + INTENT_CLAIM_MS;
  res.send("claimed");
});

app.post("/intent/:ref/execute", async (req, res) => {
  const i = intents.get(req.params.ref);
  if (!i) return res.status(404).send("gone");
  if (i.state === "PENDING") {
    i.state = "DONE";
    try {
      await executeOrder({ ...i, ref: i.ref });
    } catch (e) {
      return res.status(400).send(String(e.message || e));
    }
  }
  res.send("done");
});

setInterval(async () => {
  for (const i of intents.values()) {
    if (i.state === "PENDING" && Date.now() > i.expiresAt) {
      i.state = "DONE";
      try {
        await executeOrder({ ...i, ref: i.ref });
      } catch (e) {
        console.log("intent failed", e.message);
      }
    }
  }
}, 1000);

// ---------------------------------------------------------------- Meridian sync: account, prices, pending stop/target orders
let account = null;
let prices = {};

app.get("/account", (req, res) => res.json(account || {}));
app.get("/prices", (req, res) => res.json(prices));

app.post("/meridianSync", async (req, res) => {
  const { account: acc, prices: px, orders } = req.body || {};
  if (acc) account = { ...acc, updatedAt: new Date() };
  if (px) prices = px;

  // mark open positions from the pushed prices
  const positions = await PositionsModel.find({ product: "MIS" });
  for (const pos of positions) {
    const p = prices[pos.name];
    if (!p || !(p.ltp > 0)) continue;
    const pct = pos.avg ? ((p.ltp - pos.avg) / pos.avg) * 100 : 0;
    pos.price = p.ltp;
    pos.net = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
    pos.day = pos.net;
    pos.isLoss = pct < 0;
    await pos.save();
  }

  // pending protective orders (stop / target): only once their parent entry order exists on Kite
  for (const o of orders || []) {
    const parent = await OrdersModel.findOne({ ref: o.parent, status: "COMPLETE" });
    if (!parent) continue;
    const existing = await OrdersModel.findOne({ ref: o.ref });
    if (existing) {
      if (existing.status === "OPEN" && o.status !== "OPEN") {
        existing.status = o.status; // CANCELLED (OCO sibling filled / position closed); COMPLETE arrives via /newOrder
        await existing.save();
      }
      continue;
    }
    if (o.status !== "OPEN") continue;
    await new OrdersModel({
      ref: o.ref, name: o.name, qty: o.qty, price: o.price, trigger: o.price, mode: "SELL",
      kind: o.kind, status: "OPEN", source: "meridian", note: o.kind, createdAt: new Date(),
    }).save();
  }
  res.send("ok");
});

app.listen(PORT, () => {
  console.log("App started!");
  mongoose.connect(uri);
  console.log("DB started!");
});
