/**
 * Congklak game scene. One canvas, three modes selected from the title menu:
 *
 *   - "match"  — two humans pass-and-play, OR one human vs a simple AI.
 *   - "puzzle" — the original solo target-score levels.
 *
 * The scene owns all mutable state. Move resolution always goes through the one
 * pure rules engine (`planMove`), reached for North via the mirror hook
 * (`planMoveForPlayer`). Resolved moves are replayed as an animation so players
 * can read the sowing, relays, chains, and captures — identical playback for
 * either side, because event indices are already in the canonical display frame.
 */

import { Board, SowEvent, Terminal, planMove, legalMoves, PLAYER_STORE } from "./rules";
import {
  Player,
  RoundResult,
  chooseAiMove,
  concludeRound,
  createMatchBoard,
  hasMove,
  housesOf,
  legalMovesFor,
  otherPlayer,
  storeOf,
} from "./match";
import { planMoveForPlayer } from "./perspective";
import { PUZZLES, boardForPuzzle, Puzzle } from "./puzzles";
import { pitCenter, houseAt, houseAtAny, VIEW_W, VIEW_H, Point } from "./layout";
import {
  drawScene,
  drawTitle,
  drawEnd,
  drawMatchScene,
  drawMatchEnd,
  titleOptionAt,
  MENU_ITEMS,
  RenderState,
  MatchRenderState,
} from "./render";

type Screen = "title" | "puzzle" | "match";
type PuzzlePhase = "playing" | "animating" | "won" | "lost";
type MatchPhase = "playing" | "animating" | "over";

const STEP_DROP = 0.095;
const STEP_PICKUP = 0.14;
const STEP_CAPTURE = 0.52;
const AI_THINK_DELAY = 0.55; // readable pause before the AI commits a move

interface Anim {
  events: SowEvent[];
  i: number;
  elapsed: number;
  stepDur: number;
  prevIndex: number;
  terminal: Terminal;
  flying: { from: Point; to: Point; t: number } | null;
  handCount: number;
  handIndex: number;
}

export class CongklakGame {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  private screen: Screen = "title";
  private menuSel = 0;

  // Shared board + animation.
  private board: Board = createMatchBoard();
  private anim: Anim | null = null;
  private flash: number[] = [];
  private flashTtl = 0;
  private toast: { text: string; alpha: number; ttl: number } | null = null;
  private hoverHouse = -1;

  // Puzzle mode.
  private puzzlePhase: PuzzlePhase = "playing";
  private levelIndex = 0;
  private puzzle: Puzzle = PUZZLES[0];
  private movesLeft = PUZZLES[0].moves;
  private legal: number[] = [];

  // Match mode.
  private vsAi = false;
  private current: Player = 0;
  private matchPhase: MatchPhase = "playing";
  private matchLegal: number[] = [];
  private roundResult: RoundResult | null = null;
  private aiThinkTtl = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.bindInput();
  }

  // --- mode lifecycle -------------------------------------------------------
  private gotoTitle(): void {
    this.screen = "title";
    this.anim = null;
    this.flash = [];
    this.toast = null;
    this.hoverHouse = -1;
  }

  private startMenuSelection(): void {
    if (this.menuSel === 2) this.startPuzzle();
    else this.startMatch(this.menuSel === 1);
  }

  private startMatch(vsAi: boolean): void {
    this.screen = "match";
    this.vsAi = vsAi;
    this.board = createMatchBoard();
    this.current = 0;
    this.matchPhase = "playing";
    this.matchLegal = legalMovesFor(this.board, 0);
    this.roundResult = null;
    this.anim = null;
    this.flash = [];
    this.toast = null;
    this.hoverHouse = -1;
    this.aiThinkTtl = 0;
  }

  private startPuzzle(): void {
    this.screen = "puzzle";
    this.loadLevel(0);
  }

  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.puzzle = PUZZLES[index];
    this.board = boardForPuzzle(this.puzzle);
    this.movesLeft = this.puzzle.moves;
    this.legal = legalMoves(this.board);
    this.anim = null;
    this.flash = [];
    this.toast = null;
    this.puzzlePhase = "playing";
  }

  // --- input ----------------------------------------------------------------
  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const { x, y } = this.toView(e.clientX, e.clientY);
      if (this.screen === "title") {
        const opt = titleOptionAt(x, y);
        if (opt >= 0) {
          this.menuSel = opt;
          this.startMenuSelection();
        }
        return;
      }
      if (this.screen === "puzzle") this.onPuzzlePointer(x, y);
      else this.onMatchPointer(x, y);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const { x, y } = this.toView(e.clientX, e.clientY);
      if (this.screen === "title") {
        const opt = titleOptionAt(x, y);
        if (opt >= 0) this.menuSel = opt;
        this.hoverHouse = -1;
        return;
      }
      if (this.screen === "puzzle") {
        this.hoverHouse = this.puzzlePhase === "playing" ? houseAt(x, y) : -1;
      } else {
        const h = this.matchPhase === "playing" && this.isHumanTurn() ? houseAtAny(x, y) : -1;
        this.hoverHouse = this.matchLegal.includes(h) ? h : -1;
      }
    });
    this.canvas.addEventListener("pointerleave", () => (this.hoverHouse = -1));

    window.addEventListener("keydown", (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Escape" && this.screen !== "title") {
      this.gotoTitle();
      return;
    }

    if (this.screen === "title") {
      if (e.key === "ArrowDown") {
        this.menuSel = (this.menuSel + 1) % MENU_ITEMS.length;
      } else if (e.key === "ArrowUp") {
        this.menuSel = (this.menuSel - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.startMenuSelection();
      }
      return;
    }

    if (this.screen === "puzzle") {
      this.onPuzzleKey(e);
      return;
    }

    // Match.
    if (e.key === "r" || e.key === "R") {
      this.startMatch(this.vsAi);
      return;
    }
    if (
      this.matchPhase === "playing" &&
      this.isHumanTurn() &&
      e.key >= "1" &&
      e.key <= "7"
    ) {
      const house = housesOf(this.current)[Number(e.key) - 1];
      if (this.matchLegal.includes(house)) this.playMatchMove(house);
    }
  }

  private onPuzzleKey(e: KeyboardEvent): void {
    if (this.puzzlePhase === "playing" && e.key >= "1" && e.key <= "7") {
      const h = Number(e.key) - 1;
      if (this.legal.includes(h)) this.startPuzzleMove(h);
      return;
    }
    if (e.key === "r" || e.key === "R") {
      this.loadLevel(this.levelIndex);
    } else if (
      (e.key === "n" || e.key === "N") &&
      this.puzzlePhase === "won" &&
      this.levelIndex < PUZZLES.length - 1
    ) {
      this.loadLevel(this.levelIndex + 1);
    }
  }

  private onPuzzlePointer(x: number, y: number): void {
    if (this.puzzlePhase === "playing") {
      const h = houseAt(x, y);
      if (h >= 0 && this.legal.includes(h)) this.startPuzzleMove(h);
    } else if (this.puzzlePhase === "won" || this.puzzlePhase === "lost") {
      if (this.puzzlePhase === "won" && this.levelIndex < PUZZLES.length - 1) {
        this.loadLevel(this.levelIndex + 1);
      } else {
        this.loadLevel(this.levelIndex);
      }
    }
  }

  private onMatchPointer(x: number, y: number): void {
    if (this.matchPhase === "playing" && this.isHumanTurn()) {
      const h = houseAtAny(x, y);
      if (this.matchLegal.includes(h)) this.playMatchMove(h);
    }
  }

  private toView(clientX: number, clientY: number): Point {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (VIEW_W / r.width),
      y: (clientY - r.top) * (VIEW_H / r.height),
    };
  }

  private isHumanTurn(): boolean {
    return !this.vsAi || this.current === 0;
  }

  // --- move handling (shared animation core) --------------------------------
  private beginAnim(events: SowEvent[], terminal: Terminal, startHouse: number): void {
    this.anim = {
      events,
      i: 0,
      elapsed: 0,
      stepDur: STEP_PICKUP,
      prevIndex: startHouse,
      terminal,
      flying: null,
      handCount: 0,
      handIndex: startHouse,
    };
    this.hoverHouse = -1;
  }

  private startPuzzleMove(house: number): void {
    const plan = planMove(this.board, house);
    this.beginAnim(plan.events, plan.terminal, house);
    this.puzzlePhase = "animating";
    this.legal = [];
  }

  private playMatchMove(house: number): void {
    const plan = planMoveForPlayer(this.board, this.current, house);
    this.beginAnim(plan.events, plan.terminal, house);
    this.matchPhase = "animating";
    this.matchLegal = [];
  }

  private stepDurationFor(ev: SowEvent): number {
    if (ev.kind === "drop") return STEP_DROP;
    if (ev.kind === "capture") return STEP_CAPTURE;
    return STEP_PICKUP;
  }

  private applyEvent(ev: SowEvent): void {
    const a = this.anim!;
    if (ev.kind === "pickup") {
      a.handCount = this.board.pits[ev.index];
      this.board.pits[ev.index] = 0;
      a.prevIndex = ev.index;
      a.handIndex = ev.index;
      a.flying = null;
    } else if (ev.kind === "drop") {
      this.board.pits[ev.index] += 1;
      a.handCount = Math.max(0, a.handCount - 1);
      a.prevIndex = ev.index;
      a.handIndex = ev.index;
      a.flying = null;
    } else {
      // capture
      this.board.pits[ev.index] = 0;
      this.board.pits[ev.oppositeIndex] = 0;
      this.board.pits[ev.store] += ev.amount;
      this.flash = [ev.index, ev.oppositeIndex];
      this.flashTtl = 0.5;
      this.showToast(`Tembak! +${ev.amount} biji`);
      a.flying = null;
    }
  }

  // --- turn completion ------------------------------------------------------
  private finishPuzzleTurn(): void {
    const terminal = this.anim!.terminal;
    this.anim = null;
    const store = this.board.pits[PLAYER_STORE];

    if (store >= this.puzzle.target) {
      this.puzzlePhase = "won";
      return;
    }
    if (terminal === "chain") {
      this.showToast("Giliran gratis!");
      this.legal = legalMoves(this.board);
      this.puzzlePhase = this.legal.length === 0 ? "lost" : "playing";
      return;
    }
    this.movesLeft -= 1;
    this.legal = legalMoves(this.board);
    this.puzzlePhase = this.movesLeft <= 0 || this.legal.length === 0 ? "lost" : "playing";
  }

  private finishMatchTurn(): void {
    const terminal = this.anim!.terminal;
    this.anim = null;

    const keepTurn = terminal === "chain";
    if (keepTurn && hasMove(this.board, this.current)) {
      // Free turn for the same player.
      if (this.isHumanTurn()) this.showToast("Giliran gratis!");
      this.beginPlayerTurn(this.current);
      return;
    }

    // Otherwise the turn passes (or the chain dead-ends with no seeds).
    const next = otherPlayer(this.current);
    if (!hasMove(this.board, next)) {
      this.concludeMatch();
      return;
    }
    this.beginPlayerTurn(next);
  }

  private beginPlayerTurn(player: Player): void {
    this.current = player;
    this.matchPhase = "playing";
    this.matchLegal = this.isHumanTurn() ? legalMovesFor(this.board, player) : [];
    if (!this.isHumanTurn()) this.aiThinkTtl = AI_THINK_DELAY;
  }

  private concludeMatch(): void {
    this.roundResult = concludeRound(this.board);
    this.board = this.roundResult.board;
    this.matchPhase = "over";
    this.matchLegal = [];
  }

  private showToast(text: string): void {
    this.toast = { text, alpha: 1, ttl: 1.4 };
  }

  // --- loop hooks -----------------------------------------------------------
  update(dt: number): void {
    if (this.flashTtl > 0) {
      this.flashTtl -= dt;
      if (this.flashTtl <= 0) this.flash = [];
    }
    if (this.toast) {
      this.toast.ttl -= dt;
      if (this.toast.ttl < 0.4) this.toast.alpha = Math.max(0, this.toast.ttl / 0.4);
      if (this.toast.ttl <= 0) this.toast = null;
    }

    // AI: after a readable pause, choose and play.
    if (
      this.screen === "match" &&
      this.matchPhase === "playing" &&
      this.vsAi &&
      this.current === 1
    ) {
      this.aiThinkTtl -= dt;
      if (this.aiThinkTtl <= 0) {
        const move = chooseAiMove(this.board, 1);
        if (move === null) this.concludeMatch();
        else this.playMatchMove(move);
      }
    }

    if (!this.anim) return;
    const a = this.anim;
    if (a.i >= a.events.length) {
      if (this.screen === "puzzle") this.finishPuzzleTurn();
      else this.finishMatchTurn();
      return;
    }

    const ev = a.events[a.i];
    a.stepDur = this.stepDurationFor(ev);
    a.elapsed += dt;
    const t = Math.min(1, a.elapsed / a.stepDur);

    if (ev.kind === "drop") {
      a.flying = { from: pitCenter(a.prevIndex), to: pitCenter(ev.index), t };
    } else {
      a.flying = null;
    }

    if (a.elapsed >= a.stepDur) {
      this.applyEvent(ev);
      a.i += 1;
      a.elapsed = 0;
    }
  }

  render(_alpha: number): void {
    if (this.screen === "title") {
      drawTitle(this.ctx, this.menuSel);
      return;
    }
    if (this.screen === "puzzle") {
      const st = this.buildPuzzleState();
      if (this.puzzlePhase === "won" || this.puzzlePhase === "lost") {
        drawEnd(
          this.ctx,
          this.puzzlePhase === "won",
          st,
          this.puzzle.name,
          this.levelIndex >= PUZZLES.length - 1,
        );
      } else {
        drawScene(this.ctx, st);
      }
      return;
    }

    // Match.
    const st = this.buildMatchState();
    if (this.matchPhase === "over") {
      drawMatchEnd(this.ctx, st, this.roundResult?.winner ?? null);
    } else {
      drawMatchScene(this.ctx, st);
    }
  }

  private buildPuzzleState(): RenderState {
    return {
      pits: this.board.pits,
      legal: this.puzzlePhase === "playing" ? this.legal : [],
      hoverHouse: this.hoverHouse,
      flash: this.flash,
      flying: this.anim?.flying ?? null,
      hand:
        this.anim && this.anim.handCount > 0
          ? { index: this.anim.handIndex, count: this.anim.handCount }
          : null,
      activeStores: [PLAYER_STORE],
      southLabel: "Lumbung-mu",
      northLabel: "Lumbung lawan",
      level: this.puzzle.name,
      target: this.puzzle.target,
      movesLeft: this.movesLeft,
      toast: this.toast ? { text: this.toast.text, alpha: this.toast.alpha } : null,
    };
  }

  private buildMatchState(): MatchRenderState {
    const south = this.board.pits[PLAYER_STORE];
    const north = this.board.pits[storeOf(1)];
    let turnText: string;
    if (this.vsAi) {
      turnText = this.current === 0 ? "Giliranmu (bawah)" : "AI berpikir…";
    } else {
      turnText = this.current === 0 ? "Giliran Selatan (bawah)" : "Giliran Utara (atas)";
    }
    return {
      pits: this.board.pits,
      legal: this.matchLegal,
      hoverHouse: this.hoverHouse,
      flash: this.flash,
      flying: this.anim?.flying ?? null,
      hand:
        this.anim && this.anim.handCount > 0
          ? { index: this.anim.handIndex, count: this.anim.handCount }
          : null,
      activeStores: [storeOf(this.current)],
      southLabel: this.vsAi ? "Lumbung-mu" : "Pemain Selatan",
      northLabel: this.vsAi ? "Lumbung AI" : "Pemain Utara",
      turnText,
      southScore: south,
      northScore: north,
      vsAi: this.vsAi,
      toast: this.toast ? { text: this.toast.text, alpha: this.toast.alpha } : null,
    };
  }
}
