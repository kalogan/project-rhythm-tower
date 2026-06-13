import { describe, it, expect } from 'vitest';
import { makePrng } from './prng.js';
import { DEFAULT_MAPPING, expectedButtons, type Cue, type ColorMapping } from './cue.js';
import { makeBeatGrid, beatToTime, timeToBeat, secPerBeat } from './beatGrid.js';
import { generateChart, type ChartSpec } from './chart.js';
import { DEFAULT_WINDOWS, timingVerdict } from './judgment.js';
import { createFloorSession, pressButton, tick, finalize, isComplete } from './session.js';

const BAND1_SPEC: ChartSpec = {
  bpm: 100,
  beatsPerBar: 4,
  beats: 32,
  colors: ['blue', 'green', 'red', 'yellow'],
  density: 0.6,
  decoyChance: 0,
  doubleChance: 0,
  holdChance: 0,
  leadInBeats: 4,
};

describe('prng', () => {
  it('is deterministic for a given seed', () => {
    const a = makePrng(1234);
    const b = makePrng(1234);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 5 }, makePrng(1).next);
    const b = Array.from({ length: 5 }, makePrng(2).next);
    expect(a).not.toEqual(b);
  });

  it('stays within range', () => {
    const p = makePrng(99);
    for (let i = 0; i < 1000; i++) {
      const v = p.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('beat grid', () => {
  it('round-trips beat <-> time', () => {
    const grid = makeBeatGrid(120, 4, 0.5);
    expect(secPerBeat(grid)).toBeCloseTo(0.5);
    expect(beatToTime(grid, 4)).toBeCloseTo(2.5);
    expect(timeToBeat(grid, 2.5)).toBeCloseTo(4);
  });
});

describe('cue decode (the core skill)', () => {
  it('maps Xbox face-button colors by default', () => {
    expect(DEFAULT_MAPPING).toEqual({ blue: 'X', green: 'A', red: 'B', yellow: 'Y' });
  });

  it('resolves the expected button under the active mapping', () => {
    const cue: Cue = { id: 0, beat: 0, color: 'blue', kind: 'tap' };
    expect(expectedButtons(cue, DEFAULT_MAPPING)).toEqual(['X']);
  });

  it('honors a MUTATED mapping (the escalation axis)', () => {
    const mutated: ColorMapping = { blue: 'B', green: 'Y', red: 'X', yellow: 'A' };
    const cue: Cue = { id: 0, beat: 0, color: 'blue', kind: 'tap' };
    expect(expectedButtons(cue, mutated)).toEqual(['B']);
  });

  it('expects no press for a decoy', () => {
    const cue: Cue = { id: 0, beat: 0, color: 'red', kind: 'decoy' };
    expect(expectedButtons(cue, DEFAULT_MAPPING)).toEqual([]);
  });
});

describe('chart generation', () => {
  it('is deterministic for a given spec + seed', () => {
    const a = generateChart(BAND1_SPEC, 4242);
    const b = generateChart(BAND1_SPEC, 4242);
    expect(a).toEqual(b);
  });

  it('changes with the seed', () => {
    const a = generateChart(BAND1_SPEC, 1);
    const b = generateChart(BAND1_SPEC, 2);
    expect(a).not.toEqual(b);
  });

  it('respects the lead-in and never exceeds the beat count', () => {
    const chart = generateChart(BAND1_SPEC, 7);
    expect(chart.cues.length).toBeGreaterThan(0);
    for (const cue of chart.cues) {
      expect(cue.beat).toBeGreaterThanOrEqual(BAND1_SPEC.leadInBeats);
      expect(cue.beat).toBeLessThan(BAND1_SPEC.beats);
    }
  });

  it('only emits tap cues when special chances are zero', () => {
    const chart = generateChart(BAND1_SPEC, 11);
    expect(chart.cues.every((c) => c.kind === 'tap')).toBe(true);
  });
});

describe('judgment windows', () => {
  it('grades by absolute timing error', () => {
    expect(timingVerdict(0.0, DEFAULT_WINDOWS)).toBe('perfect');
    expect(timingVerdict(0.1, DEFAULT_WINDOWS)).toBe('good');
    expect(timingVerdict(0.3, DEFAULT_WINDOWS)).toBe('miss');
  });
});

describe('floor session (authoritative judgment)', () => {
  const grid = makeBeatGrid(100, 4, 0);

  it('grades a correctly-decoded press on the beat as perfect', () => {
    const chart = { cues: [{ id: 0, beat: 8, color: 'blue', kind: 'tap' } as Cue] };
    const session = createFloorSession(chart, grid);
    const targetTime = beatToTime(grid, 8);
    const { verdict } = pressButton(session, 'X', targetTime);
    expect(verdict).toBe('perfect');
  });

  it('marks a wrong-button press (decode failure) as wrong', () => {
    const chart = { cues: [{ id: 0, beat: 8, color: 'blue', kind: 'tap' } as Cue] };
    const session = createFloorSession(chart, grid);
    const { verdict } = pressButton(session, 'A', beatToTime(grid, 8));
    expect(verdict).toBe('wrong');
  });

  it('auto-misses a cue whose window has passed', () => {
    const chart = { cues: [{ id: 0, beat: 8, color: 'blue', kind: 'tap' } as Cue] };
    let session = createFloorSession(chart, grid);
    session = tick(session, beatToTime(grid, 8) + 1);
    expect(isComplete(session)).toBe(true);
    expect(finalize(session).miss).toBe(1);
  });

  it('rewards avoiding a decoy', () => {
    const chart = { cues: [{ id: 0, beat: 8, color: 'red', kind: 'decoy' } as Cue] };
    let session = createFloorSession(chart, grid);
    session = tick(session, beatToTime(grid, 8) + 1);
    const score = finalize(session);
    expect(score.avoided).toBe(1);
    expect(score.cleared).toBe(true);
  });

  it('clears a floor played perfectly and tracks combo', () => {
    const chart = generateChart({ ...BAND1_SPEC, beats: 16 }, 31);
    let session = createFloorSession(chart, grid);
    for (const cue of chart.cues) {
      const button = expectedButtons(cue, DEFAULT_MAPPING)[0]!;
      session = pressButton(session, button, beatToTime(grid, cue.beat)).session;
    }
    const score = finalize(session);
    expect(score.cleared).toBe(true);
    expect(score.accuracy).toBeCloseTo(1);
    expect(score.maxCombo).toBe(chart.cues.length);
    expect(score.miss).toBe(0);
  });
});
