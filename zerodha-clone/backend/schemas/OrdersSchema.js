const { Schema } = require("mongoose");

const OrdersSchema = new Schema({
  ref: { type: String, index: true },
  name: String,
  qty: Number,
  price: Number,
  trigger: Number,
  mode: String,
  kind: String,
  status: { type: String, default: "COMPLETE" },
  source: String,
  note: String,
  pnl: Number,
  createdAt: { type: Date, default: Date.now },
  completedAt: Date,
});

module.exports = { OrdersSchema };
