/**
 * The BEAT GRID is the source of truth for timing. Audio and visuals are both
 * projections of it: a cue lives at a beat index, and the grid converts that to
 * seconds. Procedural audio plays the grid; the cue layer animates against it.
 */
export interface BeatGrid {
  readonly bpm: number;
  readonly beatsPerBar: number;
  /** Seconds before beat 0 (lead-in). */
  readonly offsetSec: number;
}

export function makeBeatGrid(bpm: number, beatsPerBar = 4, offsetSec = 0): BeatGrid {
  if (bpm <= 0) throw new Error(`beatGrid: bpm must be > 0, got ${bpm}`);
  return { bpm, beatsPerBar, offsetSec };
}

/** Seconds per beat. */
export function secPerBeat(grid: BeatGrid): number {
  return 60 / grid.bpm;
}

/** Convert a (fractional) beat index to seconds. */
export function beatToTime(grid: BeatGrid, beat: number): number {
  return grid.offsetSec + beat * secPerBeat(grid);
}

/** Convert seconds to a (fractional) beat index. */
export function timeToBeat(grid: BeatGrid, timeSec: number): number {
  return (timeSec - grid.offsetSec) / secPerBeat(grid);
}
