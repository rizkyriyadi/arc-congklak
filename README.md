# Arc Game Foundation

The technical foundation for [Arc Entertainment](./ROADMAP.md)'s browser-playable
Indonesian indie games. Plain **TypeScript + HTML5 Canvas**, served by **Vite**.
No game engine — see [Why this stack](#why-this-stack).

## ▶ Play Congklak (live)

**<https://rizkyriyadi.github.io/arc-congklak/>** — the first title's solo puzzle
slice, playable in any modern browser. Press Space (or click) to start, then keys
1–7 (or click a house) to sow.

### Deploying

The live site is a single self-contained HTML file served from the `gh-pages`
branch. To redeploy after changes:

```bash
./scripts/deploy-pages.sh
```

> Why a branch and not GitHub Actions? The host account currently has Actions
> disabled by a billing lock. `.github/workflows/deploy.yml` is the intended CI
> path and is ready to use once that's resolved — switch the Pages source back to
> "GitHub Actions" and restore its `push:` trigger.

This repo currently ships a "hello, it runs" scene: a blank canvas, a
fixed-timestep game loop, a bouncing sprite, and a live FPS counter. The actual
first title lands on top of this in Phase 1.

## Requirements

- Node.js 18+ (developed on Node 22)
- npm

## Run it

```bash
npm install
npm run dev
```

> If `npm install` skips the dev tooling (you'll see `vite: not found` on
> `npm run dev`), your shell has `NODE_ENV=production` set, which makes npm omit
> devDependencies. Run `npm install --include=dev` once. All our build tooling
> lives in devDependencies (there are no runtime deps), so this is the only
> wrinkle.

Vite prints a local URL (default <http://localhost:5173>). Open it in any modern
browser. You should see:

- a dark canvas with a faint grid,
- a gold sprite bouncing off the walls and smoothly interpolating its motion,
- an `FPS:` readout in the top-left that should read ~60 on a 60 Hz display.

That confirms the canvas renders and the game loop is ticking.

## Other scripts

```bash
npm run build      # type-check, then produce a production bundle in dist/
npm run preview    # serve the production build locally
npm run typecheck  # type-check only (no emit)
```

## Project layout

```
index.html            App shell + canvas element
src/
  main.ts             Foundation demo scene (sprite + FPS HUD)
  engine/
    loop.ts           Reusable fixed-timestep loop (update + interpolated render)
tsconfig.json         Strict TypeScript config
```

`src/engine/loop.ts` is the spine every Arc title will reuse: gameplay updates
run at a fixed rate (deterministic, frame-rate independent) while rendering runs
per animation frame with an interpolation alpha for smoothness.

## Why this stack

- **TypeScript + Canvas, no engine.** Phaser and friends are powerful but add a
  large dependency, an opinionated scene/asset system, and a learning surface we
  don't need to prove a single-mechanic arcade/puzzle prototype. Plain Canvas
  keeps the bundle tiny and the control total. We'll reconsider an engine only
  when a concrete title need (physics, tilemaps, heavy asset pipelines) clearly
  outweighs that cost — and justify it then.
- **Vite for tooling.** Dev tooling, not a game dependency: instant dev server,
  native TypeScript, fast HMR, and a one-command production build. Lean and
  industry-standard.
