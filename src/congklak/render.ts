/**
 * Canvas rendering for Congklak. All drawing lives here; the game scene owns
 * state and hands this module a immutable snapshot of what to paint.
 *
 * Theming note (P1.2): the board is a carved teak *boat* (the real congklak
 * silhouette), seeds are tamarind (*biji asam*), and every label uses the
 * correct Indonesian term — congklak/dakon, lumbung, biji. The palette is warm
 * wood + a single gold accent; we deliberately avoid batik wallpaper or other
 * decorative "exotic" cladding. The culture is in the object, not a costume.
 */

import {
  pitCenter,
  isStore,
  HOUSE_RADIUS,
  STORE_RX,
  STORE_RY,
  VIEW_W,
  VIEW_H,
  Point,
} from "./layout";
import { PLAYER_STORE, OPP_STORE } from "./rules";

// --- palette ---------------------------------------------------------------
const COL_BG_TOP = "#241812";
const COL_BG_BOT = "#3a2417";
const COL_WOOD_LIGHT = "#9c6b3a";
const COL_WOOD = "#7c4f2a";
const COL_WOOD_DARK = "#5a3a1d";
const COL_PIT = "#2e1d11";
const COL_PIT_RIM = "#492f19";
const COL_SEED = "#caa46a"; // tamarind shell, lit
const COL_SEED_DARK = "#8a6634";
const COL_GOLD = "#e8b04b";
const COL_TEXT = "#f4e6cf";
const COL_TEXT_DIM = "rgba(244, 230, 207, 0.55)";
const COL_RED = "#c8102e"; // Indonesian-flag red, used sparingly

/** Everything needed to paint the board itself, shared by every game mode. */
export interface BoardLayer {
  pits: number[];
  /** Houses to ring as legal (any row — the current mover's side). */
  legal: number[];
  hoverHouse: number; // -1 if none
  /** Pits to pulse this frame (capture flash). */
  flash: number[];
  /** A seed mid-flight between two pits, or null. */
  flying: { from: Point; to: Point; t: number } | null;
  /** Seeds still in hand during a sow segment (shown near active pit). */
  hand: { index: number; count: number } | null;
  /** Store(s) to render in the gold "active" colour (whose lumbung is in play). */
  activeStores?: number[];
  southLabel: string;
  northLabel: string;
}

export interface RenderState extends BoardLayer {
  level: string;
  target: number;
  movesLeft: number;
  toast: { text: string; alpha: number } | null;
}

/** State for the two-player / vs-AI match screens. */
export interface MatchRenderState extends BoardLayer {
  /** Headline above the HUD, e.g. "Giliran Selatan" / "AI berpikir…". */
  turnText: string;
  southScore: number;
  northScore: number;
  vsAi: boolean;
  toast: { text: string; alpha: number } | null;
}

// Deterministic scatter so seeds sit still between frames.
function scatter(seed: number, count: number, rx: number, ry: number): Point[] {
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    // Rejection-sample inside the ellipse for an even spread.
    let x = 0;
    let y = 0;
    do {
      x = (rnd() * 2 - 1) * rx;
      y = (rnd() * 2 - 1) * ry;
    } while ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1);
    pts.push({ x, y });
  }
  return pts;
}

function drawSeed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((x + y) * 0.05); // varied orientation, deterministic by position
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, COL_SEED);
  g.addColorStop(1, COL_SEED_DARK);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.3, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSeedsCluster(
  ctx: CanvasRenderingContext2D,
  center: Point,
  count: number,
  rx: number,
  ry: number,
  seedR: number,
  scatterSeed: number,
): void {
  if (count <= 0) return;
  const shown = Math.min(count, 16);
  const pts = scatter(scatterSeed, shown, rx, ry);
  for (const p of pts) drawSeed(ctx, center.x + p.x, center.y + p.y, seedR);
}

function roundedBoat(ctx: CanvasRenderingContext2D): void {
  // The hull: a long rounded "boat" with raised ends.
  const x = 40;
  const y = 120;
  const w = VIEW_W - 80;
  const h = 360;
  const r = 170;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + h / 2);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h / 2);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPitWell(
  ctx: CanvasRenderingContext2D,
  c: Point,
  rx: number,
  ry: number,
): void {
  // Carved recess: dark fill + rim highlight for depth.
  ctx.save();
  const g = ctx.createRadialGradient(c.x, c.y - ry * 0.3, rx * 0.2, c.x, c.y, rx);
  g.addColorStop(0, "#1b110a");
  g.addColorStop(1, COL_PIT);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COL_PIT_RIM;
  ctx.stroke();
  ctx.restore();
}

/**
 * Paint the board — hull, stores, houses, seeds, legal rings, flying seed, hand
 * counter. Mode-agnostic: every screen draws this first, then adds its own HUD.
 */
export function drawBoardLayer(ctx: CanvasRenderingContext2D, st: BoardLayer): void {
  const activeStores = st.activeStores ?? [PLAYER_STORE];
  // Background.
  const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  bg.addColorStop(0, COL_BG_TOP);
  bg.addColorStop(1, COL_BG_BOT);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Board hull with a soft drop shadow.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  roundedBoat(ctx);
  const wood = ctx.createLinearGradient(0, 120, 0, 480);
  wood.addColorStop(0, COL_WOOD_LIGHT);
  wood.addColorStop(0.5, COL_WOOD);
  wood.addColorStop(1, COL_WOOD_DARK);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.restore();

  // Hull edge highlight.
  ctx.save();
  roundedBoat(ctx);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 226, 180, 0.25)";
  ctx.stroke();
  ctx.restore();

  // Stores (lumbung) — large vertical wells at each end.
  for (const store of [PLAYER_STORE, OPP_STORE]) {
    const c = pitCenter(store);
    drawPitWell(ctx, c, STORE_RX, STORE_RY);
    drawSeedsCluster(ctx, c, st.pits[store], STORE_RX - 16, STORE_RY - 22, 8, store + 991);
  }

  // Houses.
  for (let i = 0; i < 16; i++) {
    if (isStore(i)) continue;
    const c = pitCenter(i);
    drawPitWell(ctx, c, HOUSE_RADIUS, HOUSE_RADIUS);

    const legal = st.legal.includes(i);
    const hovered = st.hoverHouse === i;

    // Legal-move and hover affordances for the side currently to move.
    if (legal) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, HOUSE_RADIUS + 4, HOUSE_RADIUS + 4, 0, 0, Math.PI * 2);
      ctx.lineWidth = hovered ? 5 : 3;
      ctx.strokeStyle = hovered ? COL_GOLD : "rgba(232, 176, 75, 0.5)";
      ctx.stroke();
      ctx.restore();
    }

    if (st.flash.includes(i)) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, HOUSE_RADIUS + 6, HOUSE_RADIUS + 6, 0, 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = COL_RED;
      ctx.stroke();
      ctx.restore();
    }

    drawSeedsCluster(ctx, c, st.pits[i], HOUSE_RADIUS - 12, HOUSE_RADIUS - 12, 7, i + 17);

    // Numeric count for instant readability (acceptance: readable w/o instructions).
    if (st.pits[i] > 0) {
      ctx.fillStyle = COL_TEXT;
      ctx.font = "bold 16px ui-rounded, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(st.pits[i]), c.x, c.y + HOUSE_RADIUS + 16);
    }
  }

  // Store counts (big). The active mover's lumbung glows gold.
  for (const store of [PLAYER_STORE, OPP_STORE]) {
    const c = pitCenter(store);
    ctx.fillStyle = activeStores.includes(store) ? COL_GOLD : COL_TEXT_DIM;
    ctx.font = "bold 30px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(st.pits[store]), c.x, c.y + STORE_RY + 24);
  }

  // Side labels (per-mode wording).
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.textAlign = "center";
  ctx.fillText(st.southLabel, pitCenter(PLAYER_STORE).x, pitCenter(PLAYER_STORE).y - STORE_RY - 16);
  ctx.fillText(st.northLabel, pitCenter(OPP_STORE).x, pitCenter(OPP_STORE).y - STORE_RY - 16);

  // Flying seed (sow animation).
  if (st.flying) {
    const { from, to, t } = st.flying;
    const e = t * t * (3 - 2 * t); // smoothstep
    const x = from.x + (to.x - from.x) * e;
    const y = from.y + (to.y - from.y) * e - Math.sin(t * Math.PI) * 26; // little arc
    drawSeed(ctx, x, y, 8);
  }

  // Hand counter near the active pit.
  if (st.hand && st.hand.count > 0) {
    const c = pitCenter(st.hand.index);
    ctx.fillStyle = COL_GOLD;
    ctx.font = "bold 14px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`✊ ${st.hand.count}`, c.x, c.y - HOUSE_RADIUS - 14);
  }
}

/** Centred toast banner (free turn / capture / win messages). */
function drawToast(
  ctx: CanvasRenderingContext2D,
  toast: { text: string; alpha: number } | null,
): void {
  if (!toast || toast.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = toast.alpha;
  ctx.fillStyle = "rgba(20,12,6,0.82)";
  ctx.strokeStyle = COL_GOLD;
  ctx.lineWidth = 2;
  ctx.font = "bold 20px ui-rounded, system-ui, sans-serif";
  const w = ctx.measureText(toast.text).width;
  roundRect(ctx, VIEW_W / 2 - w / 2 - 26, 92, w + 52, 40, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COL_GOLD;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(toast.text, VIEW_W / 2, 113);
  ctx.restore();
}

// --- solo puzzle screen -----------------------------------------------------

export function drawScene(ctx: CanvasRenderingContext2D, st: RenderState): void {
  drawBoardLayer(ctx, st);

  // Bottom hint.
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.textAlign = "center";
  ctx.fillText("◄ rumahmu — tekan 1–7 atau klik · Esc: menu ►", VIEW_W / 2, VIEW_H - 18);

  drawHud(ctx, st);
  drawToast(ctx, st.toast);
}

function drawHud(ctx: CanvasRenderingContext2D, st: RenderState): void {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 22px ui-rounded, system-ui, sans-serif";
  ctx.fillText("Congklak", 40, 52);
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("· dakon — mode teka-teki", 168, 51);

  // Right-aligned stats.
  ctx.textAlign = "right";
  ctx.fillStyle = COL_TEXT;
  ctx.font = "15px ui-rounded, system-ui, sans-serif";
  ctx.fillText(`Level: ${st.level}`, VIEW_W - 40, 36);
  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 16px ui-rounded, system-ui, sans-serif";
  ctx.fillText(
    `Target ${st.pits[PLAYER_STORE]} / ${st.target} biji`,
    VIEW_W - 40,
    58,
  );
  ctx.fillStyle = st.movesLeft <= 1 ? COL_RED : COL_TEXT;
  ctx.font = "15px ui-rounded, system-ui, sans-serif";
  ctx.fillText(`Langkah tersisa: ${st.movesLeft}`, VIEW_W - 40, 80);
}

// --- 2P / vs-AI match screen ------------------------------------------------

export function drawMatchScene(
  ctx: CanvasRenderingContext2D,
  st: MatchRenderState,
): void {
  drawBoardLayer(ctx, st);

  // Title / mode in the corner.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 22px ui-rounded, system-ui, sans-serif";
  ctx.fillText("Congklak", 40, 52);
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(st.vsAi ? "· lawan AI" : "· 2 pemain", 168, 51);

  // Whose turn — centred, prominent.
  ctx.textAlign = "center";
  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 18px ui-rounded, system-ui, sans-serif";
  ctx.fillText(st.turnText, VIEW_W / 2, 50);

  // Scoreboard, right-aligned.
  ctx.textAlign = "right";
  ctx.font = "15px ui-rounded, system-ui, sans-serif";
  ctx.fillStyle = COL_TEXT;
  ctx.fillText(`Selatan ${st.southScore}  —  ${st.northScore} Utara`, VIEW_W - 40, 44);

  // Bottom hint.
  ctx.textAlign = "center";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.fillText(
    "Klik rumah yang menyala atau tekan 1–7 · R: ulang · Esc: menu",
    VIEW_W / 2,
    VIEW_H - 18,
  );

  drawToast(ctx, st.toast);
}

export function drawMatchEnd(
  ctx: CanvasRenderingContext2D,
  st: MatchRenderState,
  winner: 0 | 1 | null,
): void {
  drawMatchScene(ctx, st);
  panel(ctx);

  ctx.textAlign = "center";
  const draw = winner === null;
  ctx.fillStyle = draw ? COL_TEXT : COL_GOLD;
  ctx.font = "bold 46px ui-rounded, system-ui, sans-serif";
  const headline = draw
    ? "Seri!"
    : st.vsAi
      ? winner === 0
        ? "Kamu Menang! 🎉"
        : "AI Menang"
      : `Pemain ${winner === 0 ? "Selatan" : "Utara"} Menang! 🎉`;
  ctx.fillText(headline, VIEW_W / 2, VIEW_H / 2 - 60);

  ctx.fillStyle = COL_TEXT;
  ctx.font = "20px ui-rounded, system-ui, sans-serif";
  ctx.fillText(
    `Lumbung — Selatan ${st.southScore} · Utara ${st.northScore} biji`,
    VIEW_W / 2,
    VIEW_H / 2 - 12,
  );

  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 18px ui-rounded, system-ui, sans-serif";
  ctx.fillText("Tekan R untuk main lagi · Esc untuk menu", VIEW_W / 2, VIEW_H / 2 + 44);
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- overlay screens -------------------------------------------------------

function panel(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(10, 6, 3, 0.74)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "rgba(40, 26, 15, 0.96)";
  ctx.strokeStyle = COL_GOLD;
  ctx.lineWidth = 2;
  roundRect(ctx, VIEW_W / 2 - 320, VIEW_H / 2 - 190, 640, 380, 18);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Title-menu options, in display order. The index is the menu selection. */
export const MENU_ITEMS: { title: string; sub: string }[] = [
  { title: "2 Pemain", sub: "Pass-and-play — dua manusia bergiliran" },
  { title: "Lawan AI", sub: "Tantang lawan komputer" },
  { title: "Mode Teka-teki", sub: "Latihan solo: kumpulkan biji target" },
];

const MENU_TOP = 300; // y of the first option's centre
const MENU_STEP = 64;
const MENU_W = 520;
const MENU_H = 52;

/** Pixel rect of menu option `i` (for drawing and hit-testing). */
function menuRect(i: number): { x: number; y: number; w: number; h: number } {
  const cy = MENU_TOP + i * MENU_STEP;
  return { x: VIEW_W / 2 - MENU_W / 2, y: cy - MENU_H / 2, w: MENU_W, h: MENU_H };
}

/** Return the menu option index under a view-space point, or -1. */
export function titleOptionAt(x: number, y: number): number {
  for (let i = 0; i < MENU_ITEMS.length; i++) {
    const r = menuRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

export function drawTitle(ctx: CanvasRenderingContext2D, selected: number): void {
  const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  bg.addColorStop(0, COL_BG_TOP);
  bg.addColorStop(1, COL_BG_BOT);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 60px ui-rounded, system-ui, sans-serif";
  ctx.fillText("Congklak", VIEW_W / 2, 150);
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.font = "17px system-ui, sans-serif";
  ctx.fillText("dakon — permainan biji tradisional Nusantara", VIEW_W / 2, 184);

  // Menu options.
  MENU_ITEMS.forEach((item, i) => {
    const r = menuRect(i);
    const on = i === selected;
    ctx.save();
    ctx.fillStyle = on ? "rgba(232, 176, 75, 0.16)" : "rgba(40, 26, 15, 0.65)";
    ctx.strokeStyle = on ? COL_GOLD : "rgba(232, 176, 75, 0.35)";
    ctx.lineWidth = on ? 2.5 : 1.5;
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = on ? COL_GOLD : COL_TEXT;
    ctx.font = "bold 20px ui-rounded, system-ui, sans-serif";
    ctx.fillText(item.title, r.x + 22, r.y + r.h / 2);
    ctx.fillStyle = COL_TEXT_DIM;
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(item.sub, r.x + r.w - 22, r.y + r.h / 2);
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(
    "↑/↓ pilih · Enter atau klik untuk mulai",
    VIEW_W / 2,
    MENU_TOP + MENU_ITEMS.length * MENU_STEP,
  );
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Arc Entertainment", VIEW_W / 2, VIEW_H - 26);
}

export function drawEnd(
  ctx: CanvasRenderingContext2D,
  won: boolean,
  st: RenderState,
  level: string,
  isLastLevel: boolean,
): void {
  drawScene(ctx, st); // keep the board visible behind the result
  panel(ctx);

  ctx.textAlign = "center";
  ctx.fillStyle = won ? COL_GOLD : COL_RED;
  ctx.font = "bold 48px ui-rounded, system-ui, sans-serif";
  ctx.fillText(won ? "Menang! 🎉" : "Belum berhasil", VIEW_W / 2, VIEW_H / 2 - 70);

  ctx.fillStyle = COL_TEXT;
  ctx.font = "19px ui-rounded, system-ui, sans-serif";
  if (won) {
    ctx.fillText(
      `Level "${level}" tuntas — ${st.pits[PLAYER_STORE]} biji di lumbung.`,
      VIEW_W / 2,
      VIEW_H / 2 - 24,
    );
  } else {
    ctx.fillText(
      `Lumbung: ${st.pits[PLAYER_STORE]} / ${st.target} biji. Coba lagi!`,
      VIEW_W / 2,
      VIEW_H / 2 - 24,
    );
  }

  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 18px ui-rounded, system-ui, sans-serif";
  if (won && !isLastLevel) {
    ctx.fillText("Tekan N untuk level berikutnya · R untuk ulang", VIEW_W / 2, VIEW_H / 2 + 40);
  } else if (won) {
    ctx.fillText("Semua level selesai! Tekan R untuk main lagi", VIEW_W / 2, VIEW_H / 2 + 40);
  } else {
    ctx.fillText("Tekan R untuk ulang", VIEW_W / 2, VIEW_H / 2 + 40);
  }
}
