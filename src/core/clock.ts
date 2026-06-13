/**
 * The injected clock. The core never reads wall-clock time directly
 * (no Date.now / performance.now) — callers pass time in. This keeps every
 * judgment replayable: feed the same input events at the same times and you get
 * the same result.
 *
 * Time is in SECONDS throughout the core (matches Web Audio's AudioContext.currentTime).
 */
export interface Clock {
  /** Current time in seconds. */
  now(): number;
}

/** A test/replay clock you advance by hand. */
export function makeManualClock(start = 0): Clock & { set(t: number): void; advance(dt: number): void } {
  let t = start;
  return {
    now: () => t,
    set: (v) => {
      t = v;
    },
    advance: (dt) => {
      t += dt;
    },
  };
}
