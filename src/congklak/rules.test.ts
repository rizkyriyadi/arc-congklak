/**
 * Lightweight assertion-based checks for the rules engine. No test framework —
 * run with `node src/congklak/rules.test.ts` (Node strips the types). Exits
 * non-zero on first failure so it doubles as a CI smoke check.
 */

import {
  Board,
  planMove,
  opposite,
  nextIndex,
  legalMoves,
  PLAYER_STORE,
} from "./rules";

let passed = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  passed++;
}

function b(pits: number[]): Board {
  return { pits: pits.slice() };
}

// --- geometry ---------------------------------------------------------------
assert(opposite(0) === 14, "opposite(0)=14");
assert(opposite(6) === 8, "opposite(6)=8");
assert(nextIndex(6) === 7, "after last player house comes the lumbung");
assert(nextIndex(7) === 8, "after lumbung comes first opp house");
assert(nextIndex(14) === 0, "after last opp house, skip opp store back to 0");

// --- legal moves ------------------------------------------------------------
assert(
  JSON.stringify(legalMoves(b([0, 2, 0, 1, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]))) ===
    JSON.stringify([1, 3, 6]),
  "legalMoves lists only non-empty player houses",
);

// --- simple sow, no chain/capture (lands in opp empty pit) ------------------
{
  // One seed in house 6 -> drops into lumbung [7] -> chain.
  const plan = planMove(b([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 6);
  assert(plan.terminal === "chain", "last seed in lumbung => chain");
  assert(plan.finalPits[PLAYER_STORE] === 1, "lumbung holds the sown seed");
}

// --- chain: last seed lands exactly in own store ----------------------------
{
  // House 5 has 2 seeds -> drops into 6 then 7(lumbung) -> chain.
  const plan = planMove(b([0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 5);
  assert(plan.terminal === "chain", "2 from house5 ends in lumbung => chain");
  assert(plan.finalPits[6] === 1 && plan.finalPits[7] === 1, "seeded 6 and lumbung");
}

// --- capture: last seed lands in own empty pit, opposite has seeds -----------
{
  // House 0 has 1 seed -> lands in empty house 1; opposite of 1 is 13.
  const pits = new Array(16).fill(0);
  pits[0] = 1; // will move to house 1
  pits[13] = 5; // opposite of house 1
  const plan = planMove(b(pits), 0);
  assert(plan.terminal === "capture", "empty own pit with loaded opposite => capture");
  // captured = own landing seed (1) + opposite (5) = 6
  assert(plan.finalPits[PLAYER_STORE] === 6, "captured 6 into lumbung");
  assert(plan.finalPits[1] === 0 && plan.finalPits[13] === 0, "both pits emptied");
}

// --- no capture when opposite is empty --------------------------------------
{
  const pits = new Array(16).fill(0);
  pits[0] = 1; // lands in empty house 1, opposite 13 empty
  const plan = planMove(b(pits), 0);
  assert(plan.terminal === "end", "empty own pit, empty opposite => plain end");
  assert(plan.finalPits[1] === 1, "the seed stays in the landing pit");
}

// --- relay: last seed lands in a non-empty pit and keeps going ---------------
{
  // House 0 has 2 seeds -> 1,2. House 2 already had 1, so landing in 2 (now 2)
  // relays: scoop 2 and continue to 3,4.
  const pits = new Array(16).fill(0);
  pits[0] = 2;
  pits[2] = 1;
  const plan = planMove(b(pits), 0);
  // Expect more drops than the initial 2 because of the relay.
  const drops = plan.events.filter((e) => e.kind === "drop").length;
  assert(drops === 4, `relay continued sowing (got ${drops} drops, want 4)`);
  assert(plan.finalPits[3] === 1 && plan.finalPits[4] === 1, "relay seeded 3 and 4");
}

// --- conservation: no seed is ever created or destroyed ---------------------
{
  const pits = [4, 0, 3, 1, 2, 5, 2, 0, 1, 6, 0, 2, 3, 1, 4, 0];
  const before = pits.reduce((a, c) => a + c, 0);
  const plan = planMove(b(pits), 0);
  const after = plan.finalPits.reduce((a, c) => a + c, 0);
  assert(before === after, `seed conservation (${before} -> ${after})`);
}

console.log(`OK — ${passed} assertions passed`);
