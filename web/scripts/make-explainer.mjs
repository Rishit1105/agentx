// Builds the narrated explainer video of Meridian from the running app.
//   node scripts/make-explainer.mjs <ffmpeg-binary> [outDir]
// Needs the core on :8000, the web app on :3000, macOS `say` (narration) and an ffmpeg with xfade + drawtext.
// Each scene is recorded separately with Playwright while its narration plays in time, then ffmpeg trims, mixes,
// crossfades and encodes everything to one 1920x1080 H.264 MP4 with AAC audio.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const FFMPEG = process.argv[2];
const OUT = path.resolve(process.argv[3] || "explainer");
const WEB = process.env.WEB_URL || "http://localhost:3000";
const CORE = process.env.CORE_URL || "http://localhost:8000";
const VOICE = process.env.VOICE || "Rishi";
const W = 1920, H = 1080, XF = 0.6;      // canvas and crossfade length (s)
if (!FFMPEG) { console.error("usage: node scripts/make-explainer.mjs <ffmpeg> [outDir]"); process.exit(1); }

const post = (p, body) => fetch(CORE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })
  .then((r) => r.json()).catch(() => ({}));
const say = (text) => post("/api/chat", { text });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// wait until no agent is mid-run, so the next scene's command is never answered with "one moment"
async function idle(maxMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const agents = await fetch(CORE + "/api/agents").then((r) => r.json()).catch(() => []);
    if (Array.isArray(agents) && !agents.some((a) => a.busy)) return;
    await wait(500);
  }
}
const ff = (args) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

// ---------------------------------------------------------------- overlays drawn inside the page while recording
const OVERLAY_CSS = `
  #mx-cap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:2147483647;max-width:1280px;
    background:rgba(20,24,31,.88);color:#f6f5f1;font:500 26px/1.35 Inter,system-ui,sans-serif;padding:16px 28px;
    border-radius:14px;box-shadow:0 18px 40px -18px rgba(0,0,0,.5);text-align:center;opacity:0;transition:opacity .35s}
  #mx-tag{position:fixed;left:48px;top:96px;z-index:2147483647;display:flex;gap:12px;align-items:center;
    background:#14181f;color:#f6f5f1;font:600 20px/1 'Space Grotesk',Inter,system-ui,sans-serif;letter-spacing:.06em;
    padding:12px 18px;border-radius:999px;opacity:0;transform:translateY(-8px);transition:all .4s}
  #mx-tag b{color:#5cd6f7;font-weight:700}`;
async function overlay(page, tag, caption) {
  await page.addStyleTag({ content: OVERLAY_CSS }).catch(() => {});
  await page.evaluate(([tag, caption]) => {
    for (const id of ["mx-cap", "mx-tag"]) document.getElementById(id)?.remove();
    if (tag) { const t = document.createElement("div"); t.id = "mx-tag"; t.innerHTML = tag; document.body.appendChild(t);
      requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "none"; }); }
    if (caption) { const c = document.createElement("div"); c.id = "mx-cap"; c.textContent = caption; document.body.appendChild(c);
      requestAnimationFrame(() => { c.style.opacity = "1"; }); }
  }, [tag, caption]).catch(() => {});
}
async function caption(page, text) {
  await page.evaluate((text) => { const c = document.getElementById("mx-cap"); if (c) { c.style.opacity = "0";
    setTimeout(() => { c.textContent = text; c.style.opacity = "1"; }, 250); } }, text).catch(() => {});
}
const smoothScroll = (page, sel, px, ms) => page.evaluate(([sel, px, ms]) => new Promise((done) => {
  const el = (sel && document.querySelector(sel)) || document.scrollingElement;
  const start = el.scrollTop, t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    el.scrollTop = start + px * e; k < 1 ? requestAnimationFrame(step) : done(); };
  requestAnimationFrame(step);
}), [sel, px, ms]);

const card = (title, sub, foot) => `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap">
<style>body{margin:0;width:${W}px;height:${H}px;background:#f6f5f1;color:#14181f;font-family:Inter,sans-serif;display:grid;place-items:center;overflow:hidden}
.w{text-align:center;animation:in 1.2s cubic-bezier(.2,.7,.2,1) both}.e{font:500 22px/1 'JetBrains Mono',monospace;letter-spacing:.3em;color:#0a7ea4}
h1{font:700 168px/0.95 'Space Grotesk',sans-serif;letter-spacing:-.04em;margin:28px 0 18px}p{font:500 48px/1.2 'Space Grotesk',sans-serif;margin:0}
p span{color:#0a7ea4}.f{margin-top:48px;font:400 26px/1.4 Inter,sans-serif;color:#646b76;animation:in 1.2s .5s both}
.orb{position:absolute;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#d6eef5,#0a7ea4 45%,#06607e 60%,transparent 61%);
opacity:.09;right:-260px;bottom:-320px;animation:drift 12s ease-in-out infinite alternate}
.bar{position:absolute;left:0;top:0;bottom:0;width:22px;background:#14181f}
@keyframes in{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:none}}
@keyframes drift{to{transform:translate(-60px,-40px) scale(1.05)}}</style></head>
<body><div class="bar"></div><div class="orb"></div><div class="w"><div class="e">PS-02 · AGENTIC TRADING BOT · PAPER ONLY</div><h1>${title}</h1><p>${sub}</p><div class="f">${foot}</div></div></body></html>`;

// ---------------------------------------------------------------- the storyboard
const SCENES = [
  { id: "00-title", text: "This is Meridian: a voice-first paper-trading desk for India's NSE. Speak the market, and trust every trade.",
    run: async (p) => { await p.setContent(card("MERIDIAN", "Speak the market. <span>Trust every trade.</span>",
      "Voice-native · sixteen agents · five defence layers · ₹0 real money")); } },
  { id: "01-landing", text: "SEBI found that seven in ten intraday traders lost money. They know the rules; nothing makes them follow them. Meridian moves those rules out of the trader's head and into code.",
    run: async (p, d) => { await p.goto(WEB + "/", { waitUntil: "networkidle" }); await overlay(p, "<b>01</b> LANDING", "Rules out of your head, into code");
      await wait(1800); await smoothScroll(p, ".lp-root, [data-lp-scroll], main", 2600, d * 0.75); } },
  { id: "02-briefing", text: "On the Command Deck you just talk. Good morning gives the market briefing. Scan for breakouts runs the scanner across four hundred and ninety-seven NSE stocks, and the agents light up as they work.",
    setup: async () => { await post("/api/replay/start", { date: "2026-11-11", start: "09:40", speed: 20, paused: true }); },
    run: async (p, d) => { await p.goto(WEB + "/deck", { waitUntil: "networkidle" }); await overlay(p, "<b>02</b> COMMAND DECK", "“Hey Meridian, good morning”");
      await wait(1200); await say("Hey Meridian, good morning"); await wait(d * 0.2);
      await caption(p, "“Scan for breakouts”: 130 of 497 NSE stocks broke out"); await say("Scan for breakouts"); } },
  { id: "03-ticket", text: "Plan a trade on Zomato runs the whole pipeline: strategy, entry, stop and target, sixty real sessions in the Time Machine, sizing to a two thousand five hundred rupee maximum loss, and the risk gate. Before you say yes, Meridian asks how you feel. Then only an exact yes places the paper order.",
    run: async (p, d) => { await p.goto(WEB + "/deck", { waitUntil: "networkidle" }); await overlay(p, "<b>03</b> PLAN · CHECK-IN · YES", "“Plan a trade on Zomato”");
      await say("Plan a trade on Zomato"); await wait(d * 0.35); await caption(p, "Pre-entry check-in: calm, confidence 4 of 5");
      await say("I'm calm, confidence 4"); await wait(d * 0.25); await caption(p, "“Yes, buy 482 ETERNAL”: paper fill, bracket order, Story written");
      await say("yes, buy 482 ETERNAL"); } },
  { id: "04-tilt", text: "When that trade stops out and you try to win it straight back, the tilt guard steps in. The revenge re-entry is blocked and new entries pause for fifteen minutes. Exits are never blocked.",
    setup: async () => { await post("/api/replay/control", { jump: "12:30" }); await wait(2500); },
    run: async (p, d) => { await p.goto(WEB + "/deck", { waitUntil: "networkidle" }); await overlay(p, "<b>04</b> TILT GUARD", "Stopped out at −1R, exactly as planned");
      await wait(d * 0.3); await caption(p, "“Plan a trade on Zomato” again → blocked: revenge re-entry, 15-minute cool-down");
      await say("plan a trade on zomato"); } },
  { id: "05-markets", text: "Markets shows the NIFTY five hundred by sector, sized by traded value. In Trade Studio, the what-if simulator shows the limit that binds, the charges, and a gap through the stop, before any ticket exists.",
    run: async (p, d) => { await p.goto(WEB + "/markets", { waitUntil: "networkidle" }); await overlay(p, "<b>05</b> MARKETS · WHAT-IF", "NIFTY 500 sector heatmap");
      await wait(d * 0.45); await p.goto(WEB + "/studio?symbol=INFY", { waitUntil: "networkidle" }); await overlay(p, "<b>05</b> MARKETS · WHAT-IF", "What-if: max loss, binding limit, charges, gap scenario");
      await smoothScroll(p, "main", 900, 2500); } },
  { id: "06-lab", text: "In the Strategy Lab you describe a rule in plain English. Meridian backtests it on real bars with Indian charges against buy and hold. Only a rule that passes the edge gate can be approved. Most don't, and Meridian says so.",
    run: async (p) => { await p.goto(WEB + "/lab", { waitUntil: "networkidle" }); await overlay(p, "<b>06</b> STRATEGY LAB", "Plain-English rule → honest backtest → approve only on a pass");
      await p.getByRole("button", { name: /opening range breakout of the first 30 minutes/i }).click().catch(() => {});
      await p.waitForSelector("text=Rule as tested", { timeout: 60000 }).catch(() => {}); await wait(800); await smoothScroll(p, "main", 500, 2000); } },
  { id: "07-options", text: "The paper options desk models defined-risk strategies, draws the payoff, and checks the worst case against the same per-trade limit.",
    run: async (p, d) => { await p.goto(WEB + "/options", { waitUntil: "networkidle" }); await overlay(p, "<b>07</b> OPTIONS DESK", "Bull call spread: blocked, max loss over ₹2,500");
      await wait(d * 0.45); await p.selectOption("select >> nth=1", "iron_condor").catch(() => {}); await caption(p, "Iron condor: defined risk, passes the gate"); } },
  { id: "08-auto", text: "Automations put the desk on rails: a breakout radar, a breakeven guard, a soft loss guard. And you can speak Hinglish. Zomato mein trade plan karo works just like English.",
    run: async (p, d) => { await p.goto(WEB + "/automations", { waitUntil: "networkidle" }); await overlay(p, "<b>08</b> AUTOMATIONS · HINDI", "When X, do Y, on the market clock");
      await smoothScroll(p, "main", 700, d * 0.4); await p.goto(WEB + "/deck", { waitUntil: "networkidle" });
      await overlay(p, "<b>08</b> AUTOMATIONS · HINDI", "“Zomato mein trade plan karo” → answered in Hindi"); await say("Zomato mein trade plan karo"); } },
  { id: "09-review", text: "Trade Review grades your discipline and shows every trade's post-mortem. Guardrails holds the limits, the hash-chained audit log, and a SEBI-style compliance report with an algo ID on every algo order.",
    run: async (p, d) => { await p.goto(WEB + "/review", { waitUntil: "networkidle" }); await overlay(p, "<b>09</b> REVIEW · COMPLIANCE", "Discipline Scorecard and post-mortem");
      await wait(d * 0.45); await p.goto(WEB + "/guardrails", { waitUntil: "networkidle" }); await overlay(p, "<b>09</b> REVIEW · COMPLIANCE", "Five layers · audit chain · SEBI-style compliance");
      await smoothScroll(p, "main", 1100, 2600); } },
  { id: "10-halt", text: "And one phrase always works, with or without the language model. Stop everything. Orders cancelled, positions flat, entries locked.",
    setup: async () => { await post("/api/replay/start", { date: "2026-11-11", start: "09:40", speed: 20, paused: true });
      await say("scan for breakouts"); await say("plan a trade on zomato"); await say("yes, buy 482 ETERNAL"); },
    run: async (p, d) => { await p.goto(WEB + "/deck", { waitUntil: "networkidle" }); await overlay(p, "<b>10</b> KILL SWITCH", "“Stop everything”");
      await wait(d * 0.3); await say("stop everything"); } },
  { id: "11-outro", text: "Meridian. Speak the market. Trust every trade. Paper trading only, built to make discipline the default.",
    run: async (p) => { await p.setContent(card("MERIDIAN", "Speak the market. <span>Trust every trade.</span>",
      "github.com/Rishit1105/agentx · paper trading only · not investment advice")); } },
];

// ---------------------------------------------------------------- pipeline
function narrate(scene, dir) {
  const aiff = path.join(dir, `${scene.id}.aiff`);
  execFileSync("say", ["-v", VOICE, "-r", "172", "-o", aiff, scene.text]);
  const info = execFileSync("afinfo", [aiff]).toString();
  const dur = parseFloat((info.match(/estimated duration:\s*([\d.]+)/) || [])[1] || "6");
  return { aiff, dur };
}

async function main() {
  const tmp = path.join(OUT, "tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const browser = await chromium.launch();
  const parts = [];
  for (const sc of SCENES) {
    const { aiff, dur } = narrate(sc, tmp);
    const total = dur + 1.4;                                  // breathing room before and after the voice
    await idle();
    if (sc.setup) await sc.setup();
    await idle();
    const vdir = path.join(tmp, sc.id);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "light",
      recordVideo: { dir: vdir, size: { width: W, height: H } } });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto("about:blank");
    const lead = (Date.now() - t0) / 1000;
    const started = Date.now();
    await Promise.race([sc.run(page, total * 1000), wait(total * 1000)]);
    const spent = (Date.now() - started) / 1000;
    if (spent < total) await wait((total - spent) * 1000);
    await ctx.close();
    const webm = path.join(vdir, readdirSync(vdir).find((f) => f.endsWith(".webm")));
    const mp4 = path.join(tmp, `${sc.id}.mp4`);
    // trim the blank lead-in, normalise to 30 fps, mix the narration in 0.6 s after the cut
    ff(["-ss", String(lead + 0.2), "-i", webm, "-i", aiff, "-t", String(total),
      "-filter_complex", `[0:v]fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p[v];[1:a]adelay=600|600,apad,atrim=0:${total},aresample=48000[a]`,
      "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", mp4]);
    parts.push({ mp4, total });
    console.log(`scene ${sc.id}: ${total.toFixed(1)} s`);
  }
  await browser.close();

  // crossfade chain
  const inputs = parts.flatMap((p) => ["-i", p.mp4]);
  let vf = "", af = "", last = "[0:v]", lastA = "[0:a]", offset = 0;
  for (let i = 1; i < parts.length; i++) {
    offset += parts[i - 1].total - XF;
    vf += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(2)}[v${i}];`;
    af += `${lastA}[${i}:a]acrossfade=d=${XF}[a${i}];`;
    last = `[v${i}]`; lastA = `[a${i}]`;
  }
  const n = parts.length - 1;
  const graph = `${vf}${af}${last}fade=t=in:st=0:d=0.8,fade=t=out:st=${(offset + parts[n].total - 1.2).toFixed(2)}:d=1.2[vout];` +
    `${lastA}loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.5[aout]`;
  const final = path.join(OUT, "meridian-explainer.mp4");
  ff([...inputs, "-filter_complex", graph, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", final]);
  writeFileSync(path.join(OUT, "narration.txt"), SCENES.map((s) => `[${s.id}] ${s.text}`).join("\n\n"));
  rmSync(tmp, { recursive: true, force: true });
  await post("/api/replay/start", { date: "2026-11-11", start: "09:25", speed: 20, paused: true });
  console.log("wrote", final);
}

main().catch((e) => { console.error(e); process.exit(1); });
void renameSync;
