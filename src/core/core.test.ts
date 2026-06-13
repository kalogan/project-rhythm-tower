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

// DOUBLE cues are the Band 3 escalation: two colors flash and BOTH mapped buttons
// must land in-window. One half alone is a miss; a wrong button fails the whole cue.
describe('double cues — both buttons required', () => {
  const grid = makeBeatGrid(100, 4, 0);
  // blue+green -> X and A under the default mapping.
  const doubleChart = { cues: [{ id: 0, beat: 8, color: 'blue', kind: 'double', color2: 'green' } as Cue] };

  it('resolves PERFECT when both buttons land on the beat', () => {
    let session = createFloorSession(doubleChart, grid);
    const t = beatToTime(grid, 8);
    const r1 = pressButton(session, 'X', t);
    // First half: no verdict yet (nothing shatters), but the cue id is reported.
    expect(r1.verdict).toBeNull();
    expect(r1.cueId).toBe(0);
    session = r1.session;
    const r2 = pressButton(session, 'A', t);
    expect(r2.verdict).toBe('perfect');
    expect(r2.cueId).toBe(0);
    session = r2.session;
    expect(isComplete(session)).toBe(true);
    expect(finalize(session).perfect).toBe(1);
  });

  it('grades from the WORSE of the two timing errors (one good half = good)', () => {
    let session = createFloorSession(doubleChart, grid);
    const t = beatToTime(grid, 8);
    session = pressButton(session, 'X', t).session; // perfect-timed half
    const r2 = pressButton(session, 'A', t + 0.1); // good-window half (>perfect, <good)
    expect(r2.verdict).toBe('good');
  });

  it('MISSES when only one button is pressed before the window closes', () => {
    let session = createFloorSession(doubleChart, grid);
    const t = beatToTime(grid, 8);
    const r1 = pressButton(session, 'X', t);
    expect(r1.verdict).toBeNull();
    session = r1.session;
    session = tick(session, t + 1); // window long closed
    expect(isComplete(session)).toBe(true);
    expect(finalize(session).miss).toBe(1);
    expect(finalize(session).perfect).toBe(0);
  });

  it('a WRONG button on a double fails the whole cue', () => {
    const session = createFloorSession(doubleChart, grid);
    const r = pressButton(session, 'B', beatToTime(grid, 8)); // B is neither X nor A
    expect(r.verdict).toBe('wrong');
    expect(r.cueId).toBe(0);
    expect(isComplete(r.session)).toBe(true);
  });

  it('needs two DISTINCT presses — repeating the same correct button does not complete it', () => {
    let session = createFloorSession(doubleChart, grid);
    const t = beatToTime(grid, 8);
    session = pressButton(session, 'X', t).session;
    const again = pressButton(session, 'X', t); // same correct half again
    expect(again.verdict).toBeNull();
    session = again.session;
    expect(isComplete(session)).toBe(false); // still waiting on A
    // The window then closes with only one distinct half -> miss.
    session = tick(session, t + 1);
    expect(finalize(session).miss).toBe(1);
  });
});

// Sanity-check that rapidly SWITCHING between consecutive cues that need DIFFERENT
// buttons is actually achievable: the per-press matching must not let one press steal
// a neighbouring cue, and the hit windows of adjacent cues must not overlap.
describe('consecutive cues — switching is possible', () => {
  const fast = makeBeatGrid(120, 4, 0); // fastest current tempo: 0.5s / beat

  it('hit windows of adjacent (1-beat-apart) cues never overlap at current tempos', () => {
    // Overlap would happen only if a beat were shorter than two good-windows.
    expect(secPerBeat(fast)).toBeGreaterThan(DEFAULT_WINDOWS.goodSec * 2);
  });

  it('lands two back-to-back cues that need different buttons (X then A)', () => {
    const chart = {
      cues: [
        { id: 0, beat: 8, color: 'blue', kind: 'tap' } as Cue, // -> X
        { id: 1, beat: 9, color: 'green', kind: 'tap' } as Cue, // -> A
      ],
    };
    let s = createFloorSession(chart, fast);
    let r = pressButton(s, 'X', beatToTime(fast, 8));
    s = r.session;
    expect(r.cueId).toBe(0);
    expect(r.verdict).toBe('perfect');
    r = pressButton(s, 'A', beatToTime(fast, 9));
    s = r.session;
    expect(r.cueId).toBe(1);
    expect(r.verdict).toBe('perfect');
    const score = finalize(s);
    expect(score.miss).toBe(0);
    expect(score.wrong).toBe(0);
    expect(score.maxCombo).toBe(2);
  });

  it('a press for the first cue does not steal the second (resolves them in order)', () => {
    const chart = {
      cues: [
        { id: 0, beat: 8, color: 'blue', kind: 'tap' } as Cue,
        { id: 1, beat: 9, color: 'red', kind: 'tap' } as Cue, // -> B
      ],
    };
    let s = createFloorSession(chart, fast);
    // Press at cue 0's time: cue 1 is 0.5s away, well outside its window, so cue 0 wins.
    const r0 = pressButton(s, 'X', beatToTime(fast, 8));
    s = r0.session;
    expect(r0.cueId).toBe(0);
    // Cue 1 is still unresolved and lands on its own press.
    const r1 = pressButton(s, 'B', beatToTime(fast, 9));
    s = r1.session;
    expect(r1.cueId).toBe(1);
    expect(r1.verdict).toBe('perfect');
  });
});
