/**
 * Congklak game scene: title -> playing -> (animating) -> won/lose, with
 * restart and level progression. Plugs into the fixed-timestep loop via
 * `update(dt)` / `render(alpha)`.
 *
 * The scene owns all mutable state. Move resolution is delegated to the pure
 * rules engine (`planMove`), and the resulting event list is played back as an
 * animation so the player can read the sowing, relays, chains, and captures.
 */

import {
  Board,
  SowEvent,
  Terminal,
  planMove,
  legalMoves,
  PLAYER_STORE,
} from "./rules";
import { PUZZLES, boardForPuzzle, Puzzle } from "./puzzles";
import { pitCenter, houseAt, VIEW_W, VIEW_H, Point } from "./layout";
import { drawScene, drawTitle, drawEnd, RenderState } from "./render";

type Mode = "title" | "playing" | "animating" | "won" | "lost";

const STEP_DROP = 0.095;
const STEP_PICKUP = 0.14;
const STEP_CAPTURE = 0.52;

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

  private mode: Mode = "title";
  private levelIndex = 0;
  private puzzle: Puzzle = PUZZLES[0];
  private board: Board = boardForPuzzle(PUZZLES[0]);
  private legal: number[] = [];
  private movesLeft = PUZZLES[0].moves;

  private anim: Anim | null = null;
  private flash: number[] = [];
  private flashTtl = 0;
  private toast: { text: string; alpha: number; ttl: number } | null = null;
  private hoverHouse = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.bindInput();
  }

  // --- level lifecycle ------------------------------------------------------
  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.puzzle = PUZZLES[index];
    this.board = boardForPuzzle(this.puzzle);
    this.movesLeft = this.puzzle.moves;
    this.legal = legalMoves(this.board);
    this.anim = null;
    this.flash = [];
    this.toast = null;
    this.mode = "playing";
  }

  private startGame(): void {
    this.loadLevel(0);
  }

  // --- input ----------------------------------------------------------------
  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const { x, y } = this.toView(e.clientX, e.clientY);
      if (this.mode === "title") {
        this.startGame();
        return;
      }
      if (this.mode === "playing") {
        const h = houseAt(x, y);
        if (h >= 0 && this.legal.includes(h)) this.tryMove(h);
      } else if (this.mode === "won" || this.mode === "lost") {
        // Click acts as the obvious "continue": next level on a win, else retry.
        if (this.mode === "won" && this.levelIndex < PUZZLES.length - 1) {
          this.loadLevel(this.levelIndex + 1);
        } else {
          this.loadLevel(this.levelIndex);
        }
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const { x, y } = this.toView(e.clientX, e.clientY);
      this.hoverHouse = this.mode === "playing" ? houseAt(x, y) : -1;
    });
    this.canvas.addEventListener("pointerleave", () => (this.hoverHouse = -1));

    window.addEventListener("keydown", (e) => {
      if (this.mode === "title") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          this.startGame();
        }
        return;
      }
      if (this.mode === "playing" && e.key >= "1" && e.key <= "7") {
        const h = Number(e.key) - 1;
        if (this.legal.includes(h)) this.tryMove(h);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        this.loadLevel(this.levelIndex);
      } else if (
        (e.key === "n" || e.key === "N") &&
        this.mode === "won" &&
        this.levelIndex < PUZZLES.length - 1
      ) {
        this.loadLevel(this.levelIndex + 1);
      }
    });
  }

  private toView(clientX: number, clientY: number): Point {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (VIEW_W / r.width),
      y: (clientY - r.top) * (VIEW_H / r.height),
    };
  }

  // --- move handling --------------------------------------------------------
  private tryMove(house: number): void {
    const plan = planMove(this.board, house);
    this.anim = {
      events: plan.events,
      i: 0,
      elapsed: 0,
      stepDur: STEP_PICKUP,
      prevIndex: house,
      terminal: plan.terminal,
      flying: null,
      handCount: 0,
      handIndex: house,
    };
    this.mode = "animating";
    this.legal = [];
    this.hoverHouse = -1;
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

  private finishTurn(): void {
    const a = this.anim!;
    const terminal = a.terminal;
    this.anim = null;
    const store = this.board.pits[PLAYER_STORE];

    // Reaching the target wins immediately, free turn or not.
    if (store >= this.puzzle.target) {
      this.mode = "won";
      return;
    }

    if (terminal === "chain") {
      this.showToast("Giliran gratis!");
      this.legal = legalMoves(this.board);
      if (this.legal.length === 0) {
        this.mode = "lost"; // no seeds left to keep the chain going
      } else {
        this.mode = "playing";
      }
      return;
    }

    // A normal turn spends a move.
    this.movesLeft -= 1;
    this.legal = legalMoves(this.board);
    if (this.movesLeft <= 0 || this.legal.length === 0) {
      this.mode = "lost";
    } else {
      this.mode = "playing";
    }
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

    if (this.mode !== "animating" || !this.anim) return;

    const a = this.anim;
    if (a.i >= a.events.length) {
      this.finishTurn();
      return;
    }

    const ev = a.events[a.i];
    a.stepDur = this.stepDurationFor(ev);
    a.elapsed += dt;
    const t = Math.min(1, a.elapsed / a.stepDur);

    // Animate the flying seed for drops.
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
    if (this.mode === "title") {
      drawTitle(this.ctx);
      return;
    }
    const st = this.buildRenderState();
    if (this.mode === "won" || this.mode === "lost") {
      drawEnd(
        this.ctx,
        this.mode === "won",
        st,
        this.puzzle.name,
        this.levelIndex >= PUZZLES.length - 1,
      );
    } else {
      drawScene(this.ctx, st);
    }
  }

  private buildRenderState(): RenderState {
    return {
      pits: this.board.pits,
      legal: this.mode === "playing" ? this.legal : [],
      hoverHouse: this.hoverHouse,
      flash: this.flash,
      flying: this.anim?.flying ?? null,
      hand:
        this.anim && this.anim.handCount > 0
          ? { index: this.anim.handIndex, count: this.anim.handCount }
          : null,
      level: this.puzzle.name,
      target: this.puzzle.target,
      movesLeft: this.movesLeft,
      toast: this.toast ? { text: this.toast.text, alpha: this.toast.alpha } : null,
    };
  }
}
