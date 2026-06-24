/**
 * Two-player Congklak match: pure state + rules orchestration on top of the
 * single-perspective engine (`planMove`) via the mirror hook (`perspective.ts`).
 * No DOM, no animation — the scene drives the animation; this module only knows
 * the truth of the position.
 *
 * Players: 0 = South (the bottom row, store 7), 1 = North (top row, store 15).
 *
 * A full round of traditional congklak:
 *   - Players alternate turns. A turn that ends in your own lumbung (a "chain")
 *     grants a free turn — the SAME player moves again.
 *   - The round ends when the player whose turn it is has no seed to sow. The
 *     remaining seeds on the board are then raked into their owners' lumbung
 *     ("borong"), and whoever's lumbung holds more biji wins.
 */

import {
  Board,
  cloneBoard,
  PLAYER_STORE,
  OPP_STORE,
} from "./rules";
import { planMoveForPlayer } from "./perspective";

export type Player = 0 | 1;

export function otherPlayer(p: Player): Player {
  return p === 0 ? 1 : 0;
}

/** The lumbung (store) cup belonging to a player. */
export function storeOf(p: Player): number {
  return p === 0 ? PLAYER_STORE : OPP_STORE;
}

/** The seven house indices a player may sow from. */
export function housesOf(p: Player): number[] {
  return p === 0 ? [0, 1, 2, 3, 4, 5, 6] : [8, 9, 10, 11, 12, 13, 14];
}

/** Non-empty houses `player` may legally start a move from (canonical indices). */
export function legalMovesFor(board: Board, player: Player): number[] {
  return housesOf(player).filter((i) => board.pits[i] > 0);
}

export function hasMove(board: Board, player: Player): boolean {
  return housesOf(player).some((i) => board.pits[i] > 0);
}

/** Total seeds across the whole board — invariant under any legal play (98 at start). */
export function totalSeeds(board: Board): number {
  return board.pits.reduce((a, c) => a + c, 0);
}

/** A fresh duel board: 7 seeds in every one of the fourteen houses. */
export function createMatchBoard(seedsPerHouse = 7): Board {
  const pits = new Array<number>(16).fill(0);
  for (const i of [...housesOf(0), ...housesOf(1)]) pits[i] = seedsPerHouse;
  return { pits };
}

export interface RoundResult {
  /** Board after raking leftover seeds into each side's lumbung. */
  board: Board;
  southScore: number;
  northScore: number;
  /** Winner, or null on a draw. */
  winner: Player | null;
}

/**
 * Conclude the round: each side's leftover house seeds go to that side's
 * lumbung, then compare. Pure.
 */
export function concludeRound(board: Board): RoundResult {
  const final = cloneBoard(board);
  for (const p of [0, 1] as Player[]) {
    const store = storeOf(p);
    for (const h of housesOf(p)) {
      final.pits[store] += final.pits[h];
      final.pits[h] = 0;
    }
  }
  const southScore = final.pits[PLAYER_STORE];
  const northScore = final.pits[OPP_STORE];
  const winner: Player | null =
    southScore === northScore ? null : southScore > northScore ? 0 : 1;
  return { board: final, southScore, northScore, winner };
}

// --- AI ---------------------------------------------------------------------

/** Position value from `player`'s seat: own lumbung minus opponent's. */
function evalBoard(board: Board, player: Player): number {
  return board.pits[storeOf(player)] - board.pits[storeOf(otherPlayer(player))];
}

/**
 * Greedy value of a single move including the free-turn chain it sets up.
 * If a move grants another turn, we follow the best continuation greedily so
 * the AI is rewarded for building long chains (the real skill in congklak),
 * without a full search tree. Returns the resulting board value to `player`.
 */
function moveValue(board: Board, player: Player, house: number): number {
  let b = board;
  let h: number | null = house;
  let guard = 0;
  // Walk this player's chain: a chain keeps the turn, so keep choosing the
  // best free-turn move; stop when the turn would pass to the opponent.
  while (h !== null && guard++ < 64) {
    const plan = planMoveForPlayer(b, player, h);
    b = { pits: plan.finalPits };
    if (plan.terminal !== "chain") break;
    // Free turn: greedily pick the best next house in this chain.
    const next = legalMovesFor(b, player);
    if (next.length === 0) break;
    let bestH = next[0];
    let bestV = -Infinity;
    for (const cand of next) {
      const v = planMoveForPlayer(b, player, cand).finalPits[storeOf(player)];
      if (v > bestV) {
        bestV = v;
        bestH = cand;
      }
    }
    h = bestH;
  }
  // Small extra weight for ending the sequence having just earned the move,
  // i.e. material is what matters most.
  return evalBoard(b, player);
}

/**
 * Choose a move for `player`. Greedy with one-ply chain follow-through — plenty
 * for a satisfying v1 opponent. Deterministic given the board (we break ties by
 * lowest house index) so behaviour is reproducible and testable.
 */
export function chooseAiMove(board: Board, player: Player): number | null {
  const moves = legalMovesFor(board, player);
  if (moves.length === 0) return null;
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves) {
    const v = moveValue(board, player, m);
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}
