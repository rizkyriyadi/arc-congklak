/**
 * Headless smoke verification for the Congklak 2P / vs-AI build (ARC-7).
 *
 * Loads the single-file standalone build, drives the real UI through the title
 * menu, a 2-player exchange, and a vs-AI exchange, capturing screenshots and
 * asserting ZERO console errors / page errors. Run: node scripts/verify-headless.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

// Playwright lives in the global toolchain, not in this project's deps. Resolve
// and load it via CommonJS require (honours NODE_PATH); it's a CJS module.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(here, "../dist-standalone/congklak.html");
const outDir = resolve(here, "../docs");
mkdirSync(outDir, { recursive: true });

const VIEW_W = 960;
const VIEW_H = 600;
const COL_LEFT = 206;
const COL_STEP = (754 - 206) / 6;
const TOP_Y = 212;
const BOTTOM_Y = 388;

// View-space centre of a house index (mirrors layout.ts).
function houseCenter(i) {
  if (i <= 6) return { x: COL_LEFT + i * COL_STEP, y: BOTTOM_Y };
  return { x: COL_LEFT + (14 - i) * COL_STEP, y: TOP_Y };
}

const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VIEW_W, height: VIEW_H } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto("file://" + htmlPath);
// Pin the canvas to an exact, unscaled 960x600 at the top-left so view-space
// coordinates map 1:1 to client pixels (removes CSS letterboxing/scaling).
await page.addStyleTag({
  content:
    "#app{padding:0!important;gap:0!important;display:block!important}" +
    "h1,p.subtitle{display:none!important}" +
    "#game{max-width:none!important;width:960px!important;height:600px!important;" +
    "margin:0!important;border:0!important;border-radius:0!important}",
});
await page.waitForTimeout(400);

const canvas = page.locator("#game");
const box = await canvas.boundingBox();
const sx = box.width / VIEW_W;
const sy = box.height / VIEW_H;
const clickView = async (vx, vy) => {
  await page.mouse.click(box.x + vx * sx, box.y + vy * sy);
  await sleep(120);
};
const clickHouse = async (i) => {
  const c = houseCenter(i);
  await clickView(c.x, c.y);
};
const shot = async (name) => {
  await canvas.screenshot({ path: resolve(outDir, name) });
  console.log("  screenshot:", name);
};

// --- Title menu -------------------------------------------------------------
await shot("arc7-title-menu.png");

// --- 2-player pass-and-play -------------------------------------------------
// Menu option 0 ("2 Pemain") sits at view-y 300, centred horizontally.
await clickView(VIEW_W / 2, 300);
await sleep(400);
await shot("arc7-2p-start.png");

// South plays house 2, wait for the sow animation to settle, then North plays.
await clickHouse(2);
await sleep(2600);
await clickHouse(10); // a North house
await sleep(2600);
await clickHouse(4); // back to South (or whoever's turn — only legal clicks register)
await sleep(2600);
await shot("arc7-2p-midgame.png");

// --- vs AI ------------------------------------------------------------------
await page.keyboard.press("Escape");
await sleep(300);
await clickView(VIEW_W / 2, 364); // menu option 1 ("Lawan AI")
await sleep(400);
await shot("arc7-ai-start.png");

// Human plays a handful of moves; the AI answers automatically after each.
for (const h of [3, 1, 5, 0, 6, 2]) {
  await clickHouse(h);
  await sleep(3200); // human sow + AI think + AI sow
}
await shot("arc7-ai-midgame.png");

// Keyboard input path: select South houses by number key.
for (const k of ["1", "7", "4"]) {
  await page.keyboard.press(k);
  await sleep(3200);
}
await shot("arc7-ai-keyboard.png");

await browser.close();

if (errors.length) {
  console.error("\nFAIL — console/page errors detected:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("\nOK — drove title + 2P + vs-AI headless with ZERO console errors.");
