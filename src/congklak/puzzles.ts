/**
 * Solo puzzle levels for the vertical slice.
 *
 * Each level is a hand-authored board plus a goal: funnel `target` biji into
 * your lumbung within `moves` turns. Only the player sows (no opponent), so the
 * whole board is your sandbox — chains and captures are how you reach the goal.
 * A chained free turn (last seed in your lumbung) does NOT spend a move, so
 * setting up chains is the core skill.
 */

import { Board } from "./rules";

export interface Puzzle {
  id: number;
  name: string;
  /** Short Indonesian-flavoured flavour line shown under the title. */
  hint: string;
  target: number;
  moves: number;
  /** Initial seed counts: 7 player houses, then 7 opponent houses. */
  playerHouses: number[];
  oppHouses: number[];
}

export const PUZZLES: Puzzle[] = [
  {
    id: 1,
    name: "Panen Pertama",
    hint: "Akhiri di lumbung untuk giliran gratis. Kumpulkan 10 biji.",
    target: 10,
    moves: 6,
    playerHouses: [3, 3, 3, 3, 3, 3, 3],
    oppHouses: [2, 2, 2, 2, 2, 2, 2],
  },
  {
    id: 2,
    name: "Tembak Seberang",
    hint: "Mendarat di rumah kosong sisimu untuk menembak biji seberang.",
    target: 16,
    moves: 7,
    playerHouses: [2, 4, 0, 5, 1, 3, 4],
    oppHouses: [4, 3, 4, 3, 4, 3, 4],
  },
  {
    id: 3,
    name: "Rantai Panjang",
    hint: "Rangkai giliran gratis. Penuhi lumbung: 24 biji.",
    target: 24,
    moves: 8,
    playerHouses: [5, 4, 5, 4, 5, 4, 5],
    oppHouses: [3, 3, 3, 3, 3, 3, 3],
  },
];

export function boardForPuzzle(p: Puzzle): Board {
  const pits = new Array<number>(16).fill(0);
  for (let i = 0; i < 7; i++) pits[i] = p.playerHouses[i];
  for (let i = 0; i < 7; i++) pits[8 + i] = p.oppHouses[i];
  return { pits };
}
