# Congklak — first-title vertical slice (ARC-5)

Browser-playable congklak (*dakon*) in TypeScript + HTML5 Canvas. No engine, no
runtime deps — the whole game ships as one ~14 KiB self-contained HTML file.

## What ships in v1 (spec: P1.1–P1.4)

**Solo puzzle mode** — exactly the scope the CEO set ("solo puzzle mode first").
Funnel `target` *biji* into your *lumbung* within a move budget. Only you sow, so
the whole board is your sandbox; chains and captures are how you reach the goal.

- **Authentic rules** (`src/congklak/rules.ts`, pure + unit-tested):
  - sow one *biji* per pit, counter-clockwise, skipping the opponent's lumbung;
  - last seed in **your lumbung** → free turn (chain), no move spent;
  - last seed in a **non-empty** pit → scoop and keep sowing (the traditional relay);
  - last seed in **your own empty** pit → capture it + the pit opposite (*menembak*).
- **Three levels** of rising target/skill (`src/congklak/puzzles.ts`).
- **Input:** click/tap a house, or keys `1`–`7`; `Space` start, `R` restart, `N` next.
- **Readable without instructions:** seed counts on every pit, legal-move glow,
  a "hand" counter while sowing, capture flash, and toasts ("Giliran gratis!").

## Indonesian theming (P1.2 — pending CEO cultural sign-off)

Grounded in the real object, not decoration: a carved teak **boat-shaped board**,
**tamarind** seeds, two **lumbung** at the ends, and correct terms throughout
(*congklak/dakon*, *lumbung*, *biji*, *langkah*). Warm wood + a single gold accent;
deliberately no batik wallpaper / "exotic" cladding.

## Architecture

| File | Role |
| --- | --- |
| `congklak/rules.ts` | Pure rules engine + move planner (emits animation events). |
| `congklak/rules.test.ts` | 18 assertions: geometry, chain, capture, relay, seed conservation. |
| `congklak/puzzles.ts` | Level definitions. |
| `congklak/layout.ts` | Screen geometry / hit-testing. |
| `congklak/render.ts` | All canvas drawing + overlays. |
| `congklak/game.ts` | Puzzle-mode state machine, sow animation, input. **(shipped)** |

The rules engine is UI-free and already ships a mirror hook
(`mirrorBoard`/`unmirrorIndex` in `rules.ts`): mirror the board, run the same
`planMove`, translate the indices back, and you have a legal *opponent* move with
no second rule engine. That makes the pass-and-play 2P and AI-opponent follow-ons
small, low-risk next steps once the CEO greenlights direction.

## Build & verify

```sh
npm run typecheck       # tsc --noEmit, strict
npm test                # rules engine assertions
npm run build           # tsc + vite production build -> dist/
npm run build:standalone# one-file dist-standalone/congklak.html (CEO playtest)
npm run dev             # local dev server
```

Verified headless (Playwright/Chromium): title + board render, a full puzzle round
plays start-to-finish, zero console/page errors, from both the dev server and the
standalone `file://`.
