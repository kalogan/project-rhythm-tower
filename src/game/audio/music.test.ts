import { describe, it, expect } from 'vitest';
import type { Chart, Cue } from '../../core/index.js';
import { SCALES, colorDegree, midiToFreq, moodFromChart, scaleMidi } from './music.js';

const chart = (cues: Cue[]): Chart => ({ cues });

describe('music theory', () => {
  it('converts MIDI to frequency (A4 = 440, octave doubling)', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });

  it('walks scale degrees and wraps octaves', () => {
    const s = SCALES.major;
    expect(scaleMidi(60, s, 0)).toBe(60); // root
    expect(scaleMidi(60, s, 2)).toBe(64); // major third
    expect(scaleMidi(60, s, 7)).toBe(72); // one octave up
    expect(scaleMidi(60, s, -1)).toBe(59); // below the root wraps down
  });

  it('derives a deterministic mood from a chart', () => {
    const c = chart([
      { id: 0, beat: 4, color: 'blue', kind: 'tap' },
      { id: 1, beat: 6, color: 'green', kind: 'tap' },
    ]);
    const a = moodFromChart(c);
    const b = moodFromChart(c);
    expect(a).toEqual(b); // stable
    expect(SCALES[a.scaleName]).toBe(a.scale);
  });

  it('produces a variety of moods across different charts', () => {
    const colors = ['blue', 'green', 'red', 'yellow'] as const;
    const moods = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      const cues: Cue[] = Array.from({ length: n }, (_, i) => ({
        id: i,
        beat: 4 + i,
        color: colors[i % 4]!,
        kind: 'tap',
      }));
      const m = moodFromChart(chart(cues));
      moods.add(`${m.rootMidi}:${m.scaleName}`);
    }
    expect(moods.size).toBeGreaterThan(1); // not every chart lands on the same key
  });

  it('maps each cue colour to a stable scale degree', () => {
    expect(colorDegree('blue')).toBe(0);
    expect(colorDegree('green')).toBe(2);
    expect(colorDegree('red')).toBe(4);
    expect(colorDegree('yellow')).toBe(6);
  });
});
