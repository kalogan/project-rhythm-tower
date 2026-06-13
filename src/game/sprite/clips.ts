import type { Button } from '../../core/index.js';

/**
 * Pure sprite-clip logic (no DOM/canvas) so it's unit-testable. A clip is N frames
 * played at `fps`; `frameAt`/`clipDone` are pure functions of elapsed time, which
 * keeps the swing deterministic and replayable.
 *
 * This also DEFINES the atlas the renderer bakes (and that a real hand-drawn atlas
 * must match): same clip names + frame counts. Drop-in art replaces the placeholder
 * by providing a sheet whose clips line up with KNIGHT_CLIPS.
 */
export interface ClipSpec {
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
}

export type ClipName = 'idle' | 'attackX' | 'attackA' | 'attackB' | 'attackY' | 'miss';

export const KNIGHT_CLIPS: Readonly<Record<ClipName, ClipSpec>> = {
  idle: { frames: 4, fps: 6, loop: true },
  attackX: { frames: 5, fps: 20, loop: false },
  attackA: { frames: 5, fps: 20, loop: false },
  attackB: { frames: 5, fps: 20, loop: false },
  attackY: { frames: 5, fps: 20, loop: false },
  miss: { frames: 4, fps: 14, loop: false },
};

export const CLIP_ORDER: readonly ClipName[] = ['idle', 'attackX', 'attackA', 'attackB', 'attackY', 'miss'];

/** Which attack clip a face button triggers. */
export function attackClipFor(button: Button): ClipName {
  switch (button) {
    case 'X':
      return 'attackX';
    case 'A':
      return 'attackA';
    case 'B':
      return 'attackB';
    case 'Y':
      return 'attackY';
  }
}

/** The frame index to show for a clip at `elapsedSec` since it started. */
export function frameAt(spec: ClipSpec, elapsedSec: number): number {
  const raw = Math.floor(Math.max(0, elapsedSec) * spec.fps);
  if (spec.loop) return ((raw % spec.frames) + spec.frames) % spec.frames;
  return Math.min(raw, spec.frames - 1);
}

/** A non-looping clip is done once its last frame's time has elapsed. */
export function clipDone(spec: ClipSpec, elapsedSec: number): boolean {
  return !spec.loop && elapsedSec * spec.fps >= spec.frames;
}
