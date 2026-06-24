/**
 * Assertion checks for the 2-player layer: the mirror hook, match endgame, and
 * AI. No framework — run via `npm run test:match`. Exits non-zero on first
 * failure so it doubles as a CI smoke check.
 */

import { Board, planMove, PLAYER_STORE, OPP_STORE } from "./rules";
import { mirrorIndex, mirrorBoard, planMoveForPlayer } from "./perspective";
import {
  Player,
  chooseAiMove,
  concludeRound,
  createMatchBoard,
  hasMove,
  housesOf,
  legalMovesFor,
  otherPlayer,
  storeOf,
  totalSeeds,
} from "./match";

let passed = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  passed++;
}
const b = (pits: number[]): Board => ({ pits: pits.slice() });

// --- mirror is a self-inverse rotation by 8 --------------------------------
for (let i = 0; i < 16; i++) {
  assert(mirrorIndex(mirrorIndex(i)) === i, `mirrorIndex involution @${i}`);
}
assert(mirrorIndex(0) === 8 && mirrorIndex(6) === 14, "houses map across rows");
assert(
  mirrorIndex(PLAYER_STORE) === OPP_STORE && mirrorIndex(OPP_STORE) === PLAYER_STORE,
  "stores swap under mirror",
);

// mirrorBoard swaps the two seats but conserves seeds.
{
  const board = createMatchBoard();
  const m = mirrorBoard(board);
  assert(totalSeeds(m) === totalSeeds(board), "mirrorBoard conserves seeds");
  assert(m.pits[0] === board.pits[8] && m.pits[7] === board.pits[15], "seats swapped");
}

// --- North move via mirror == South move on the mirrored board -------------
{
  // A North house with one seed lands in North's lumbung (15) -> chain.
  const board = new Array(16).fill(0);
  board[14] = 1; // North's house nearest its store
  const plan = planMoveForPlayer(b(board), 1, 14);
  assert(plan.terminal === "chain", "North seed into its lumbung => chain");
  assert(plan.finalPits[OPP_STORE] === 1, "landed in North store (15)");
  assert(plan.finalPits[PLAYER_STORE] === 0, "South store untouched");
}

// North capture mirrors South capture geometry.
{
  // North house 8 has 1 seed -> lands in empty North house 9; opposite of 9 is 5.
  const pits = new Array(16).fill(0);
  pits[8] = 1;
  pits[5] = 4; // opposite(9) == 5 holds seeds to be shot
  const plan = planMoveForPlayer(b(pits), 1, 8);
  assert(plan.terminal === "capture", "North landing empty own pit captures");
  assert(plan.finalPits[OPP_STORE] === 5, "captured 1+4 into North store");
  assert(plan.finalPits[9] === 0 && plan.finalPits[5] === 0, "both pits emptied");
}

// Equivalence: planning for North == mirroring, planning as South, unmirroring.
{
  const pits = [4, 0, 3, 1, 2, 5, 2, 0, 1, 6, 0, 2, 3, 1, 4, 0];
  const viaPlayer = planMoveForPlayer(b(pits), 1, 9);
  const viaManual = planMove(mirrorBoard(b(pits)), mirrorIndex(9));
  // unmirror manual finalPits
  const unmirrored = new Array(16);
  for (let i = 0; i < 16; i++) unmirrored[i] = viaManual.finalPits[mirrorIndex(i)];
  assert(
    JSON.stringify(viaPlayer.finalPits) === JSON.stringify(unmirrored),
    "planMoveForPlayer(North) == manual mirror/unmirror",
  );
}

// --- match helpers ----------------------------------------------------------
assert(otherPlayer(0) === 1 && otherPlayer(1) === 0, "otherPlayer flips");
assert(storeOf(0) === 7 && storeOf(1) === 15, "store indices");
assert(JSON.stringify(housesOf(1)) === JSON.stringify([8, 9, 10, 11, 12, 13, 14]), "north houses");
{
  const board = createMatchBoard();
  assert(totalSeeds(board) === 98, "fresh duel board has 98 seeds (7*14)");
  assert(legalMovesFor(board, 0).length === 7, "all South houses playable at start");
}

// --- endgame sweep ----------------------------------------------------------
{
  // South side empty, North still holds seeds: round over for South to move.
  const pits = new Array(16).fill(0);
  pits[PLAYER_STORE] = 30;
  pits[OPP_STORE] = 20;
  pits[10] = 6; // North leftover
  pits[12] = 4;
  const board = b(pits);
  assert(!hasMove(board, 0), "South cannot move (all houses empty)");
  const res = concludeRound(board);
  assert(res.southScore === 30, "South keeps its store");
  assert(res.northScore === 30, "North rakes 20+6+4 = 30");
  assert(res.winner === null, "30-30 is a draw");
  assert(totalSeeds(res.board) === totalSeeds(board), "sweep conserves seeds");
}
{
  const pits = new Array(16).fill(0);
  pits[PLAYER_STORE] = 52;
  pits[OPP_STORE] = 40;
  pits[3] = 6;
  const res = concludeRound(b(pits));
  assert(res.southScore === 58 && res.winner === 0, "South wins after raking own leftovers");
}

// --- AI sanity: legal, deterministic, takes the obvious win -----------------
{
  const board = createMatchBoard();
  const m = chooseAiMove(board, 1);
  assert(m !== null && housesOf(1).includes(m), "AI picks a legal North house");
  assert(chooseAiMove(board, 1) === m, "AI is deterministic on equal board");
}
{
  // A free seed into the store should be irresistible vs a wasteful spill.
  const pits = new Array(16).fill(0);
  pits[14] = 1; // one seed -> straight into North store (chain, +1)
  pits[8] = 1; // one seed -> dribbles into a house, no score
  const m = chooseAiMove(b(pits), 1);
  assert(m === 14, "AI prefers the scoring/free-turn move");
}

// --- full self-play match conserves seeds & terminates ----------------------
{
  let board = createMatchBoard();
  let current: Player = 0;
  let turns = 0;
  while (hasMove(board, current) && turns < 5000) {
    const move = chooseAiMove(board, current)!;
    const plan = planMoveForPlayer(board, current, move);
    board = { pits: plan.finalPits };
    assert(totalSeeds(board) === 98, `seeds conserved mid-match (turn ${turns})`);
    if (plan.terminal !== "chain") current = otherPlayer(current);
    turns++;
  }
  assert(turns < 5000, "self-play match terminates");
  const res = concludeRound(board);
  assert(res.southScore + res.northScore === 98, "final scores sum to all 98 seeds");
}

console.log(`OK — ${passed} match assertions passed`);
