import type { Cue, CueColor, CueKind } from './cue.js';
import { makePrng } from './prng.js';
import { DEFAULT_WINDOWS } from './judgment.js';

/**
 * Minimum time (seconds) between two consecutively PLACED cues. Two cues closer
 * than this would have overlapping hit windows (each window spans `goodSec` on
 * either side of the target time), making consecutive cues physically ambiguous
 * to judge. At high BPM, cues on every beat can land closer than this; the chart
 * generator skips the later one to keep windows separable.
 *
 * The hard floor is `2 * DEFAULT_WINDOWS.goodSec` (= 0.28s at the default 0.14s
 * half-window — at/below that, adjacent windows touch or overlap). We sit just
 * above it with a small safety margin.
 *
 * NOTE: every current band's tempo is <= 120 BPM => beat >= 0.5s, so consecutive
 * beats are already 0.5s+ apart and this guard NEVER trips there. Low-tempo charts
 * (and their golden fixtures) regenerate byte-identically; only the high-BPM tempo
 * band exercises the skip.
 */
export const MIN_CUE_GAP_SEC = 0.3;
// Compile-/test-time invariant: the gap must exceed two half-windows so windows
// never overlap. Asserted by a core test (see core.test.ts).
export const MIN_CUE_GAP_FLOOR_SEC = 2 * DEFAULT_WINDOWS.goodSec;

/**
 * Runtime shape of a floor's chart recipe. Content JSON (validated by Zod in
 * src/content) is parsed into this. The chart itself is GENERATED deterministically
 * from this spec + a seed — charts are derived, never hand-placed (procedural-audio
 * decision). Same spec + seed -> identical chart.
 */
export interface ChartSpec {
  readonly bpm: number;
  readonly beatsPerBar: number;
  /** Total playable beats in the floor. */
  readonly beats: number;
  /** Cue colors available on this floor. */
  readonly colors: readonly CueColor[];
  /** Probability [0,1] an eligible beat carries a cue. */
  readonly density: number;
  /** Escalation knobs — probability a placed cue becomes a special kind. */
  readonly decoyChance: number;
  readonly doubleChance: number;
  readonly holdChance: number;
  /** Lead-in beats with no cues, so the player can find the tempo. */
  readonly leadInBeats: number;
}

export interface Chart {
  readonly cues: readonly Cue[];
}

/** Pick a cue kind from the spec's escalation probabilities (priority: decoy > double > hold > tap). */
function rollKind(roll: number, spec: ChartSpec): CueKind {
  if (roll < spec.decoyChance) return 'decoy';
  if (roll < spec.decoyChance + spec.doubleChance) return 'double';
  if (roll < spec.decoyChance + spec.doubleChance + spec.holdChance) return 'hold';
  return 'tap';
}

/**
 * Deterministically build a floor's chart. Cues land on integer beats; whether a
 * beat carries a cue, its color, and its kind are all pure functions of the seed.
 */
export function generateChart(spec: ChartSpec, seed: number): Chart {
  const prng = makePrng(seed);
  const cues: Cue[] = [];
  let id = 0;
  // Time of the last PLACED cue, for the minimum-spacing guard. The grid is the
  // pure spec timing: a beat lands at `beat * secPerBeat`.
  const secPerBeat = 60 / spec.bpm;
  let lastPlacedTime = -Infinity;

  for (let beat = spec.leadInBeats; beat < spec.beats; beat++) {
    if (!prng.chance(spec.density)) continue;

    // Draw color + kind BEFORE the spacing decision so the PRNG stream is
    // identical whether or not we end up placing the cue. This keeps low-tempo
    // charts (and their golden fixtures) byte-identical — the guard only changes
    // whether the already-drawn cue is pushed, never the draws themselves.
    const color = prng.pick(spec.colors);
    const kind = rollKind(prng.next(), spec);
    const color2 = kind === 'double' ? prng.pick(spec.colors) : undefined;
    const holdBeats = kind === 'hold' ? 1 + prng.int(2) : undefined;

    // Minimum-spacing guard: at high BPM, a cue this beat may land closer than
    // MIN_CUE_GAP_SEC to the previously placed cue, overlapping hit windows. If
    // so, skip placing it (but the PRNG has already advanced identically above).
    // At >= 0.5s/beat (all current bands) this never triggers.
    const time = beat * secPerBeat;
    if (time - lastPlacedTime < MIN_CUE_GAP_SEC) continue;

    const cue: Cue = {
      id: id++,
      beat,
      color,
      kind,
      ...(color2 !== undefined ? { color2 } : {}),
      ...(holdBeats !== undefined ? { holdBeats } : {}),
    };
    cues.push(cue);
    lastPlacedTime = time;
  }

  return { cues };
}
