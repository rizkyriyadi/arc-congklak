import { startLoop } from "./engine/loop";

/**
 * Foundation demo scene.
 *
 * Proves the spine works: a blank canvas renders, the fixed-timestep loop
 * ticks, a sprite moves with interpolation, and an FPS counter confirms the
 * frame rate live. There is no game here yet — that's P0.2+ (first title).
 */

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Canvas element #game not found");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2D canvas context unavailable");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// A bouncing sprite. Position in `x/y`, velocity in px/sec. We keep the
// previous position so render() can interpolate for buttery motion.
const sprite = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  prevX: WIDTH / 2,
  prevY: HEIGHT / 2,
  vx: 180,
  vy: 132,
  radius: 18,
};

function update(dt: number): void {
  sprite.prevX = sprite.x;
  sprite.prevY = sprite.y;

  sprite.x += sprite.vx * dt;
  sprite.y += sprite.vy * dt;

  // Bounce off the walls.
  if (sprite.x - sprite.radius < 0) {
    sprite.x = sprite.radius;
    sprite.vx = Math.abs(sprite.vx);
  } else if (sprite.x + sprite.radius > WIDTH) {
    sprite.x = WIDTH - sprite.radius;
    sprite.vx = -Math.abs(sprite.vx);
  }
  if (sprite.y - sprite.radius < 0) {
    sprite.y = sprite.radius;
    sprite.vy = Math.abs(sprite.vy);
  } else if (sprite.y + sprite.radius > HEIGHT) {
    sprite.y = HEIGHT - sprite.radius;
    sprite.vy = -Math.abs(sprite.vy);
  }
}

function render(alpha: number): void {
  const c = ctx!;
  // Clear.
  c.fillStyle = "#161b22";
  c.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle grid so motion is easy to read.
  c.strokeStyle = "rgba(240, 198, 116, 0.07)";
  c.lineWidth = 1;
  for (let gx = 0; gx <= WIDTH; gx += 40) {
    c.beginPath();
    c.moveTo(gx, 0);
    c.lineTo(gx, HEIGHT);
    c.stroke();
  }
  for (let gy = 0; gy <= HEIGHT; gy += 40) {
    c.beginPath();
    c.moveTo(0, gy);
    c.lineTo(WIDTH, gy);
    c.stroke();
  }

  // Interpolated sprite position.
  const ix = sprite.prevX + (sprite.x - sprite.prevX) * alpha;
  const iy = sprite.prevY + (sprite.y - sprite.prevY) * alpha;

  c.beginPath();
  c.arc(ix, iy, sprite.radius, 0, Math.PI * 2);
  c.fillStyle = "#f0c674"; // warm gold — placeholder brand accent
  c.fill();
  c.strokeStyle = "#c8102e"; // Indonesian-flag red accent
  c.lineWidth = 3;
  c.stroke();

  // HUD: FPS counter.
  c.fillStyle = "#e6edf3";
  c.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  c.textBaseline = "top";
  c.fillText(`FPS: ${loop.fps}`, 12, 12);
  c.fillStyle = "rgba(230, 237, 243, 0.5)";
  c.fillText("Arc foundation — loop ticking", 12, 30);
}

// requestAnimationFrame already pauses when the tab is hidden, and the loop
// clamps long frame gaps, so backgrounding is handled without extra wiring.
const loop = startLoop({ update, render });
