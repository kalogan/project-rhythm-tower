import { z } from 'zod';
import type { ChartSpec } from '../core/chart.js';

/**
 * Content schemas. Every pack/registry is validated against these (the content lint).
 * Bands and floors are pure DATA; the chart for a floor is generated deterministically
 * from its spec + seed by the core. Bump `schemaVersion` + ship a golden fixture on change.
 */
export const CONTENT_SCHEMA_VERSION = 1;

export const CueColorSchema = z.enum(['blue', 'green', 'red', 'yellow']);
export const ButtonSchema = z.enum(['X', 'A', 'B', 'Y']);
export const CueKindSchema = z.enum(['tap', 'hold', 'double', 'decoy']);

/** A complete color→button table (all four colors required). */
export const ColorMappingSchema = z.object({
  blue: ButtonSchema,
  green: ButtonSchema,
  red: ButtonSchema,
  yellow: ButtonSchema,
});

/** The deterministic chart recipe for a floor (parsed into core `ChartSpec`). */
export const ChartSpecSchema = z.object({
  bpm: z.number().positive(),
  beatsPerBar: z.number().int().positive().default(4),
  beats: z.number().int().positive(),
  colors: z.array(CueColorSchema).min(1),
  density: z.number().min(0).max(1),
  decoyChance: z.number().min(0).max(1).default(0),
  doubleChance: z.number().min(0).max(1).default(0),
  holdChance: z.number().min(0).max(1).default(0),
  leadInBeats: z.number().int().min(0).default(4),
});

export const FloorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 0-based floor index within the band. */
  index: z.number().int().min(0),
  seed: z.number().int(),
  chart: ChartSpecSchema,
  /** Optional per-floor mapping override (the mapping-mutation escalation). */
  mapping: ColorMappingSchema.optional(),
  clearThreshold: z.number().min(0).max(1).optional(),
});

/** A band's "look" — ties into the environment art pipeline (theme/palette). */
export const BandLookSchema = z.object({
  /** Hero/landmark color the band orients by (anchor principle). */
  landmark: z.string().min(1),
  palette: z.array(z.string().regex(/^#([0-9a-fA-F]{6})$/)).min(3),
  skyColor: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  fogColor: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  accent: z.string().regex(/^#([0-9a-fA-F]{6})$/),
});

export const EscalationAxisSchema = z.enum(['baseline', 'mapping', 'cue-kinds', 'tempo']);

const WaveSchema = z.enum(['sine', 'square', 'sawtooth', 'triangle']);
export const ScaleNameSchema = z.enum(['minorPentatonic', 'dorian', 'major', 'lydian', 'minor']);

/** A band's musical identity: its key, scale, and per-layer instrument timbres, so each
 *  zone sounds distinct. Optional — a band without it falls back to a chart-hashed key. */
export const BandMusicSchema = z.object({
  /** MIDI root note (e.g. 48 = C3). */
  root: z.number().int(),
  scale: ScaleNameSchema,
  bass: WaveSchema.default('triangle'),
  pad: WaveSchema.default('sawtooth'),
  lead: WaveSchema.default('sawtooth'),
  arp: WaveSchema.default('triangle'),
});
export type BandMusic = z.infer<typeof BandMusicSchema>;

/** One band of the tower = a run of floors sharing a look + one escalation axis. */
export const BandPackSchema = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  id: z.string().regex(/^pack:[a-z0-9-]+$/),
  name: z.string().min(1),
  /** Climb order; band 0 is the ground floor. */
  bandOrder: z.number().int().min(0),
  description: z.string().min(1),
  artKitId: z.string().min(1),
  escalationAxis: EscalationAxisSchema,
  look: BandLookSchema,
  music: BandMusicSchema.optional(),
  floors: z.array(FloorSchema).min(1),
  tags: z.array(z.string()).default([]),
});

export type BandPack = z.infer<typeof BandPackSchema>;
export type Floor = z.infer<typeof FloorSchema>;
export type BandLook = z.infer<typeof BandLookSchema>;

/** Bridge a validated floor's recipe into the core's ChartSpec (with all defaults applied). */
export function toChartSpec(floor: Floor): ChartSpec {
  return floor.chart;
}
