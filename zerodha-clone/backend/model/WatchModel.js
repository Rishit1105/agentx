const { model, Schema } = require("mongoose");

// Stocks added to the Kite watchlist (e.g. from Meridian's "Add <stock>" button).
const WatchModel = new model("watchitem", new Schema({ name: { type: String, unique: true }, addedAt: { type: Date, default: Date.now } }));

module.exports = { WatchModel };
