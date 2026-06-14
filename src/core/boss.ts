import type { Cue, CueColor } from './cue.js';
import { makePrng } from './prng.js';

/**
 * A BOSS encounter, expressed as a deterministic CHART so it rides the existing engine
 * (no new judgment): each phase is a BARRAGE of decoys (the boss's thrown attacks — you
 * must NOT press them, pressing costs HP) followed by a WEAK-SPOT window where the boss
 * exposes a coloured spot you strike (normal taps you decode colour->button). Win by
 * surviving (shared HP) and landing the weak-spot windows. Same seed -> same fight.
 */
export interface BossSpec {
  readonly bpm: number;
  readonly beatsPerBar: number;
  /** Number of attack -> weak-spot cycles. */
  readonly phases: number;
  /** Length (beats) of each decoy barrage. */
  readonly barrageBeats: number;
  /** Probability a barrage beat throws a decoy. */
  readonly barrageDensity: number;
  /** Length (beats) of each weak-spot window. */
  readonly weakSpotBeats: number;
  /** Colours the boss's weak spot can show, cycled per phase (e.g. green, red). */
  readonly weakSpotColors: readonly CueColor[];
  /** Decoy colours the barrage throws. */
  readonly decoyColors: readonly CueColor[];
  readonly leadInBeats: number;
}

export type BossPhaseKind = 'barrage' | 'weakspot';

export interface BossPhase {
  readonly kind: BossPhaseKind;
  /** Weak-spot colour for a 'weakspot' phase (undefined for a barrage). */
  readonly color?: CueColor;
  readonly startBeat: number;
  readonly endBeat: number;
}

export interface BossChart {
  readonly cues: Cue[];
  readonly phases: BossPhase[];
  /** Total beats (incl. a trailing bar to breathe). */
  readonly beats: number;
}

/** Which phase a given beat falls in (for the view's telegraphing). */
export function phaseAtBeat(chart: BossChart, beat: number): BossPhase | undefined {
  return chart.phases.find((p) => beat >= p.startBeat && beat < p.endBeat);
}

export function generateBossChart(spec: BossSpec, seed: number): BossChart {
  const prng = makePrng(seed);
  const cues: Cue[] = [];
  const phases: BossPhase[] = [];
  let id = 0;
  let beat = spec.leadInBeats;

  for (let p = 0; p < spec.phases; p++) {
    // ── Barrage: decoys to dodge (do NOT press). ──
    const bStart = beat;
    for (let b = 0; b < spec.barrageBeats; b++, beat++) {
      if (prng.chance(spec.barrageDensity)) {
        cues.push({ id: id++, beat, color: prng.pick(spec.decoyColors), kind: 'decoy' });
      }
    }
    phases.push({ kind: 'barrage', startBeat: bStart, endBeat: beat });

    // ── Weak-spot window: strike the exposed colour (decode colour -> button). ──
    const color = spec.weakSpotColors[p % spec.weakSpotColors.length] ?? 'green';
    const wStart = beat;
    for (let b = 0; b < spec.weakSpotBeats; b++, beat++) {
      cues.push({ id: id++, beat, color, kind: 'tap' });
    }
    phases.push({ kind: 'weakspot', color, startBeat: wStart, endBeat: beat });
  }

  return { cues, phases, beats: beat + spec.beatsPerBar };
}
