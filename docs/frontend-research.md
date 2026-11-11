# MERIDIAN frontend research: from "AI dashboard" to "trading instrument"

Scope: the desk pages in `web/app/{deck,studio,backtest,portfolio,ledger,automations,guardrails}` plus `web/components/*`.
Constraint: only libraries already installed: `motion` 12, `three` 0.180, `lucide-react`, Tailwind v4, SVG/canvas
(`lightweight-charts` 5 is also installed and already powers `CandleChart` / `EquityChart`).
Researched November 2026. Sources are listed at the end.

---

## Landing page videos

Each video was verified on 12 Nov 2026 in two ways:
- the oEmbed endpoint (`https://www.youtube.com/oembed?url=<watch-url>&format=json`) returned **HTTP 200** with the title and channel shown below;
- the watch page reported `playabilityStatus: OK` and `playableInEmbed: true`.

No video was downloaded. Lengths and dates come from the watch-page metadata.

### Primary picks (5)

**1. "The creation of NSE 50 and how it came to be called NIFTY."**
- Channel: **NSE India** (official)
- ID: `1hm8veTIlIE`, https://www.youtube.com/watch?v=1hm8veTIlIE
- Length: 1:35 (Nov 2024)
- Why: an official NSE origin story of the exact benchmark that Backtest Lab plots against ("vs NIFTY 50"), so it gives instant credibility.
- Section: **How it works / "Built on NSE"** band, or beside the Backtest preview.

**2. "SEBI Study: 70% of Intraday Traders In Cash Mkt Faced Losses in FY23; Young Traders Hit Hardest"**
- Channel: **CNBC-TV18**
- ID: `-TcJR_ZRmZc`, https://www.youtube.com/watch?v=-TcJR_ZRmZc
- Length: 2:12 (Jul 2024)
- Why: reputable news coverage of the SEBI intraday study that the app's disclaimer already cites. It is short enough to watch in full.
- Section: **Problem statement, "why traders lose"**.

**3. "SEBI Proposes Algorithmic Trading For Retail Investors: Move More Of A Guard Rail, Say Experts"**
- Channel: **CNBC-TV18**
- ID: `j_OHE_TtCu4`, https://www.youtube.com/watch?v=j_OHE_TtCu4
- Length: 8:12 (Dec 2024)
- Why: retail algo trading framed as *guard rails*, which is literally MERIDIAN's pitch (agents plus fail-closed limits).
- Section: **AI/algo "why now"**, or the **Safety / Guardrails** band.

**4. "How to place a Stop Loss order on Kite?"**
- Channel: **Zerodha** (official)
- ID: `eXMrEMdQWrQ`, https://www.youtube.com/watch?v=eXMrEMdQWrQ
- Length: 4:17 (Dec 2016, older but official)
- Why: shows the manual stop-loss workflow that MERIDIAN automates ("stop required" on every ticket). It also ties in the Kite split-view.
- Section: **Safety / risk**, as the "the old way" side of a before/after comparison.

**5. "How to use Kite's Notes feature for better investing and trading decisions"**
- Channel: **Zerodha** (official)
- ID: `iYQy7tyHxWc`, https://www.youtube.com/watch?v=iYQy7tyHxWc
- Length: 0:51 (May 2025)
- Why: Zerodha itself pitching a trading journal to record rationale. MERIDIAN's Ledger writes that journal automatically, with evidence.
- Section: **Ledger / Discipline Scorecard** band.

### Alternates (also verified)

- **"NSE: Enabling A Billion Dreams"**
  - Channel: HISTORY TV18 (NSE's 30-year documentary trailer)
  - ID: `MSJjvWZrQSs`, https://www.youtube.com/watch?v=MSJjvWZrQSs
  - Length: 0:30 (Nov 2024)
  - Use: a muted, looping **hero ambience** clip.
- **"Why did 93% of F&O traders lose money?"**
  - Channel: Business Standard
  - ID: `5l_aOZgvEwA`, https://www.youtube.com/watch?v=5l_aOZgvEwA
  - Length: 6:08 (Sep 2024)
  - Use: a deeper "why traders lose" explainer covering the F&O study.

### Rejected

- `gmWNqmSy6-U`, "Single Biggest Trading Mistake ft. Karthik Rangappa": oEmbed returns 403 and the page reports LOGIN_REQUIRED.
- `s65W2j4ew9w`, "Inside India's Largest Stock Exchange": 26 min, posted on a personal channel.
- `FmimFlYh9Ts`, HISTORY TV18 "30 Years of NSE": 46 min.

### Embed notes

- Use a **lite facade**: render `https://i.ytimg.com/vi/<ID>/hqdefault.jpg` with a play button, and swap in the iframe on click. This avoids about 500KB of player JS per video at first paint.
- Iframe: `https://www.youtube-nocookie.com/embed/<ID>?rel=0&playsinline=1`, plus `loading="lazy"`, `title=` the video title, and `allow="accelerometer; encrypted-media; picture-in-picture"`, inside an `aspect-video` wrapper.
- Caption the SEBI clip with the newer figure as well. SEBI's FY26 study found about 88% of individual F&O traders lost money (coverage: NDTV Profit `5bacTnoje1k`, Aug 2026, also verified 200).

---

## 0. Where the UI stands today (audit)

What already works and should be kept:
- **Colour carries meaning.** `globals.css` reserves cyan for the Conductor, violet for agents, mint/coral for P&L and amber for risk. That rule is the strongest design decision in the codebase.
- **Real instruments rather than generic cards:** the Orrery, the Orb, the RiskReservoir tank, the PriceLadder, the Sundial, the Time Machine fan and the HaltLever. These are the differentiators, so build around them.
- `motion` is already used well in places: `layoutId="modepill"` and `layoutId="railmark"` in `Shell.tsx`, and the `pathLength`-style ring in `Scorecard.tsx`.

What makes it read as generic or AI-made:
1. **Glass everywhere.** Every `.panel` has `backdrop-filter: blur(12px)` plus a cyan gradient light edge (`.panel::before`). Glassmorphism on every surface is the most commonly cited AI-UI tell, and on a near-opaque panel the blur does nothing visible while still costing GPU time.
2. **Neon glow as decoration:** `shadow-[0_0_12px_#38e1ff]`, `0_0_24px` on the mic button, a gradient-plus-glow `.btn-primary`, `animate-ping` rings and pulsing `.live-dot`s in five or more places. When everything glows, nothing stands out.
3. **Templated "big number + small label" tile grids.** Portfolio has 8 identical `Stat` tiles and Backtest has 6 `Tile`s. This is the "hero metric layout" that anti-slop catalogues single out.
4. **The HUD letter-spacing tic.** `.label` uses `0.18em` uppercase tracking, and `0.32em` is used on the wordmark. Combined with the grid-plus-radial-glow `body::before`, it reads as a sci-fi template.
5. **Bars animate `width`/`height`** (OddsBars, RHist, Scorecard, breaker bars), which forces layout work. `RiskReservoir` calls `setState` on every `requestAnimationFrame`, so React re-renders at 60fps. `Orrery` re-renders 72 tick lines every 200ms.

What the best references do instead:
- **Linear's 2026 refresh** dimmed the navigation chrome "a few notches" so content wins. It also softened separator contrast, removed purposeless borders and reduced icon use.
- **Stripe's dashboard** earns trust through clarity: headline metrics with small sparklines underneath, and tabular figures for numbers.
- **Kite** is deliberately minimal: a focused order window and a predictable, linear workflow.
- **Bloomberg** treats its palette as part of its identity and ships colour-vision-deficiency (CVD) colour schemes.

Takeaway: **density, hierarchy and data motion beat decoration.**

---

## 1. Signature components (12)

Each entry covers what it is, why it's distinctive, which screen it belongs on, and an implementation sketch.
None are generic effects for their own sake: every one encodes data or state.

### 1.1 `RollingNumber`: odometer digits for money (Deck, TopBar, Portfolio, Backtest)
- **What:** each digit is a vertical 0–9 strip that rolls to its new value. The direction follows the sign of the change: up when the value increases, down when it decreases (the NumberFlow/Family-app pattern). A 600ms mint or coral tint fades out behind the changed digits.
- **Why:** P&L that physically ticks is the single most "alive" trading cue. Motion's own `AnimateNumber` is paid (Motion+), so a custom version is also a craft signal.
- **Sketch:** `components/RollingNumber.tsx`
  ```tsx
  // split fmt.inr(value) into chars; key digit columns by index-from-right so "," and "₹" never shift
  <span className="num-roll" aria-label={formatted}>{chars.map((ch, i) => /\d/.test(ch)
    ? <span key={len - i} className="inline-block h-[1em] overflow-hidden leading-none" aria-hidden>
        <motion.span className="flex flex-col" animate={{ y: `-${+ch * 10}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.8 }}>
          {"0123456789".split("").map(d => <span key={d} className="h-[1em]">{d}</span>)}
        </motion.span></span>
    : <span key={`s${len - i}`} aria-hidden>{ch}</span>)}</span>
  ```
  - Requires `font-variant-numeric: tabular-nums`.
  - Wrap groups in a parent `motion.span layout` so width changes (for example ₹9,999 → ₹10,000) glide instead of jumping.
  - Throttle to at most 4 updates per second. Under reduced motion, render plain text.
- **Use on:** TopBar equity and day P&L (`Shell.tsx`), the Deck "Paper balance" figure, the RiskReservoir `%`, the Portfolio hero figure, and the Backtest readout.

### 1.2 Tick-flash cells (Portfolio holdings, PriceLadder, Studio)
- **What:** when an LTP or P&L cell changes, its background flashes `--mint-dim` or `--coral-dim` and decays over 700ms. A ▲/▼ glyph appears for one tick.
- **Why:** this is the Bloomberg and Kite market-watch convention. Judges who trade recognise it instantly. It also communicates freshness without a "LIVE" badge.
- **Sketch:** a `useFlash(value)` hook stores the previous value in a ref and returns `"up" | "down" | null` for 700ms. The cell uses `motion.td key={value}` with `initial={{ backgroundColor: "rgba(63,214,155,.18)" }} animate={{ backgroundColor: "rgba(0,0,0,0)" }}`. A cheaper alternative is a CSS `@keyframes flash-up` re-triggered with `data-flash`.

### 1.3 Live tape strip (global, below the TopBar in `Shell.tsx`)
- **What:** a 28px band showing a continuous tape of NIFTY 50, held and watched symbols, and agent events, for example `RELIANCE 2,941.10 ▲0.42%` · `SENTINEL breaker armed` · `ETERNAL ORB fired 09:31`. It pauses on hover, and clicking a symbol routes to `/studio?symbol=`.
- **Why:** mixing market data with *agent* events is unique to MERIDIAN. It shows the 16 agents working on every screen, not only the Deck.
- **Sketch:**
  - Render the item list twice inside `div.tape` and animate with `@keyframes tape { to { transform: translateX(-50%) } }`, `animation: tape 60s linear infinite`.
  - Add `.tape:hover { animation-play-state: paused }`.
  - Fade the edges with `mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)`.
  - Data comes from `st.positions`, `st.watch` and the last 20 of `eventsLog`.
  - Under reduced motion it becomes a static `overflow-x:auto` row. Use `aria-hidden` on the duplicate copy and `role="marquee"` with `aria-live="off"`.

### 1.4 Conductor transcript with an intent parse (Deck: `CaptionRibbon` and `CommandBar`)
- **What:** a Raycast-style command log.
  - While you speak, the partial transcript streams in word by word, each word going from `opacity:0, filter:blur(4px)` to clear in 120ms.
  - On final, the parsed intent snaps under it as a token chain: `PLAN` › `RELIANCE` › `qty 10` › `ORB` › `paper`. Each token is a 22px mono chip and enters with `layout` plus a 30ms stagger.
  - The chain then hands off to the Pipeline chips. One `layoutId={"tok-"+symbol}` morphs the symbol token into the pipeline's `pipe.symbol` label.
- **Why:** it *shows the model understood you*, and a voice product's trust moment is the parse. Generic chat bubbles never show this.
- **Sketch:** this extends the existing `c.intent` chip. Split it into tokens on the server or client and wrap them in `<LayoutGroup>`. Use `aria-live="polite"` on the final line only, never on partials.

### 1.5 Ticket → Position shared-element hand-off plus "confirm focus" (Deck, Studio)
- **What:**
  - While `voice === "awaiting_confirm"`, everything except the TicketCard and the Orb dims to `opacity .38; filter: saturate(.6)` over 240ms.
  - The ticket rises 2px and gets the only accent ring on the screen.
  - On approve, the ticket card morphs into the "Open position" PriceLadder panel through `layoutId={"pos-"+symbol}`. Its entry, stop and target numbers fly into their ladder rows.
- **Why:** it makes "nothing happens without your yes" visible. It is one memorable hero transition rather than ten small ones.
- **Sketch:**
  - Set `data-focus="ticket"` on `<main>` from the store.
  - CSS: `[data-focus=ticket] .panel:not([data-keep]) { opacity:.38; filter:saturate(.6); transition: opacity 240ms var(--ease-out), filter 240ms }`.
  - Use `motion.section layoutId` on both TicketCard and the position panel, wrapped in `AnimatePresence mode="popLayout"`.
  - Style the ticket as a receipt: hairline perforation via `background: radial-gradient(circle at 6px 0, transparent 5px, var(--panel) 5.5px) 0 0/12px 12px repeat-x`, with a mono fingerprint.

### 1.6 Lifecycle rail with a travelling signal (Studio `Stepper`, Deck `Pipeline`)
- **What:**
  - Replace the per-step spinners with one 2px track joining the step nodes.
  - A filled segment advances (`scaleX`, `transform-origin:left`, 320ms) as each step completes.
  - A 6px "signal" dot rides the head of the fill.
  - Completed nodes draw their check with `motion.path pathLength 0→1` (180ms).
  - A blocked step turns the track coral from that node onward.
- **Why:** the lifecycle (scan → plan → test → size → gate → confirm) is MERIDIAN's story, so it reads like a circuit, not a list of loaders.
- **Sketch:** `progress = doneCount/(n-1)` drives `<motion.div style={{scaleX: progress}} />`. Put `layoutId="step-head"` on the running node's ring so it glides between nodes.

### 1.7 Cursor spotlight hairline, used sparingly (Studio ranked strategies, Automations templates, Guardrails layers)
- **What:** a 1px border that brightens only near the pointer (240px radius), with no fill glow.
- **Why:** this is the Magic UI "magic card" or Aceternity "card spotlight" idea, but restrained to a border on *selectable* cards only, so it signals affordance rather than decoration.
- **Sketch:**
  ```css
  .spot { position:relative } .spot::after { content:""; position:absolute; inset:0; border-radius:inherit; padding:1px;
    background: radial-gradient(240px circle at var(--mx) var(--my), rgba(255,255,255,.22), transparent 60%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
    mask-composite: exclude; opacity:0; transition: opacity 200ms } .spot:hover::after { opacity:1 }
  ```
  - A single delegated `pointermove` listener on the page root sets `--mx`/`--my` on `e.target.closest(".spot")`.
  - Skip it on touch: `@media (hover:hover)`.

### 1.8 Squarified sector treemap (Portfolio, replacing the Allocation bar list)
- **What:** an SVG treemap. Tile area is weight %, grouped by sector. Fill uses a diverging scale on `unrealized_pct`, clamped to ±3% and mapped to `color-mix(in oklab, var(--mint) x%, var(--panel-2))` (or coral). Cash is a hatched neutral tile (`pattern` of 45° hairlines). Labels show the symbol, the % and a RollingNumber P&L. Small tiles keep the label hidden until hover.
- **Why:** this is the TradingView/Finviz heatmap idiom, and it shows concentration risk at a glance. It is far more professional than progress bars.
- **Sketch:**
  - Implement the squarify algorithm (Bruls et al.) in about 40 lines in `components/Treemap.tsx`.
  - Tiles are `motion.rect`/`motion.g` with `layout` and `transition={{type:"spring",stiffness:300,damping:34}}`, so rebalancing animates.
  - Use 2px gaps (inset each rect by 1px) and `rx=3`.
  - Hovering a tile highlights its holdings row (shared hover state).

### 1.9 Inline sparklines in table rows (Portfolio holdings, Backtest tournament, Automations price rules)
- **What:** a 72×20 SVG line of the day's 5-minute closes. The stroke is mint or coral by sign, the area fill is at 10% opacity, there is a 2px dot on the last point, and a dashed hairline marks the avg price or entry.
- **Why:** Stripe-style "trend beneath the number". It adds context without adding columns.
- **Sketch:**
  - `components/Sparkline.tsx` takes `points: number[]` and builds the path with `M x,y L…`.
  - Use `vector-effect="non-scaling-stroke"` with strokeWidth 1.25.
  - Data: `/api/bars/{symbol}` already exists for `CandleChart`. Batch-fetch per holding and memoise.
  - Draw it in once with `pathLength 0→1` over 500ms on first mount only.

### 1.10 Equity curve "scrub readout" (Backtest `EquityChart`)
- **What:**
  - Hovering the chart updates a header strip: date, Meridian ₹, Buy & hold ₹, NIFTY ₹, and the *gap* between Meridian and the benchmark as a signed RollingNumber.
  - Sync the crosshair between the equity chart and the underwater chart.
  - On load, the strategy line "draws" left to right.
- **Why:** it turns a static chart into an argument ("we beat buy-and-hold by X on this date"). Judges scrub charts.
- **Sketch:**
  - Use `c1.subscribeCrosshairMove(p => setHover(p.time))` and `c2.setCrosshairPosition(value, time, series)` for the sync.
  - Lift `hover` state via a callback prop.
  - For the reveal, either animate a `clip-path: inset(0 100% 0 0)` → `inset(0 0 0 0)` on the chart container over 900ms `var(--ease-out)` (composited), or feed the series data in chunks (avoid).

### 1.11 Hash-chain verify cascade (Guardrails audit log)
- **What:**
  - Pressing "Verify chain" walks the rows top-down. Each row's fingerprint chip turns from faint to mint in sequence (12ms stagger, capped at 40 rows, so about 0.5s total).
  - A 1px vertical "chain" line on the left fills (`scaleY`) as it goes.
  - It ends on a mono `HEAD a3f9…` with a copy button.
  - If verification fails, the cascade stops at the broken row, which shakes 4px twice and goes coral.
- **Why:** tamper-evidence becomes *visible proof*. This is the trust moment for a "can't argue with the limits" page.
- **Sketch:** `motion.div variants` with `staggerChildren: 0.012` on the list, and `animate` keyed on `verify` state. The shake is `x: [0,-4,4,-4,4,0]` over 300ms (transform only).

### 1.12 Rule circuit with fire pulse (Automations)
- **What:**
  - Each rule card shows the `WHEN` chip, then an SVG connector, then the `DO` chip.
  - When the rule fires (its `fires` count increments via WebSocket), a 10px light segment travels along the connector, using `stroke-dasharray: 10 200` with `stroke-dashoffset` animated over 600ms.
  - The fire counter then rolls (1.1).
- **Why:** automations stop being forms and become visible machinery. Pair it with a "mad-libs" sentence builder (see §2).
- **Sketch:** the existing `ArrowRight` becomes a 48×12 SVG path. Use `useEffect` on `r.fires` to replay `animate(pathRef, { strokeDashoffset: [210, 0] })` with `motion`'s `useAnimate`.

---

## 2. Per-screen recommendations

### /deck (Command Deck)
- Keep the Orb and Orrery as the hero. Add only 1.4 (transcript parse) and 1.5 (confirm focus plus ticket hand-off).
- Replace the "Paper balance" panel with a **composed strip**:
  - a large equity RollingNumber
  - a 160×28 intraday equity sparkline
  - Day / Cash / DD as a single row with hairline dividers (`divide-x divide-[var(--hair)]`), not three spans
- RiskReservoir:
  - Draw the wave path once at 2× width and animate `translateX` with CSS, which removes the per-frame `setState`.
  - Set the liquid level with `transform: translateY()`.
  - Add a dashed amber marker at 80% labelled "breaker".
- Orrery: when an agent fires, show its name for 1.2s as a small mono label orbiting with the node (opacity only).

### /studio (Trade Studio)
- 1.6 lifecycle rail in place of `Stepper`.
- Turn the `CandleChart` levels into labelled right-edge price tags (entry cyan, stop coral, target mint). Draw the risk zone (entry→stop) at 6% coral and the reward zone at 6% mint between the lines, as TradingView's long-position tool does.
- **Time Machine fan:** reveal the bands left to right with a `clip-path` inset animation (700ms), then draw the median.
- Replace OddsBars with a single **stacked 100% bar** (target | open | stop) using `scaleX` segments, with the percentages above each segment. One bar is easier to read than three.
- Sizing ledger: make the binding constraint visually win. Rows show bars of shares-allowed, the shortest (binding) bar is solid cyan and the others are hairline outlines. The "BINDS" tag animates in with `layoutId`.

### /backtest (Backtest Lab)
- Replace the 6 Tiles with a **comparison table strip**: columns are Meridian | Buy & hold | NIFTY 50, rows are Return, Sharpe, MaxDD and Win%. The winner cell in each row gets a 2px left mint rule and the losing cells use `--ink-2`. This is denser and more honest than tiles.
- Use 1.10 for the scrub readout.
- The R-histogram bars use `scaleY` (`transform-origin: bottom`) with a 25ms stagger. Add a dashed vertical line at 0R and a line at the expectancy value.
- Verdict banner: show an "edge gate" checklist of three checks that tick in sequence (≥N trades, +expectancy after costs, beats B&H drawdown-adjusted). This reuses the 1.11 cascade.
- The trades table gets `content-visibility: auto` on rows and a sticky header with a hairline bottom border.

### /portfolio
- Use a **hero strip**: total value as a RollingNumber, total return % with ▲/▼, and a mini equity sparkline. Show the 7 other stats as one dense, hairline-divided row of label/value pairs at 13px.
- Holdings table: add 1.2 tick flash on LTP and P&L and a 1.9 sparkline column.
- Show the weight column as a 40px inline bar plus a number, and the stop/target column as a tiny 3-tick range bar showing where LTP sits between stop and target (a mini PriceLadder).
- Use 1.8 treemap for allocation.
- Recent fills: a vertical "tape" list, with new fills entering from the top via `AnimatePresence` + `layout` (staggered list reorder).

### /ledger (Stories + Discipline Scorecard)
- Story timeline rail: a scroll-linked progress line on the `ol`'s left border (`useScroll({ container: listRef })` → `scaleY`). The selected story's node grows to 13px via `layoutId="story-dot"`.
- StoryView: animate the content swap with `AnimatePresence mode="wait"`, using a 140ms exit (`opacity 0, y -4`) and a 220ms enter.
- The four sections Why / Checked / If wrong / Outcome become a 2×2 grid of hairline-separated quadrants inside one surface, instead of four bordered boxes.
- Evidence chips show `sha256` prefixes in mono. Clicking one opens the JSON in a right **sheet** (slide from the right, 280ms) instead of a centred modal, so the story stays visible.
- Scorecard: keep the ring. Count the score up with a RollingNumber, and use `scaleX` instead of `width` for the pillar bars.

### /automations
- Turn the builder into a **sentence**: "When [price ▾] of [RELIANCE] crosses [above ▾] [1,500] → [watch ▾], cool-down [0] min". Inline underlined selects use a dotted underline and are 32px tall. It reads like the voice command it mirrors.
- Rule cards use 1.12 circuit and pulse. The enabled toggle is a 28×16 switch with `layout` knob movement.
- Run history: a horizontal "fire strip" of the last 30 runs as 4×14 bars (mint ok / amber skip / coral error), like a CI history strip.

### /guardrails
- Limits grid: each limit shows **usage against the limit** as a 2px meter under the value (for example "Trades per day 1 / 3"). Edit-in-place keeps the "tighten only" rule. If someone tries to loosen a limit, the input shakes and shows "tighten only" in amber.
- Five defence layers: render them as a **stacked horizontal pipeline**, L0 → L4 left to right, with a connector between layers. A tripped layer cuts the connector (coral gap).
- Use 1.11 for the verify cascade.
- Kill switch: keep the HaltLever, with a pure CSS conic-gradient progress ring while holding. When halted, the frame flash is fine, but run it at most 3 times and then hold steady (an infinite pulse is fatiguing).

---

## 3. Page scroll and entrance choreography

The desk pages scroll inside `<main className="scroll">` in `Shell.tsx`, not the window. Everything below accounts for that.

**3.1 Route entrance.** Add `app/template.tsx`, which remounts on navigation, wrapping each page in
`motion.div initial={{opacity:0, y:6}} animate={{opacity:1, y:0}} transition={{duration:.24, ease:[0.22,1,0.36,1]}}`.
Skip it on `/` by checking `usePathname()`, because the landing page has its own choreography. Avoid exit animations: they delay route changes.

**3.2 Panel stagger on first paint.** Wrap the top-level grid children in a `Stagger` component:
`variants={{show:{transition:{staggerChildren:0.04, delayChildren:0.06}}}}` with children `hidden:{opacity:0,y:8}` and `show:{opacity:1,y:0,transition:{duration:.32,ease:[0.22,1,0.36,1]}}`.
- **Cap the stagger at 8 children** (about 0.38s total), so items past the 8th get no extra delay.
- Order the stagger by reading importance, not DOM order. On the Deck: the Orb first, then the risk panel, then the rest.

**3.3 Below-the-fold reveals inside `main`.** Two options:
- **CSS (preferred, zero JS).** Scroll-driven animations are now Baseline (Chrome, Safari 26 and Firefox 159). `view()` automatically uses the nearest scroll container, which is `main.scroll`, so no refs are needed.
  ```css
  @supports (animation-timeline: view()) { @media (prefers-reduced-motion: no-preference) {
    .reveal { animation: reveal linear both; animation-timeline: view(); animation-range: entry 0% entry 40%; } } }
  @keyframes reveal { from { opacity:0; transform: translateY(12px) } to { opacity:1; transform:none } }
  ```
  Content stays visible where unsupported.
- **Motion fallback.** Expose `main`'s ref through a `ScrollRootContext` in `Shell.tsx` and use `whileInView` with `viewport={{ root: mainRef, once: true, amount: 0.2 }}`. `useScroll({ container: mainRef })` handles scroll-linked effects such as the Ledger rail.

**3.4 Timing tokens.** Add these to `:root`:

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | entrances, reveals |
| `--ease-in-out` | `cubic-bezier(0.65,0,0.35,1)` | morphs, shared layout |
| `--ease-in` | `cubic-bezier(0.4,0,1,1)` | exits only |
| `--dur-1` | 120ms | hover, press, colour |
| `--dur-2` | 200ms | tooltips, chips, exits |
| `--dur-3` | 320ms | entrances, sheets |
| `--dur-4` | 600ms | number roll, data draw-in |
| spring (layout) | `{stiffness:420, damping:38}` | pills, layoutId moves |
| spring (digits) | `{stiffness:260, damping:30, mass:.8}` | RollingNumber |

Rules:
- Exits run at about 60% of enter duration.
- Translate distances are 6–12px (never 20+), with no scale-in on panels.
- Data animations never loop: they animate when the value changes and then rest.

**3.5 Reduced motion.**
- Wrap `Desk` in `<MotionConfig reducedMotion="user">`. Motion then drops transform and layout animation but keeps opacity.
- Keep the existing global CSS kill-switch.
- `RollingNumber` renders static text. The tape becomes a scroll row. The `RiskReservoir` wave stops: read `matchMedia`, as `Orb.tsx` already does.
- The confirm-focus dimming stays, because it is state, not motion, but goes instant.

---

## 4. Refined colour, type and spacing spec ("slightly brighter, premium")

Direction: lift the canvas one step, make panels **solid** (no blur), separate surfaces with **elevation plus hairline** instead of glow, and take accents slightly off pure neon so they read as ink, not LEDs.
Contrast values below are WCAG ratios, measured against `--panel` `#18202d`.

```css
:root {
  /* surfaces: lifted one step from #0e131b, cool slate kept for identity */
  --canvas: #11161f;  --canvas-2: #141a24;
  --panel: #18202d;   --panel-2: #1d2635;  --panel-3: #243042;   /* raised / hover / selected */
  --inset: #0f141c;                                               /* wells: tank, inputs, code */
  --hair: rgba(255,255,255,0.07);  --hair-2: rgba(255,255,255,0.12);  --hair-3: rgba(255,255,255,0.20);
  /* text */
  --ink: #f5f7fa;     /* 15.3:1 */  --ink-2: #cfd7e2; /* 11.3:1 */
  --muted: #9ba8b9;   /* 6.8:1 */   --faint: #808da1; /* 4.9:1, was #627084 at 3.4:1 (fails AA) */
  /* accents: same hues, slightly de-neoned */
  --cyan: #5cd6f7;  --violet: #a294ff;  --mint: #3fd69b;  --coral: #ff6f7d;  --amber: #f6b552;
  --cyan-wash: rgba(92,214,247,.10); --mint-wash: rgba(63,214,155,.10); --coral-wash: rgba(255,111,125,.10); --amber-wash: rgba(246,181,82,.10);
  /* radii */
  --r-panel: 12px; --r-card: 8px; --r-control: 8px; --r-chip: 6px; --r-pill: 999px;
  /* elevation (no coloured glows) */
  --e1: inset 0 1px 0 rgba(255,255,255,.04), 0 0 0 1px var(--hair), 0 1px 2px rgba(0,0,0,.35);
  --e2: inset 0 1px 0 rgba(255,255,255,.05), 0 0 0 1px var(--hair-2), 0 8px 24px -12px rgba(0,0,0,.6);
  --e-focus: 0 0 0 1px color-mix(in srgb, var(--cyan) 55%, transparent), 0 0 0 4px var(--cyan-wash);
}
```

Contrast notes:
- All accents score 6.1:1 or higher on `--panel`. Coral is the lowest at 6.1:1, versus 5.65 today.
- Dark text on the accent fills passes easily: `#04121a` on cyan is 11.2:1 and `#03140c` on mint is 10.2:1.
- Accent colour on its own `-wash` background also passes.

**Surfaces.**
- `.panel { background: var(--panel); border-radius: var(--r-panel); box-shadow: var(--e1); }`, with no border, no `::before` and no blur.
- Hover or selected panels use `--panel-2` and `--e2`.
- Only overlays (palette, sheets, toasts) get `backdrop-filter: blur(16px) saturate(140%)` over a `rgba(17,22,31,.72)` background.
- Keep a single faint radial "key light" at the top of the canvas and drop the 32px grid.

**Hairlines.**
- Use `--hair` for row separators and dividers, `--hair-2` for control borders, and `--hair-3` for hover.
- Table rows separate with `border-top: 1px solid var(--hair)`, with no zebra striping.
- Separate numbers in a strip with `divide-x` hairlines and 16px padding.

**Type scale** (px / line-height / weight):

| Role | Font | Size / LH | Weight | Tracking | Notes |
|---|---|---|---|---|---|
| Page title | Space Grotesk | 28/32 | 600 | −0.02em | e.g. "Limits the model cannot argue with" |
| Section title | Space Grotesk | 16/22 | 600 | −0.01em | sentence case, replaces most uppercase labels |
| Body | Inter | 14/21 | 400 | default | small body is 13/19 |
| Meta | Inter | 12/16 | 400 | default | in `--muted` |
| Eyebrow / label | Inter | 11/14 | 500 | 0.06em | uppercase only for table headers and eyebrows (was 10.5px at 0.18em) |
| Hero numerals | Inter | 34 / 26 / 20 | 600 | −0.03em | `font-feature-settings:"tnum","cv11","ss01"`; Inter's tabular, open-digit figures look more premium than mono at large sizes |
| Data numerals | JetBrains Mono | 12.5/18 | 400 | default | tables, timestamps, hashes, fingerprints, tape; `tabular-nums` |

**Spacing.**
- 4px base: 4, 8, 12, 16, 20, 24, 32.
- Panel padding is 16px (20px for hero panels). The gap between panels is 12px; the current 16px makes dense desks feel sparse.
- Control heights are 28 (chip), 32 (compact btn) and 36 (btn). The primary CTA is 40.

**P&L semantics.**
- Always pair colour with a sign and a glyph: `▲ +₹1,240 (+0.42%)` and `▼ −₹310`, using a true minus (U+2212).
- Offer a CVD toggle (`data-cvd` swaps mint/coral to `#4aa8ff` / `#ff9f43`), as Bloomberg does.

**Three things to REMOVE (highest "generic" signal):**
1. **Glass and glow chrome:** `backdrop-filter` on `.panel`, the cyan `.panel::before` light edge, every `shadow-[0_0_Npx_#38e1ff]`, the gradient fills on `.btn-primary`/`.btn-mint` (make them flat `--cyan`/`--mint` with dark text), and `animate-ping` rings.
2. **The ambient sci-fi field and HUD tracking:** the 32px grid and dual radial lights in `body::before`, the 0.18em/0.32em uppercase tracking, and pulsing `.live-dot`s everywhere. Keep **one** live dot, the clock chip in the TopBar.
3. **Identical stat-tile grids:** the 8 `Stat` tiles on Portfolio and 6 `Tile`s on Backtest. Replace them with one composed hero strip or comparison table (see §2).

---

## 5. Accessibility and performance guardrails

**Performance (target a steady 60fps on a 2020 MacBook Air with the Deck open):**
- Animate only `transform`, `opacity`, `clip-path` and `filter` (filter only when short-lived).
  - Convert `width`/`height` animations to `scaleX`/`scaleY` with `transform-origin`.
  - Files affected: `studio/page.tsx` OddsBars, `backtest/page.tsx` RHist, `Scorecard.tsx` pillars, and the breaker meters in `guardrails/page.tsx`.
- **`Instruments.tsx` RiskReservoir:** remove the per-frame `setT`. Draw a 2×-wide wave path once, animate it with a CSS `translateX` loop of 4s, and set the level via `transform`. React then re-renders only when risk data changes.
- **`Orrery.tsx`:**
  - Move the 72 ticks and rings into a `memo`'d static `<svg>` layer.
  - Replace the 200ms `setInterval` with per-pulse `setTimeout` expiry, or a `useRef` set plus a CSS class toggle.
  - Swap the SVG `feGaussianBlur` glow on pulses for a pre-blurred radial gradient circle.
- Pause the `Orb` canvas rAF loop when `document.hidden` or when an `IntersectionObserver` reports the canvas offscreen. Keep DPR capped at 2 (already done).
- `backdrop-filter`: zero on scrolling content, allowed on fixed overlays only.
- Long tables (Backtest trades, the audit log): `content-visibility: auto; contain-intrinsic-size: auto 32px` on rows.
- `will-change: transform` only while a layout animation runs (Motion handles this). Never apply it globally.
- Throttle store-driven re-renders of numbers to 4Hz. Batch WebSocket ticks in `requestAnimationFrame` before `apply()`.
- Budget: at most 3 continuously running animations per screen. On the Deck these are the Orb, the reservoir wave and the tape.

**Accessibility:**
- Text needs ≥4.5:1 (the new `--faint` fixes the 3.36:1 failure) and UI boundaries need ≥3:1. `--hair` is decorative only, so never use it as the sole boundary of an input; inputs use `--hair-2` plus `--inset` fill.
- Never use colour alone for gain, loss or status. Add a sign, a ▲/▼ glyph and text labels (PASS/BLOCK), plus the CVD toggle.
- RollingNumber: give the wrapper `aria-label` and `aria-hidden` digits. Use one `aria-live="polite"` region per screen for P&L, debounced to 2s. The tape uses `aria-live="off"`.
- Confirm focus: move focus to the ticket's approve button, trap Tab inside the ticket while it is focused, and make Esc decline. The double-Esc kill must still work.
- Hit targets: at least 32px, with chips at 28px plus 4px spacing. Keep `:focus-visible` rings and switch them to `--e-focus`.
- Every infinite animation stops under `prefers-reduced-motion`. The halt flash runs at most 3 cycles.
- Charts: provide a visually hidden table or summary (`aria-describedby`) for the equity curve, the treemap and the fan.

---

## 6. Prioritised build list (judge impact ÷ effort)

| # | Change | Impact | Effort | Files |
|---|---|---|---|---|
| 1 | **Token refresh plus removal of glass and glow** (§4): solid panels, hairlines, new text and accent tokens, label tracking, drop `body::before` grid, flat buttons | ★★★★★ | S (2h) | `app/globals.css`, `components/Shell.tsx` (hard-coded `#111823`, `#38e1ff` glows), grep `shadow-\[0_0_` across `components/*` |
| 2 | **`RollingNumber` plus tick-flash** on equity, day P&L, risk %, holdings LTP/P&L | ★★★★★ | S–M (3h) | new `components/RollingNumber.tsx`, `lib/hooks.ts` (`useFlash`), `Shell.tsx`, `app/deck/page.tsx`, `components/Instruments.tsx`, `app/portfolio/page.tsx` |
| 3 | **Confirm focus plus ticket→position `layoutId` hand-off** on the Deck | ★★★★★ | M (3h) | `app/deck/page.tsx`, `components/Instruments.tsx` (PriceLadder), `Shell.tsx` (`data-focus` on `main`), `globals.css` |
| 4 | **Route entrance plus capped stagger plus scroll-driven `.reveal`**, with a `MotionConfig` reduced-motion wrapper | ★★★★ | S (1.5h) | new `app/template.tsx`, `globals.css`, `Shell.tsx` |
| 5 | **Perf fixes**: reservoir wave via CSS, memo'd Orrery layer, scaleX/scaleY bars | ★★★★ (protects the demo) | S (2h) | `components/Instruments.tsx`, `components/Orrery.tsx`, `components/Scorecard.tsx`, `app/studio/page.tsx`, `app/backtest/page.tsx`, `app/guardrails/page.tsx` |
| 6 | **Live tape** (market plus agent events) under the TopBar | ★★★★ | M (2.5h) | new `components/Tape.tsx`, `Shell.tsx`, `lib/store.ts` (selector for recent events) |
| 7 | **Portfolio rebuild**: hero strip, sector treemap, row sparklines, fills list reorder | ★★★★ | M–L (4h) | `app/portfolio/page.tsx`, new `components/Treemap.tsx`, new `components/Sparkline.tsx` |
| 8 | **Studio lifecycle rail plus stacked odds bar plus risk/reward zones** on candles | ★★★★ | M (3h) | `app/studio/page.tsx`, `app/deck/page.tsx` (Pipeline), `components/CandleChart.tsx`, `components/TimeMachineFan.tsx` |
| 9 | **Backtest comparison table plus crosshair scrub readout** | ★★★ | M (3h) | `app/backtest/page.tsx`, `components/EquityChart.tsx` |
| 10 | **Guardrails hash-chain verify cascade plus limit-usage meters**; Automations circuit pulse | ★★★ | M (3h) | `app/guardrails/page.tsx`, `app/automations/page.tsx` |

Stretch goals: the Conductor intent-parse token chain (1.4, `components/Instruments.tsx`), the Ledger scroll-linked rail and side sheet (`app/ledger/page.tsx`), the Automations sentence builder, and the CVD toggle.

Suggested order for a one-day push: 1 → 5 → 2 → 4 → 3 (the demo moment) → 6 → 8 → 7 → 9 → 10.

---

## Sources
- [Linear: Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh) and the [UI refresh changelog (Mar 2026)](https://linear.app/changelog/2026-03-12-ui-refresh): dimmed navigation, softer separators, fewer icons
- [Motion: AnimateNumber docs](https://motion.dev/docs/react-animate-number) (a Motion+ paid feature) and [number animation](https://motion.dev/number-animation)
- [NumberFlow by Maxwell Barvian (GitHub)](https://github.com/barvian/number-flow): per-digit spin and the `trend` direction concept
- [Motion: scroll animations](https://motion.dev/docs/react-scroll-animations) and [useInView](https://motion.dev/docs/react-use-in-view): `viewport.root` and `useScroll({container})`
- [web.dev: New to the web platform in October 2026](https://web.dev/blog/web-platform-10-2026) and [WebKit: scroll-driven animations guide](https://www.webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/)
- [Magic UI: Magic Card](https://magicui.design/docs/components/magic-card) and [Aceternity UI docs](https://ui.aceternity.com/docs): the spotlight-border and number-ticker patterns
- [Bloomberg: Designing the Terminal for color accessibility](https://www.techatbloomberg.com/blog/designing-the-terminal-for-color-accessibility/) and [Bloomberg UX accessibility](https://www.bloomberg.com/ux/accessibility/)
- [Stripe dashboard design breakdown (925 Studios)](https://www.925studios.co/blog/stripe-dashboard-design-breakdown): trust through clarity, sparklines beneath metrics
- [TradingQnA: Why is Kite built with such a minimal interface?](https://tradingqna.com/t/why-is-kite-built-with-such-a-minimal-interface/6373) and [Kite Terminal Mode](https://zerodha.com/z-connect/business-updates/introducing-kite-terminal-mode)
- [TradingView heatmaps](https://www.tradingview.com/support/solutions/43000766446): size by market cap, colour intensity by move
- [Robinhood Legend announcement](https://robinhood.com/us/en/newsroom/the-legend-awakens)
- AI-UI anti-pattern catalogues: [Why your AI keeps building the same purple gradient website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) and [Impeccable anti-patterns](https://www.mintlify.com/pbakaus/impeccable/concepts/anti-patterns)
