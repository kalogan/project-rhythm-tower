import type { BeatGrid } from './beatGrid.js';
import type { Button, Cue, ColorMapping } from './cue.js';
import { DEFAULT_MAPPING, expectedButtons } from './cue.js';
import type { Chart } from './chart.js';
import type { JudgeWindows, Verdict } from './judgment.js';
import { DEFAULT_WINDOWS, timingError, timingVerdict, windowPassed } from './judgment.js';
import type { FloorScore } from './scoring.js';
import { scoreFloor } from './scoring.js';

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
    combo: 0,
    maxCombo: 0,
  };
}

function withVerdict(session: FloorSession, index: number, verdict: Verdict): FloorSession {
  const verdicts = session.verdicts.slice();
  verdicts[index] = verdict;
  // Clearing partial progress on resolution keeps the parallel arrays immutable + tidy.
  let partials = session.partials;
  if (partials[index] !== null) {
    partials = partials.slice();
    partials[index] = null;
  }
  const success = verdict === 'perfect' || verdict === 'good' || verdict === 'avoided';
  const combo = success ? session.combo + 1 : 0;
  return {
    ...session,
    verdicts,
    partials,
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
    const prior = session.partials[best];
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

  // tap (and any single-button kind): correct button grades by timing, else 'wrong'.
  const verdict = expected.includes(button) ? timingVerdict(bestErr, session.windows) : 'wrong';
  return { session: withVerdict(session, best, verdict), cueId: cue.id, verdict };
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
