import { describe, it, expect } from 'vitest';
import { BANDS, bandByOrder } from './packs.js';
import { BandPackSchema, toChartSpec } from './schemas.js';
import { generateChart } from '../core/chart.js';
import { BUTTONS } from '../core/cue.js';
import golden from './__fixtures__/golden.atrium-crown.json' with { type: 'json' };
import goldenSpire from './__fixtures__/golden.spire-crown.json' with { type: 'json' };
import goldenVerdant from './__fixtures__/golden.verdant-crown.json' with { type: 'json' };

describe('content packs', () => {
  it('loads and validates every band', () => {
    expect(BANDS.length).toBeGreaterThan(0);
    for (const band of BANDS) {
      expect(() => BandPackSchema.parse(band)).not.toThrow();
    }
  });

  it('orders bands by climb and exposes the ground floor', () => {
    expect(bandByOrder(0)?.id).toBe('pack:atrium');
  });

  it('every floor recipe generates at least one cue within bounds', () => {
    for (const band of BANDS) {
      for (const floor of band.floors) {
        const chart = generateChart(toChartSpec(floor), floor.seed);
        expect(chart.cues.length).toBeGreaterThan(0);
        for (const cue of chart.cues) {
          expect(cue.beat).toBeLessThan(floor.chart.beats);
          expect(floor.chart.colors).toContain(cue.color);
        }
      }
    }
  });
});

describe('golden fixture (determinism pin)', () => {
  it('regenerates the atrium-crown chart byte-identically', () => {
    const band = BANDS.find((b) => b.id === 'pack:atrium')!;
    const floor = band.floors.find((f) => f.id === golden.floorId)!;
    const chart = generateChart(toChartSpec(floor), floor.seed);
    expect(chart.cues.length).toBe(golden.cueCount);
    expect(chart.cues).toEqual(golden.cues);
  });

  it('regenerates the spire-crown chart byte-identically', () => {
    const band = BANDS.find((b) => b.id === 'pack:spire')!;
    const floor = band.floors.find((f) => f.id === goldenSpire.floorId)!;
    const chart = generateChart(toChartSpec(floor), floor.seed);
    expect(chart.cues.length).toBe(goldenSpire.cueCount);
    expect(chart.cues).toEqual(goldenSpire.cues);
  });

  it('regenerates the verdant-crown chart byte-identically', () => {
    const band = BANDS.find((b) => b.id === 'pack:verdant')!;
    const floor = band.floors.find((f) => f.id === goldenVerdant.floorId)!;
    const chart = generateChart(toChartSpec(floor), floor.seed);
    expect(chart.cues.length).toBe(goldenVerdant.cueCount);
    expect(chart.cues).toEqual(goldenVerdant.cues);
  });
});

describe('band 3 — The Verdant Canopy (new-cue-kinds escalation)', () => {
  const verdant = BANDS.find((b) => b.id === 'pack:verdant');

  it('loads pack:verdant as the third band (bandOrder 2, axis "cue-kinds")', () => {
    expect(verdant).toBeDefined();
    expect(verdant!.bandOrder).toBe(2);
    expect(bandByOrder(2)?.id).toBe('pack:verdant');
    expect(verdant!.escalationAxis).toBe('cue-kinds');
  });

  it('keeps the DEFAULT mapping (no per-floor mapping override — challenge is the vocabulary)', () => {
    for (const floor of verdant!.floors) {
      expect(floor.mapping).toBeUndefined();
    }
  });

  it('sets holdChance 0 on every floor (holds are out of scope)', () => {
    for (const floor of verdant!.floors) {
      expect(floor.chart.holdChance ?? 0).toBe(0);
    }
  });

  it('floor 0 introduces decoys (and no doubles)', () => {
    const f0 = verdant!.floors.find((f) => f.id === 'floor:verdant-1')!;
    const chart = generateChart(toChartSpec(f0), f0.seed);
    expect(chart.cues.some((c) => c.kind === 'decoy')).toBe(true);
    expect(chart.cues.some((c) => c.kind === 'double')).toBe(false);
  });

  it('floor 1 introduces doubles (each carrying a second colour) and no decoys', () => {
    const f1 = verdant!.floors.find((f) => f.id === 'floor:verdant-2')!;
    const chart = generateChart(toChartSpec(f1), f1.seed);
    const doubles = chart.cues.filter((c) => c.kind === 'double');
    expect(doubles.length).toBeGreaterThan(0);
    for (const d of doubles) expect(d.color2).toBeDefined();
    expect(chart.cues.some((c) => c.kind === 'decoy')).toBe(false);
  });

  it('floor 2 mixes BOTH decoys and doubles in the same chart', () => {
    const f2 = verdant!.floors.find((f) => f.id === 'floor:verdant-3')!;
    const chart = generateChart(toChartSpec(f2), f2.seed);
    expect(chart.cues.some((c) => c.kind === 'decoy')).toBe(true);
    expect(chart.cues.some((c) => c.kind === 'double')).toBe(true);
  });

  it('the crown is a denser mix of all three reads (tap, decoy, double)', () => {
    const crown = verdant!.floors.find((f) => f.id === 'floor:verdant-crown')!;
    const chart = generateChart(toChartSpec(crown), crown.seed);
    expect(chart.cues.some((c) => c.kind === 'tap')).toBe(true);
    expect(chart.cues.some((c) => c.kind === 'decoy')).toBe(true);
    expect(chart.cues.some((c) => c.kind === 'double')).toBe(true);
  });

  it('never emits a hold cue anywhere in the band', () => {
    for (const floor of verdant!.floors) {
      const chart = generateChart(toChartSpec(floor), floor.seed);
      expect(chart.cues.every((c) => c.kind !== 'hold')).toBe(true);
    }
  });
});

describe('band 2 — The Spire (mapping-mutation escalation)', () => {
  const spire = BANDS.find((b) => b.id === 'pack:spire');

  it('loads pack:spire as the second band (bandOrder 1)', () => {
    expect(spire).toBeDefined();
    expect(spire!.bandOrder).toBe(1);
    expect(bandByOrder(1)?.id).toBe('pack:spire');
    expect(spire!.escalationAxis).toBe('mapping');
  });

  it('every floor declares a complete mapping that is a valid permutation of X/A/B/Y', () => {
    const colors = ['blue', 'green', 'red', 'yellow'] as const;
    expect(spire!.floors.length).toBe(4);
    for (const floor of spire!.floors) {
      expect(floor.mapping).toBeDefined();
      const mapping = floor.mapping!;
      // Complete table: every color present.
      for (const c of colors) expect(BUTTONS).toContain(mapping[c]);
      // A permutation: each of the four buttons used exactly once (bijection).
      const buttons = colors.map((c) => mapping[c]).sort();
      expect(buttons).toEqual([...BUTTONS].sort());
    }
  });

  it('the crown floor is a full derangement — no color keeps its default button', () => {
    const def = { blue: 'X', green: 'A', red: 'B', yellow: 'Y' } as const;
    const crown = spire!.floors.find((f) => f.id === 'floor:spire-crown')!;
    for (const c of ['blue', 'green', 'red', 'yellow'] as const) {
      expect(crown.mapping![c]).not.toBe(def[c]);
    }
  });
});
