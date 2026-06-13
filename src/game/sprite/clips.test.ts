import { describe, it, expect } from 'vitest';
import { KNIGHT_CLIPS, attackClipFor, frameAt, clipDone } from './clips.js';

describe('sprite clips', () => {
  it('maps each face button to its attack clip', () => {
    expect(attackClipFor('X')).toBe('attackX');
    expect(attackClipFor('A')).toBe('attackA');
    expect(attackClipFor('B')).toBe('attackB');
    expect(attackClipFor('Y')).toBe('attackY');
  });

  it('advances frames by fps and clamps a non-looping clip on its last frame', () => {
    const atk = KNIGHT_CLIPS.attackX; // 5 frames @ 20fps -> 0.05s/frame
    expect(frameAt(atk, 0)).toBe(0);
    expect(frameAt(atk, 0.05)).toBe(1);
    expect(frameAt(atk, 0.2)).toBe(4);
    expect(frameAt(atk, 5)).toBe(4); // clamped, never wraps
  });

  it('loops the idle clip', () => {
    const idle = KNIGHT_CLIPS.idle; // 4 frames @ 6fps
    expect(frameAt(idle, 0)).toBe(0);
    expect(frameAt(idle, 4 / 6)).toBe(0); // wrapped back to start
  });

  it('reports when a non-looping clip is finished (idle never finishes)', () => {
    expect(clipDone(KNIGHT_CLIPS.attackX, 0.1)).toBe(false);
    expect(clipDone(KNIGHT_CLIPS.attackX, 0.25)).toBe(true);
    expect(clipDone(KNIGHT_CLIPS.idle, 100)).toBe(false);
  });
});
