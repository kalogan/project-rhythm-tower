import type { BeatGrid } from './beatGrid.js';
import { beatToTime } from './beatGrid.js';
import type { Button, Cue, ColorMapping } from './cue.js';
import { DEFAULT_MAPPING, expectedButtons } from './cue.js';
import type { Chart } from './chart.js';
import type { JudgeWindows, Verdict } from './judgment.js';
import { DEFAULT_WINDOWS, timingError, timingVerdict, windowPassed } from './judgment.js';
import type { FloorScore } from './scoring.js';
import { scoreFloor } from './scoring.js';

/** Beats a hold lasts when its `holdBeats` is unspecified (defensive default). */
const DEFAULT_HOLD_BEATS = 1;

/** The absolute end time (seconds) of a hold cue: its start beat + holdBeats. */
function holdEndTime(grid: BeatGrid, cue: Cue): number {
  return beatToTime(grid, cue.beat + (cue.holdBeats ?? DEFAULT_HOLD_BEATS));
}

/**
 * Partial progress on a DOUBLE cue: the first correct, in-window button has landed
 * but the second hasn't yet. We remember WHICH button landed (so a repeat of the same
 * button doesn't complete the pair) and its absolute timing error (so the final verdict
 * grades from the WORSE of the two presses). null = no partial progress for that cue.
 */
export interface DoublePartial {
  readonly button: Button;
  readonly absErr: number;
}

/**
 * In-flight progress on a HOLD cue: the correct button was pressed in the START
 * window and is being held down. We remember WHICH button (so a release of the
 * right key can break it) and the absolute START timing error (the held cue grades
 * by how well it was STARTED, not how long it was held). `broken` flips true if the
 * player let go before the end window opened — a broken hold is a miss. null = the
 * hold hasn't been started (or has already resolved).
 */
export interface HoldProgress {
  readonly button: Button;
  readonly startErr: number;
  readonly broken: boolean;
}

/**
 * Pure floor session: the authoritative state of one rhythm challenge. The view
 * (cue layer + audio) is a projection; judgment happens HERE and only here.
 * Every transition is a pure function of (state, input, injected time).
 */
export interface FloorSession {
  readonly grid: BeatGrid;
  readonly mapping: ColorMapping;
  readonly windows: JudgeWindows;
  readonly cues: readonly Cue[];
  /** Resolution per cue, index-aligned to `cues`. null = not yet resolved. */
  readonly verdicts: readonly (Verdict | null)[];
  /**
   * In-flight double progress per cue, index-aligned to `cues`. null = no partial
   * (the common case for taps/decoys and for untouched doubles). A double resolves
   * only once BOTH of its expected buttons have landed in-window.
   */
  readonly partials: readonly (DoublePartial | null)[];
  /**
   * In-flight HOLD progress per cue, index-aligned to `cues`. null = no hold in
   * flight (the common case for non-holds and for untouched holds). A hold resolves
   * at its END time (if still held) or earlier on an early-release break (miss).
   */
  readonly holds: readonly (HoldProgress | null)[];
  readonly combo: number;
  readonly maxCombo: number;
}

export interface PressResult {
  readonly session: FloorSession;
  /** The cue this press resolved (or advanced), or null if the press was a stray. */
  readonly cueId: number | null;
  readonly verdict: Verdict | null;
}

export function createFloorSession(
  chart: Chart,
  grid: BeatGrid,
  mapping: ColorMapping = DEFAULT_MAPPING,
  windows: JudgeWindows = DEFAULT_WINDOWS,
): FloorSession {
  return {
    grid,
    mapping,
    windows,
    cues: chart.cues,
    verdicts: chart.cues.map(() => null),
    partials: chart.cues.map(() => null),
    holds: chart.cues.map(() => null),
    combo: 0,
    maxCombo: 0,
  };
}

function withVerdict(session: FloorSession, index: number, verdict: Verdict): FloorSession {
  const verdicts = session.verdicts.slice();
  verdicts[index] = verdict;
  // Clearing partial/hold progress on resolution keeps the parallel arrays immutable + tidy.
  let partials: readonly (DoublePartial | null)[] = session.partials;
  if (partials[index] !== null) {
    const next = partials.slice();
    next[index] = null;
    partials = next;
  }
  let holds: readonly (HoldProgress | null)[] = session.holds;
  if (holds[index] !== null) {
    const next = holds.slice();
    next[index] = null;
    holds = next;
  }
  const success = verdict === 'perfect' || verdict === 'good' || verdict === 'avoided';
  const combo = success ? session.combo + 1 : 0;
  return {
    ...session,
    verdicts,
    partials,
    holds,
    combo,
    maxCombo: Math.max(session.maxCombo, combo),
  };
}

/** Record the first in-window correct half of a double, immutably. Returns a new session. */
function withPartial(session: FloorSession, index: number, partial: DoublePartial): FloorSession {
  const partials = session.partials.slice();
  partials[index] = partial;
  return { ...session, partials };
}

/** Record (or update) in-flight hold progress for a cue, immutably. */
function withHold(session: FloorSession, index: number, hold: HoldProgress): FloorSession {
  const holds = session.holds.slice();
  holds[index] = hold;
  return { ...session, holds };
}

/**
 * Resolve a button press at `timeSec` against the nearest in-window unresolved cue.
 * A press with no cue in window is a stray and is ignored (cozy: no penalty).
 *
 * DOUBLE cues need BOTH expected buttons in-window: the first correct, distinct press
 * records partial progress (verdict null — nothing shatters yet); the second distinct
 * correct press completes it, grading from the WORSE of the two timing errors. A wrong
 * button on a double fails the whole cue ('wrong').
 */
export function pressButton(session: FloorSession, button: Button, timeSec: number): PressResult {
  let best = -1;
  let bestErr = Infinity;
  for (let i = 0; i < session.cues.length; i++) {
    if (session.verdicts[i] !== null) continue;
    const cue = session.cues[i] as Cue;
    const err = Math.abs(timingError(session.grid, cue, timeSec));
    if (err <= session.windows.goodSec && err < bestErr) {
      best = i;
      bestErr = err;
    }
  }
  if (best === -1) return { session, cueId: null, verdict: null };

  const cue = session.cues[best] as Cue;

  if (cue.kind === 'decoy') {
    // You were supposed to ignore it — pressing fails the cue.
    return { session: withVerdict(session, best, 'wrong'), cueId: cue.id, verdict: 'wrong' };
  }

  const expected = expectedButtons(cue, session.mapping);

  if (cue.kind === 'double') {
    if (!expected.includes(button)) {
      // A wrong button fails the whole double immediately.
      return { session: withVerdict(session, best, 'wrong'), cueId: cue.id, verdict: 'wrong' };
    }
    const prior = session.partials[best] ?? null;
    if (prior === null) {
      // First correct half — remember it, fire no verdict yet.
      return {
        session: withPartial(session, best, { button, absErr: bestErr }),
        cueId: cue.id,
        verdict: null,
      };
    }
    if (prior.button === button) {
      // Same correct button pressed again — not a distinct second half; no progress.
      return { session, cueId: cue.id, verdict: null };
    }
    // Both distinct expected buttons have now landed in-window — grade from the WORSE.
    const verdict = timingVerdict(Math.max(prior.absErr, bestErr), session.windows);
    return { session: withVerdict(session, best, verdict), cueId: cue.id, verdict };
  }

  if (cue.kind === 'hold') {
    // A HOLD begins on the correct button in the START window. We don't grade yet —
    // success is granted at the END time IF the button is still held (tick resolves
    // it). A wrong button fails the cue outright. A repeat press while already holding
    // is a no-op (it doesn't restart or re-grade an in-flight hold).
    if (!expected.includes(button)) {
      return { session: withVerdict(session, best, 'wrong'), cueId: cue.id, verdict: 'wrong' };
    }
    if (session.holds[best] !== null) {
      return { session, cueId: cue.id, verdict: null };
    }
    return {
      session: withHold(session, best, { button, startErr: bestErr, broken: false }),
      cueId: cue.id,
      verdict: null,
    };
  }

  // tap (and any single-button kind): correct button grades by timing, else 'wrong'.
  const verdict = expected.includes(button) ? timingVerdict(bestErr, session.windows) : 'wrong';
  return { session: withVerdict(session, best, verdict), cueId: cue.id, verdict };
}

/**
 * Resolve a button RELEASE at `timeSec`. Only meaningful for an in-flight HOLD: if the
 * held button is released BEFORE the hold's end window opens, the hold broke early ->
 * 'miss' (resolve the cue now). A release AT/AFTER the end window is fine — holding
 * through (or letting go once the end has arrived) is a success that tick() grants — so
 * we ignore it here. A release of an unrelated button, or with no in-flight hold, is a
 * harmless stray (no penalty). Same PressResult shape as pressButton.
 */
export function releaseButton(session: FloorSession, button: Button, timeSec: number): PressResult {
  for (let i = 0; i < session.cues.length; i++) {
    if (session.verdicts[i] !== null) continue;
    const hold = session.holds[i];
    if (hold === null || hold === undefined || hold.broken) continue;
    if (hold.button !== button) continue;
    const cue = session.cues[i] as Cue;
    // The end window opens `goodSec` before the hold's nominal end time: releasing once
    // the cue is at/inside its end window counts as holding through (success at tick).
    const endOpens = holdEndTime(session.grid, cue) - session.windows.goodSec;
    if (timeSec >= endOpens) {
      // Held long enough — let go is fine; success is granted at/after the end by tick.
      return { session, cueId: cue.id, verdict: null };
    }
    // Let go too early: the hold breaks -> miss, resolved immediately.
    return { session: withVerdict(session, i, 'miss'), cueId: cue.id, verdict: 'miss' };
  }
  return { session, cueId: null, verdict: null };
}

/**
 * Auto-resolve any cue whose window has fully closed at `timeSec`. A passed decoy
 * becomes 'avoided' (success); anything else unresolved becomes 'miss' (including a
 * double that only got one of its two buttons before the window closed). Returns the
 * same reference when nothing changed (no allocation on idle ticks).
 */
export function tick(session: FloorSession, timeSec: number): FloorSession {
  let next = session;
  for (let i = 0; i < session.cues.length; i++) {
    if (next.verdicts[i] !== null) continue;
    const cue = session.cues[i] as Cue;

    if (cue.kind === 'hold') {
      const hold = next.holds[i];
      if (hold !== null && hold !== undefined && !hold.broken) {
        // An actively-held hold is judged by its END time, not its start window: once
        // the end time has arrived, the player held through -> grade by the start error.
        if (timeSec >= holdEndTime(session.grid, cue)) {
          next = withVerdict(next, i, timingVerdict(hold.startErr, session.windows));
        }
        // Still mid-hold: do NOT miss it just because the start window closed.
        continue;
      }
      // No active hold: an un-started hold misses once its START window closes.
      if (windowPassed(session.grid, cue, timeSec, session.windows)) {
        next = withVerdict(next, i, 'miss');
      }
      continue;
    }

    if (windowPassed(session.grid, cue, timeSec, session.windows)) {
      next = withVerdict(next, i, cue.kind === 'decoy' ? 'avoided' : 'miss');
    }
  }
  return next;
}

export function isComplete(session: FloorSession): boolean {
  return session.verdicts.every((v) => v !== null);
}

export function finalize(session: FloorSession, clearThreshold?: number): FloorScore {
  return scoreFloor(session.verdicts, session.maxCombo, clearThreshold);
}
