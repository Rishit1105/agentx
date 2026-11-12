// Captures screenshots of the running desk for decks and docs.
// Needs the core on :8000 and the web app on :3000.  Run:  node scripts/capture-screens.mjs [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const WEB = process.env.WEB_URL || "http://localhost:3000";
const CORE = process.env.CORE_URL || "http://localhost:8000";
const OUT = path.resolve(process.argv[2] || "screens");
const post = (p, body) => fetch(CORE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })
  .then((r) => r.json());
const say = (text) => post("/api/chat", { text });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  // a session with a closed trade (for Review), a tilt block, and a fresh ticket waiting (for the Deck)
  await post("/api/replay/start", { date: "2026-11-11", start: "09:40", speed: 20, paused: true });
  await say("scan for breakouts");
  await say("plan a trade on zomato");
  await say("I'm calm, confidence 4");
  await say("yes, buy 482 ETERNAL");
  await post("/api/replay/control", { jump: "12:30" });
  await wait(3000);
  await say("plan a trade on zomato");                  // revenge re-entry -> tilt guard
  await post("/api/replay/control", { jump: "12:50" });
  await wait(1500);
  await say("scan for breakouts");
  await say("plan a trade on suntv");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, colorScheme: "light" });
  const page = await ctx.newPage();
  const shot = async (route, name, before) => {
    await page.goto(WEB + route, { waitUntil: "networkidle" });
    await wait(2200);
    if (before) await before();
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log("captured", name);
  };
  await shot("/deck", "deck");
  await shot("/markets", "markets");
  await shot("/studio?symbol=ETERNAL", "studio");
  await shot("/options", "options", async () => { await page.selectOption("select >> nth=1", "iron_condor"); await wait(1500); });
  await shot("/lab", "lab", async () => {
    await page.getByRole("button", { name: /opening range breakout of the first 30 minutes/i }).click();
    await page.waitForSelector("text=Rule as tested", { timeout: 60000 });
    await wait(1500);
  });
  await shot("/review", "review");
  await shot("/automations", "automations");
  await shot("/guardrails", "guardrails", async () => { await page.mouse.wheel(0, 900); await wait(1200); });
  await shot("/", "landing");
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
