/**
 * Build a single self-contained HTML file (all JS + CSS inlined, classic
 * <script> so it runs from file:// or any static host). This is the artifact we
 * hand the CEO for a one-click playtest — no server, no build step on their end.
 *
 *   node scripts/build-standalone.mjs   ->   dist-standalone/congklak.html
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const css = `:root{color-scheme:dark}html,body{margin:0;height:100%;background:#1a1009;color:#f4e6cf;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}#app{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:100%;padding:16px;box-sizing:border-box}h1{margin:0;font-size:1rem;font-weight:600;letter-spacing:.03em;color:#e8b04b}p.subtitle{margin:0;font-size:.8rem;opacity:.55}canvas{border:1px solid #5a3a1d;border-radius:12px;background:#241812;max-width:100%;height:auto;touch-action:none;box-shadow:0 12px 40px rgba(0,0,0,.5)}`;

const html = `<!doctype html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Congklak — Arc Entertainment</title><style>${css}</style></head><body><div id="app"><h1>Congklak · Arc Entertainment</h1><p class="subtitle">Permainan biji tradisional Nusantara — mode teka-teki</p><canvas id="game" width="960" height="600"></canvas></div><script>${js}</script></body></html>`;

mkdirSync("dist-standalone", { recursive: true });
writeFileSync("dist-standalone/congklak.html", html);
console.log(`dist-standalone/congklak.html — ${(html.length / 1024).toFixed(1)} KiB`);
