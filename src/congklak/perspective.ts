/**
 * Two-player perspective hook.
 *
 * The rules engine (`planMove`) is written from ONE point of view: the mover
 * owns the South row (houses 0..6) and the store at index 7, while the opponent
 * owns North (8..14) and store 15. That single-perspective engine is the whole
 * truth of the game — we never want a second copy of those rules for "the other
 * player".
 *
 * Instead we rotate the board. South and North are geometrically identical: a
 * half-turn rotation by 8 cups maps each South cup to the North cup the mirror
 * player would call "their own".
 *
 *     mirrorIndex(i) = (i + 8) % 16
 *
 *   house 0  <-> 8 ,  house 6 <-> 14 ,  store 7 <-> store 15
 *
 * It is its own inverse (mirror twice = identity, because 8 + 8 ≡ 0 mod 16), so
 * the same function un-mirrors. To resolve a North move we: mirror the board so
 * North becomes South, run the ordinary `planMove`, then un-mirror every event
 * index and the final pit array back into the canonical (display) frame. The
 * capture geometry survives the rotation untouched — opposite(i) = 14 - i maps
 * to the correct opposing cup in either frame.
 */

import { Board, MovePlan, SowEvent, planMove } from "./rules";
import { Player } from "./match";

/** Half-turn rotation of a cup index. Self-inverse, so it also un-mirrors. */
export function mirrorIndex(i: number): number {
  return (i + 8) % 16;
}

/** Alias documenting intent at call sites that map results *back* to canonical. */
export const unmirrorIndex = mirrorIndex;

/** A new board seen from the opposite player's seat. Does not mutate `board`. */
export function mirrorBoard(board: Board): Board {
  const pits = new Array<number>(16);
  for (let i = 0; i < 16; i++) pits[i] = board.pits[mirrorIndex(i)];
  return { pits };
}

function unmirrorEvent(ev: SowEvent): SowEvent {
  switch (ev.kind) {
    case "pickup":
    case "drop":
      return { kind: ev.kind, index: unmirrorIndex(ev.index) };
    case "capture":
      return {
        kind: "capture",
        index: unmirrorIndex(ev.index),
        oppositeIndex: unmirrorIndex(ev.oppositeIndex),
        store: unmirrorIndex(ev.store),
        amount: ev.amount,
      };
  }
}

/**
 * Resolve a move for either player, returning a plan in the CANONICAL frame
 * (South = 0..6/7, North = 8..14/15) so the renderer and animation never have
 * to know whose turn it is. `house` is a canonical house index owned by
 * `player`.
 */
export function planMoveForPlayer(
  board: Board,
  player: Player,
  house: number,
): MovePlan {
  if (player === 0) return planMove(board, house);

  // North: rotate into the South seat, resolve, rotate the result back.
  const plan = planMove(mirrorBoard(board), unmirrorIndex(house));
  const finalPits = new Array<number>(16);
  for (let i = 0; i < 16; i++) finalPits[i] = plan.finalPits[mirrorIndex(i)];
  return {
    events: plan.events.map(unmirrorEvent),
    terminal: plan.terminal,
    finalPits,
  };
}
