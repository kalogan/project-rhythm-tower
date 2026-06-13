import { describe, it, expect } from 'vitest';
import { mergeTop, type ScoreEntry } from './leaderboard.js';

const entry = (points: number, at: number): ScoreEntry => ({
  points,
  at,
  floorName: 'Test',
  accuracy: 1,
  cleared: true,
});

describe('leaderboard mergeTop', () => {
  it('keeps only the top N by points', () => {
    const board = [entry(300, 1), entry(200, 2), entry(100, 3)];
    const next = mergeTop(board, entry(250, 4), 3);
    expect(next.map((e) => e.points)).toEqual([300, 250, 200]);
  });

  it('inserts into an empty board', () => {
    expect(mergeTop([], entry(120, 1)).map((e) => e.points)).toEqual([120]);
  });

  it('drops an entry that does not make the cut', () => {
    const board = [entry(300, 1), entry(200, 2), entry(100, 3)];
    const next = mergeTop(board, entry(50, 4), 3);
    expect(next.map((e) => e.points)).toEqual([300, 200, 100]);
  });

  it('breaks ties by recency (newer first)', () => {
    const next = mergeTop([entry(100, 1)], entry(100, 5), 3);
    expect(next.map((e) => e.at)).toEqual([5, 1]);
  });
});
