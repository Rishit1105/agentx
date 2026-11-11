Generate the India (NSE) edition of day-trader-skill from the pinned upstream copy.

The upstream repository (MIT) is never modified; this script writes vendor/day-trader-skill-in/ with a fixed,
reviewable set of patches. Every patch is an exact replacement that must match (the script fails loudly if
upstream changes), so the edition is reproducible:

  * time        New York (EDT/EST)  -> India Standard Time (UTC+5:30, no daylight saving)
  * calendar    NYSE hours/holidays -> NSE equities 09:15-15:30 IST, NSE's official holiday list (no early closes)
  * symbols     US tickers          -> NSE symbols (RELIANCE, M&M, BAJAJ-AUTO), Yahoo '<SYM>.NS', URL-encoded
  * session     78 bars to 16:00    -> 75 five-minute bars to 15:30
  * defaults    09:45/15:30/15:55   -> entries 09:30-15:00 IST, flat by 15:15 (before broker MIS square-off)
  * money       $                   -> ₹ in every message (config keys keep their upstream names: values are INR)
  * universe    Nasdaq Trader lists -> NSE EQUITY_L.csv (series EQ)
  * news        Yahoo US + SEC 8-K  -> Yahoo Finance India headlines (SEC filings do not apply to NSE issuers)
  * analyst     SEC XBRL            -> Yahoo quarterly fundamentals in INR (same output schema)
  * pelosi      US House PTRs       -> NSE bulk & block deals tracker (trader-deals)
  * broker      Alpaca wording      -> NSE paper account wording
Sizing, the risk gate, the Time Machine, entry and exit rules are untouched.

Generated 2026-11-11T18:47:04 from day-trader-skill. Upstream licence (MIT) retained in LICENSE.
