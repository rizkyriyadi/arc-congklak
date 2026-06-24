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

export interface RenderState {
  pits: number[];
  legal: number[];
  hoverHouse: number; // -1 if none
  /** Pits to pulse this frame (capture flash). */
  flash: number[];
  /** A seed mid-flight between two pits, or null. */
  flying: { from: Point; to: Point; t: number } | null;
  /** Seeds still in hand during a sow segment (shown near active pit). */
  hand: { index: number; count: number } | null;
  level: string;
  target: number;
  movesLeft: number;
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

export function drawScene(ctx: CanvasRenderingContext2D, st: RenderState): void {
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

    const isPlayer = i <= 6;
    const legal = st.legal.includes(i);
    const hovered = st.hoverHouse === i;

    // Legal-move and hover affordances (player side only).
    if (isPlayer && legal) {
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

  // Store counts (big).
  for (const store of [PLAYER_STORE, OPP_STORE]) {
    const c = pitCenter(store);
    ctx.fillStyle = store === PLAYER_STORE ? COL_GOLD : COL_TEXT_DIM;
    ctx.font = "bold 30px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(st.pits[store]), c.x, c.y + STORE_RY + 24);
  }

  // Side labels.
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.textAlign = "center";
  ctx.fillText("Lumbung-mu", pitCenter(PLAYER_STORE).x, pitCenter(PLAYER_STORE).y - STORE_RY - 16);
  ctx.fillText("Lumbung lawan", pitCenter(OPP_STORE).x, pitCenter(OPP_STORE).y - STORE_RY - 16);
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.fillText("◄ rumahmu — tekan 1–7 atau klik ►", VIEW_W / 2, VIEW_H - 18);

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

  // HUD bar.
  drawHud(ctx, st);

  // Toast (free turn / capture messages).
  if (st.toast && st.toast.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = st.toast.alpha;
    ctx.fillStyle = "rgba(20,12,6,0.82)";
    ctx.strokeStyle = COL_GOLD;
    ctx.lineWidth = 2;
    const w = ctx.measureText(st.toast.text).width;
    roundRect(ctx, VIEW_W / 2 - w / 2 - 26, 92, w + 52, 40, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COL_GOLD;
    ctx.font = "bold 20px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(st.toast.text, VIEW_W / 2, 113);
    ctx.restore();
  }
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

export function drawTitle(ctx: CanvasRenderingContext2D): void {
  const bg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  bg.addColorStop(0, COL_BG_TOP);
  bg.addColorStop(1, COL_BG_BOT);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  panel(ctx);

  ctx.textAlign = "center";
  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 56px ui-rounded, system-ui, sans-serif";
  ctx.fillText("Congklak", VIEW_W / 2, VIEW_H / 2 - 110);
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.font = "17px system-ui, sans-serif";
  ctx.fillText("dakon — permainan biji tradisional Nusantara", VIEW_W / 2, VIEW_H / 2 - 78);

  ctx.fillStyle = COL_TEXT;
  ctx.font = "15px ui-rounded, system-ui, sans-serif";
  const rules = [
    "Pilih satu rumahmu — bijinya disebar satu per lubang, berlawanan arah jarum jam.",
    "Biji terakhir jatuh di lumbungmu → giliran gratis (rantai!).",
    "Berakhir di rumah kosong milikmu → tembak biji seberang ke lumbung.",
    "Kumpulkan biji target sebelum langkahmu habis.",
  ];
  rules.forEach((line, i) => {
    ctx.fillText(line, VIEW_W / 2, VIEW_H / 2 - 36 + i * 26);
  });

  ctx.fillStyle = COL_GOLD;
  ctx.font = "bold 20px ui-rounded, system-ui, sans-serif";
  ctx.fillText("Klik atau tekan Spasi untuk mulai", VIEW_W / 2, VIEW_H / 2 + 120);
  ctx.fillStyle = COL_TEXT_DIM;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Arc Entertainment", VIEW_W / 2, VIEW_H / 2 + 156);
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
