import { startLoop } from "./engine/loop";
import { CongklakGame } from "./congklak/game";

/**
 * Arc Entertainment — first title: Congklak (dakon).
 *
 * Solo puzzle mode. The game scene owns all state; the shared fixed-timestep
 * loop drives its update/render. See src/congklak/ for the rules engine and
 * rendering.
 */

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Canvas element #game not found");

const game = new CongklakGame(canvas);

startLoop({
  update: (dt) => game.update(dt),
  render: (alpha) => game.render(alpha),
});
