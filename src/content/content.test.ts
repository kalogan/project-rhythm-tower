import { describe, it, expect } from 'vitest';
import { BANDS, bandByOrder } from './packs.js';
import { BandPackSchema, toChartSpec } from './schemas.js';
import { generateChart } from '../core/chart.js';
import golden from './__fixtures__/golden.atrium-crown.json' with { type: 'json' };

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
});
