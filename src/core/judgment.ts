import type { BeatGrid } from './beatGrid.js';
import { beatToTime } from './beatGrid.js';
import type { Cue } from './cue.js';

/**
 * Timing windows, in seconds, around a cue's target time. Cozy-forgiving:
 * generous windows by rhythm-game standards (a miss just retries the floor).
 */
export interface JudgeWindows {
  readonly perfectSec: number;
  readonly goodSec: number;
}

export const DEFAULT_WINDOWS: JudgeWindows = { perfectSec: 0.06, goodSec: 0.14 };

/** A resolved outcome for a single cue. */
export type Verdict = 'perfect' | 'good' | 'wrong' | 'miss' | 'avoided';

export const SCORING_VERDICTS: readonly Verdict[] = [
  'perfect',
  'good',
  'wrong',
  'miss',
  'avoided',
] as const;

/** Signed timing error of a press vs the cue's target time (negative = early). */
export function timingError(grid: BeatGrid, cue: Cue, pressTimeSec: number): number {
  return pressTimeSec - beatToTime(grid, cue.beat);
}

/** Timing-only verdict from an absolute error. Button correctness is judged separately. */
export function timingVerdict(absErrorSec: number, windows: JudgeWindows = DEFAULT_WINDOWS): 'perfect' | 'good' | 'miss' {
  if (absErrorSec <= windows.perfectSec) return 'perfect';
  if (absErrorSec <= windows.goodSec) return 'good';
  return 'miss';
}

/** Whether a press at `pressTimeSec` falls within the (good) hit window of `cue`. */
export function inWindow(grid: BeatGrid, cue: Cue, pressTimeSec: number, windows: JudgeWindows = DEFAULT_WINDOWS): boolean {
  return Math.abs(timingError(grid, cue, pressTimeSec)) <= windows.goodSec;
}

/** Whether a cue's window has fully closed by `timeSec` (used to auto-resolve misses). */
export function windowPassed(grid: BeatGrid, cue: Cue, timeSec: number, windows: JudgeWindows = DEFAULT_WINDOWS): boolean {
  return timeSec > beatToTime(grid, cue.beat) + windows.goodSec;
}
