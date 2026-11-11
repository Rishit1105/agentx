# Zerodha clone, wired to Meridian

Based on [apna-college/Zerodha](https://github.com/apna-college/Zerodha), extended so the Meridian paper-trading agent can
drive it. Local only: Meridian's mirror refuses any non-loopback address.

Run (Mongo must be running locally):

    cd backend   && cp .env.example .env && npm install && node index.js      # :3002
    cd dashboard && npm install && PORT=3001 npm start                        # :3001

What was added: `POST /intent` (the dashboard performs the order with the animated Meridian cursor, server fallback after 12 s),
`POST /meridianSync` (account, prices, pending stop/target orders), `GET /account`, `GET /prices`, `GET /allOrders`,
live Orders / Positions / Funds / Summary / Watchlist, and `src/components/AgentLayer.js` (order window, cursor, closed-trade card).
Set `ZERODHA_CLONE_URL=http://localhost:3002` in Meridian's `.env`.
