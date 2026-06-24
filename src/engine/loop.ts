/**
 * Fixed-timestep game loop with a decoupled render pass.
 *
 * Update runs at a fixed rate (default 60 Hz) so gameplay is deterministic and
 * frame-rate independent; render runs once per animation frame and receives an
 * interpolation alpha so motion stays smooth on high-refresh displays.
 *
 * This is the spine every Arc title will build on — scenes plug their own
 * update/render in, the loop owns timing.
 */

export interface LoopCallbacks {
  /** Advance simulation by a fixed step. `dt` is in seconds. */
  update(dt: number): void;
  /**
   * Draw the current frame. `alpha` (0..1) is how far we are between the last
   * and next fixed update — use it to interpolate positions for smoothness.
   */
  render(alpha: number): void;
}

export interface LoopHandle {
  stop(): void;
  /** Smoothed frames-per-second, updated ~4x/sec. */
  readonly fps: number;
}

export function startLoop(
  callbacks: LoopCallbacks,
  updatesPerSecond = 60,
): LoopHandle {
  const fixedDt = 1 / updatesPerSecond;
  const maxFrameTime = 0.25; // clamp to avoid the "spiral of death" after a tab stall

  let running = true;
  let rafId = 0;
  let last = performance.now() / 1000;
  let accumulator = 0;

  // FPS tracking
  let fps = 0;
  let frames = 0;
  let fpsTimer = 0;

  const handle: LoopHandle = {
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    get fps() {
      return fps;
    },
  };

  function frame(nowMs: number): void {
    if (!running) return;
    const now = nowMs / 1000;
    let frameTime = now - last;
    last = now;
    if (frameTime > maxFrameTime) frameTime = maxFrameTime;

    accumulator += frameTime;
    while (accumulator >= fixedDt) {
      callbacks.update(fixedDt);
      accumulator -= fixedDt;
    }

    callbacks.render(accumulator / fixedDt);

    frames++;
    fpsTimer += frameTime;
    if (fpsTimer >= 0.25) {
      fps = Math.round(frames / fpsTimer);
      frames = 0;
      fpsTimer = 0;
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return handle;
}
