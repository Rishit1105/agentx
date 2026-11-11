// Records a real product walkthrough of Meridian for the landing page.
// Needs the core on :8000 and the web app on :3000.  Run:  node scripts/record-demo.mjs
// Output: public/media/meridian-demo.webm (1280x800, ~45 s)
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const WEB = process.env.WEB_URL || "http://localhost:3000";
const CORE = process.env.CORE_URL || "http://localhost:8000";
const OUT_DIR = path.resolve("public/media");
const TMP = path.resolve(".record-tmp");

const post = (p, body) => fetch(CORE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })
  .then((r) => r.json());
const say = (text) => post("/api/chat", { text });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await post("/api/replay/start", { date: "2026-11-11", start: "09:40", speed: 20, paused: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    recordVideo: { dir: TMP, size: { width: 1280, height: 800 } }, colorScheme: "light" });
  const page = await ctx.newPage();

  await page.goto(WEB + "/deck", { waitUntil: "networkidle" });
  await wait(2500);
  await say("Hey Meridian, good morning");
  await wait(3000);
  await say("Scan for breakouts");
  await wait(4500);
  await say("Plan a trade on Zomato");
  await wait(6000);
  await say("yes, buy 482 ETERNAL");
  await wait(4000);

  await page.goto(WEB + "/studio?symbol=ETERNAL", { waitUntil: "networkidle" });
  await wait(3500);
  await page.mouse.wheel(0, 700);
  await wait(2500);

  await page.goto(WEB + "/markets", { waitUntil: "networkidle" });
  await wait(3500);

  await page.goto(WEB + "/automations", { waitUntil: "networkidle" });
  await wait(3000);

  await page.goto(WEB + "/deck", { waitUntil: "networkidle" });
  await wait(1500);
  await say("Stop everything");
  await wait(3500);

  await page.goto(WEB + "/ledger", { waitUntil: "networkidle" });
  await wait(3500);

  await ctx.close();
  await browser.close();
  const file = readdirSync(TMP).find((f) => f.endsWith(".webm"));
  renameSync(path.join(TMP, file), path.join(OUT_DIR, "meridian-demo.webm"));
  rmSync(TMP, { recursive: true, force: true });
  // leave the desk armed and ready for the next person
  await post("/api/replay/start", { date: "2026-11-11", start: "09:25", speed: 20, paused: true });
  console.log("wrote", path.join(OUT_DIR, "meridian-demo.webm"));
}

main().catch((e) => { console.error(e); process.exit(1); });
