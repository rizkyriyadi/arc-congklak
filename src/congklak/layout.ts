/**
 * Screen geometry for the board. Pure positioning — no drawing — so both the
 * renderer and the input hit-testing share one source of truth.
 *
 * Columns line up vertically: South house at column `j` (index j) sits directly
 * below North house index `14 - j`, which is exactly the capture relationship.
 */

import { PIT_COUNT, PLAYER_STORE, OPP_STORE } from "./rules";

export const VIEW_W = 960;
export const VIEW_H = 600;

export interface Point {
  x: number;
  y: number;
}

const TOP_Y = 212;
const BOTTOM_Y = 388;
const COL_LEFT = 206;
const COL_RIGHT = 754;
const COL_STEP = (COL_RIGHT - COL_LEFT) / 6;

export const HOUSE_RADIUS = 44;
export const STORE_RX = 56;
export const STORE_RY = 150;

const LEFT_STORE: Point = { x: 96, y: 300 }; // opponent lumbung [15]
const RIGHT_STORE: Point = { x: 864, y: 300 }; // player lumbung [7]

/** Pixel centre of any cup index. */
export function pitCenter(i: number): Point {
  if (i === PLAYER_STORE) return RIGHT_STORE;
  if (i === OPP_STORE) return LEFT_STORE;
  if (i >= 0 && i <= 6) {
    // South row, left -> right.
    return { x: COL_LEFT + i * COL_STEP, y: BOTTOM_Y };
  }
  // North row: index 14 is leftmost column, 8 is rightmost.
  const col = 14 - i; // 0..6 left -> right
  return { x: COL_LEFT + col * COL_STEP, y: TOP_Y };
}

export const isStore = (i: number): boolean =>
  i === PLAYER_STORE || i === OPP_STORE;

/**
 * Hit-test a point (in view coordinates) against the player's seven houses.
 * Returns the pit index 0..6, or -1 if none is close enough.
 */
export function houseAt(x: number, y: number): number {
  for (let i = 0; i <= 6; i++) {
    const c = pitCenter(i);
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy <= (HOUSE_RADIUS + 8) * (HOUSE_RADIUS + 8)) return i;
  }
  return -1;
}

export const ALL_INDICES = Array.from({ length: PIT_COUNT }, (_, i) => i);
