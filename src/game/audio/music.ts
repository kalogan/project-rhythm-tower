import type { Chart, CueColor } from '../../core/index.js';
import type { BandMusic } from '../../content/schemas.js';

/**
 * Pure music theory (no Web Audio) so it's unit-testable and deterministic. Each BAND
 * carries its own authored `music` (key, scale, instrument timbres) so every zone has a
 * distinct sound; floors with no band fall back to a key/scale hashed from the chart.
 * Audio stays a cosmetic projection of the deterministic core, never a source of truth.
 */
export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export const SCALES = {
  minorPentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type ScaleName = keyof typeof SCALES;

/** Map a (possibly out-of-range) scale degree to a MIDI note, wrapping octaves. */
export function scaleMidi(rootMidi: number, scale: readonly number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return rootMidi + oct * 12 + scale[idx]!;
}

export interface Mood {
  readonly rootMidi: number;
  readonly scale: readonly number[];
  readonly scaleName: ScaleName;
  /** Per-layer oscillator timbres (per-band character). */
  readonly bass: OscillatorType;
  readonly pad: OscillatorType;
  readonly lead: OscillatorType;
  readonly arp: OscillatorType;
}

const DEFAULT_TIMBRES = { bass: 'triangle', pad: 'sawtooth', lead: 'sawtooth', arp: 'triangle' } as const;

const ROOTS = [48, 50, 52, 53, 55, 57]; // C3, D3, E3, F3, G3, A3
const SCALE_NAMES: readonly ScaleName[] = ['minorPentatonic', 'dorian', 'major', 'lydian'];

/** A band's authored music -> a Mood (its key, scale, and instrument timbres). */
export function moodFromBandMusic(m: BandMusic): Mood {
  return {
    rootMidi: m.root,
    scale: SCALES[m.scale],
    scaleName: m.scale,
    bass: m.bass,
    pad: m.pad,
    lead: m.lead,
    arp: m.arp,
  };
}

/** Fallback when there's no band music: a key + scale hashed from the chart (FNV-1a). */
export function moodFromChart(chart: Chart): Mood {
  let h = 2166136261 >>> 0;
  for (const c of chart.cues) {
    h = (Math.imul(h ^ (c.beat + 1), 16777619) >>> 0) ^ c.color.charCodeAt(0);
    h >>>= 0;
  }
  const scaleName = SCALE_NAMES[(h >>> 5) % SCALE_NAMES.length]!;
  return {
    rootMidi: ROOTS[h % ROOTS.length]!,
    scale: SCALES[scaleName],
    scaleName,
    ...DEFAULT_TIMBRES,
  };
}

/** A simple, pleasant chord progression as scale degrees (i – vi – iv – v feel). */
export const PROGRESSION: readonly number[] = [0, 5, 3, 4];

/** Cue colour -> a scale degree, so the cue's lead tone harmonises with the bed. */
export function colorDegree(color: CueColor): number {
  switch (color) {
    case 'blue':
      return 0;
    case 'green':
      return 2;
    case 'red':
      return 4;
    case 'yellow':
      return 6;
  }
}
