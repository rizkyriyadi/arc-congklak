/**
 * Congklak (dakon) rules engine — pure game logic, no DOM.
 *
 * This is the authentic traditional ruleset, not a simplification:
 *   - Sow seeds (biji) one per pit, counter-clockwise.
 *   - Landing the last seed in your own store (lumbung) earns a free turn (chain).
 *   - Landing in a NON-empty pit picks those seeds up and keeps sowing (the
 *     "menyebar / relay" continuation that gives congklak its long, satisfying runs).
 *   - Landing the last seed in an EMPTY pit on YOUR OWN side captures that seed
 *     plus every seed in the pit directly opposite (menembak / "shooting").
 *   - Landing in an empty pit elsewhere simply ends the turn.
 *
 * Board index layout (single-player perspective — the human owns the South side):
 *
 *        opp store        North houses (right -> left in sow order)
 *          [15]   <- 14 13 12 11 10  9  8
 *                    0  1  2  3  4  5  6 ->   [7]   player store (lumbung)
 *                 South houses (left -> right)
 *
 * Sow order is 0,1,...,6,7,8,...,14 then back to 0, skipping the opponent's
 * store [15] (you never seed an opponent's lumbung). Pit `i` on the South row
 * (0..6) sits directly opposite North pit `14 - i`.
 */

export const HOUSES_PER_SIDE = 7;
export const PLAYER_STORE = 7;
export const OPP_STORE = 15;
export const PIT_COUNT = 16;

export type PitIndex = number;

export interface Board {
  /** Seed counts for all 16 cups, indexed as described above. */
  pits: number[];
}

/** True for the human player's seven playable houses. */
export function isPlayerHouse(i: PitIndex): boolean {
  return i >= 0 && i <= 6;
}

/** True for the opponent's seven houses. */
export function isOppHouse(i: PitIndex): boolean {
  return i >= 8 && i <= 14;
}

/** The North house sitting directly across from a South house. */
export function opposite(i: PitIndex): PitIndex {
  return 14 - i;
}

/** Next cup in sow order from the player's perspective (skips the opponent store). */
export function nextIndex(i: PitIndex): PitIndex {
  let n = (i + 1) % PIT_COUNT;
  if (n === OPP_STORE) n = 0;
  return n;
}

export function createBoard(seedsPerHouse: number): Board {
  const pits = new Array<number>(PIT_COUNT).fill(0);
  for (let i = 0; i < PIT_COUNT; i++) {
    if (isPlayerHouse(i) || isOppHouse(i)) pits[i] = seedsPerHouse;
  }
  return { pits };
}

export function cloneBoard(board: Board): Board {
  return { pits: board.pits.slice() };
}

/** A house the player may legally start a move from: on their side and non-empty. */
export function legalMoves(board: Board): PitIndex[] {
  const moves: PitIndex[] = [];
  for (let i = 0; i <= 6; i++) {
    if (board.pits[i] > 0) moves.push(i);
  }
  return moves;
}

export function hasLegalMove(board: Board): boolean {
  return legalMoves(board).length > 0;
}

/** How the turn resolved, for UI feedback. */
export type Terminal = "chain" | "capture" | "end";

/**
 * Ordered animation events emitted while resolving a move. The game scene
 * applies these to the live board one at a time so the player watches the
 * seeds travel, relay, and get captured.
 */
export type SowEvent =
  | { kind: "pickup"; index: PitIndex }
  | { kind: "drop"; index: PitIndex }
  | {
      kind: "capture";
      /** The own empty pit the last seed landed in. */
      index: PitIndex;
      /** The opponent pit whose seeds are scooped. */
      oppositeIndex: PitIndex;
      store: PitIndex;
      amount: number;
    };

export interface MovePlan {
  events: SowEvent[];
  terminal: Terminal;
  /** Final board state after the whole move resolves. */
  finalPits: number[];
}

/**
 * Resolve a full move starting from `startHouse` (which must be a non-empty
 * player house). Pure: it does not mutate `board`. Returns the ordered events
 * for animation plus the resulting pit counts.
 */
export function planMove(board: Board, startHouse: PitIndex): MovePlan {
  if (!isPlayerHouse(startHouse) || board.pits[startHouse] === 0) {
    throw new Error(`Illegal move from pit ${startHouse}`);
  }

  const pits = board.pits.slice();
  const events: SowEvent[] = [];

  let current = startHouse;
  let hand = pits[current];
  pits[current] = 0;
  events.push({ kind: "pickup", index: current });

  let terminal: Terminal = "end";
  // Safety bound: circulating seeds strictly decrease each lap (one falls into
  // the store), so this always terminates well within the cap.
  let guard = 0;
  const GUARD_LIMIT = 100000;

  // Outer loop runs once per relay segment.
  while (guard++ < GUARD_LIMIT) {
    let last = current;
    while (hand > 0) {
      current = nextIndex(current);
      pits[current] += 1;
      hand -= 1;
      events.push({ kind: "drop", index: current });
      last = current;
    }

    if (last === PLAYER_STORE) {
      terminal = "chain";
      break;
    }

    // Last seed landed in a house. If that house now holds more than the seed
    // we just dropped, it was non-empty -> relay: scoop and keep sowing.
    if (pits[last] > 1) {
      hand = pits[last];
      pits[last] = 0;
      events.push({ kind: "pickup", index: last });
      current = last;
      continue;
    }

    // Landed in a previously-empty house -> turn ends here, maybe with a capture.
    if (isPlayerHouse(last)) {
      const opp = opposite(last);
      if (pits[opp] > 0) {
        const amount = pits[opp] + pits[last];
        events.push({
          kind: "capture",
          index: last,
          oppositeIndex: opp,
          store: PLAYER_STORE,
          amount,
        });
        pits[PLAYER_STORE] += amount;
        pits[opp] = 0;
        pits[last] = 0;
        terminal = "capture";
      } else {
        terminal = "end";
      }
    } else {
      terminal = "end";
    }
    break;
  }

  return { events, terminal, finalPits: pits };
}
