import type { Cue, CueColor, CueKind } from './cue.js';
import { makePrng } from './prng.js';

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

  for (let beat = spec.leadInBeats; beat < spec.beats; beat++) {
    if (!prng.chance(spec.density)) continue;

    const color = prng.pick(spec.colors);
    const kind = rollKind(prng.next(), spec);

    const cue: Cue = {
      id: id++,
      beat,
      color,
      kind,
      ...(kind === 'double' ? { color2: prng.pick(spec.colors) } : {}),
      ...(kind === 'hold' ? { holdBeats: 1 + prng.int(2) } : {}),
    };
    cues.push(cue);
  }

  return { cues };
}
