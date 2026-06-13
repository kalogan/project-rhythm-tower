import { CLIP_ORDER, KNIGHT_CLIPS, clipDone, frameAt, type ClipName } from './clips.js';

/**
 * Sprite atlas + animator. The placeholder atlas is BAKED procedurally into one
 * canvas (a real sprite sheet, just generated) so it can be swapped for hand-drawn
 * art later: provide an image whose frames match KNIGHT_CLIPS (same clip order +
 * counts) and build a SpriteAtlas from it instead of baking. Drawing is a pure
 * function of the floor clock, so the swing stays in sync with audio/judgment.
 */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SpriteAtlas {
  readonly source: CanvasImageSource;
  readonly cell: number;
  readonly frames: Readonly<Record<ClipName, Frame[]>>;
}

const CELL = 120;

const ACCENT: Readonly<Record<ClipName, string>> = {
  idle: '#9fb3c8',
  attackX: '#3b82f6',
  attackA: '#22c55e',
  attackB: '#ef4444',
  attackY: '#eab308',
  miss: '#7c8aa0',
};

interface Pose {
  swing: number; // sword angle, 0 = straight up (toward incoming cues)
  lunge: number; // forward (toward cues) offset, 0..1
  dim: number; // 0 = bright, 1 = faded (whiff)
}

/** Per-clip pose at frame f of N — defines each attack's distinct arc. */
function poseFor(clip: ClipName, f: number, n: number): Pose {
  const p = n <= 1 ? 0 : f / (n - 1);
  switch (clip) {
    case 'idle':
      return { swing: -0.35 + Math.sin((f / n) * Math.PI * 2) * 0.08, lunge: 0, dim: 0 };
    case 'attackX': // overhead chop: up-and-back -> down-front
      return { swing: -2.4 + p * 3.0, lunge: 0.35 * Math.sin(p * Math.PI), dim: 0 };
    case 'attackA': // thrust: sword forward, big lunge
      return { swing: 0.1, lunge: Math.sin(p * Math.PI), dim: 0 };
    case 'attackB': // side slash: sweep across
      return { swing: -1.6 + p * 3.2, lunge: 0.25 * Math.sin(p * Math.PI), dim: 0 };
    case 'attackY': // spin: full revolution
      return { swing: p * Math.PI * 2, lunge: 0.2 * Math.sin(p * Math.PI), dim: 0 };
    case 'miss': // whiff + recoil back, dimmed
      return { swing: -0.9 + p * 1.2, lunge: -0.3 * Math.sin(p * Math.PI), dim: 0.5 };
  }
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fill();
}

/** Draw one faceted knight frame centered in the current transform; feet near +44. */
function drawKnight(ctx: CanvasRenderingContext2D, pose: Pose, accent: string): void {
  ctx.save();
  ctx.globalAlpha = 1 - pose.dim * 0.5;
  const ty = -pose.lunge * 16;
  ctx.translate(0, ty);

  // ground shadow (drawn relative to feet, unaffected by lunge)
  ctx.translate(0, -ty);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 46, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, ty);

  // legs
  poly(ctx, [[-12, 18], [-3, 18], [-5, 46], [-15, 46]], '#2c3550');
  poly(ctx, [[3, 18], [12, 18], [15, 46], [5, 46]], '#2c3550');
  // torso (faceted armor)
  poly(ctx, [[-15, -10], [15, -10], [12, 20], [-12, 20]], '#5b6b86');
  poly(ctx, [[-15, -10], [0, -6], [-12, 20]], '#6f7f9b');
  // head/helmet
  ctx.fillStyle = '#8593ad';
  ctx.beginPath();
  ctx.arc(0, -22, 11, 0, Math.PI * 2);
  ctx.fill();
  poly(ctx, [[-9, -24], [9, -24], [7, -19], [-7, -19]], '#1b2336'); // visor

  // sword arm: rotate around the shoulder
  ctx.save();
  ctx.translate(2, -8);
  ctx.rotate(pose.swing);
  // swing arc (motion smear)
  ctx.fillStyle = accent + '33';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 52, -0.5, 0.5);
  ctx.closePath();
  ctx.fill();
  // blade
  poly(ctx, [[-3, -6], [3, -6], [2, -52], [-2, -56]], accent);
  poly(ctx, [[-1.2, -8], [1.2, -8], [1, -52], [-1, -54]], '#ffffff'); // bright core
  // guard + hilt
  poly(ctx, [[-7, -6], [7, -6], [7, -2], [-7, -2]], '#caa46a');
  poly(ctx, [[-2, -2], [2, -2], [2, 8], [-2, 8]], '#3a2c1a');
  ctx.restore();

  ctx.restore();
}

/** Bake the placeholder knight sheet into one canvas and return its atlas. */
export function bakeKnightAtlas(): SpriteAtlas {
  const cols = Math.max(...CLIP_ORDER.map((c) => KNIGHT_CLIPS[c].frames));
  const rows = CLIP_ORDER.length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL;
  canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d')!;

  const frames = {} as Record<ClipName, Frame[]>;
  CLIP_ORDER.forEach((clip, row) => {
    const spec = KNIGHT_CLIPS[clip];
    const list: Frame[] = [];
    for (let f = 0; f < spec.frames; f++) {
      const x = f * CELL;
      const y = row * CELL;
      ctx.save();
      ctx.translate(x + CELL / 2, y + CELL / 2);
      drawKnight(ctx, poseFor(clip, f, spec.frames), ACCENT[clip]);
      ctx.restore();
      list.push({ x, y, w: CELL, h: CELL });
    }
    frames[clip] = list;
  });

  return { source: canvas, cell: CELL, frames };
}

/** Plays clips and draws the current frame at a point, oriented toward the cues. */
export class SpriteAnimator {
  private current: ClipName = 'idle';
  private startedAt = 0;

  constructor(private readonly atlas: SpriteAtlas) {}

  play(clip: ClipName, now: number): void {
    this.current = clip;
    this.startedAt = now;
  }

  /** Draw the knight with feet at (x, y), facing along `rotation` (0 = up). */
  draw(ctx: CanvasRenderingContext2D, now: number, x: number, y: number, scale: number, rotation: number): void {
    let clip = this.current;
    let elapsed = now - this.startedAt;
    if (clipDone(KNIGHT_CLIPS[clip], elapsed)) {
      clip = 'idle';
      this.current = 'idle';
      this.startedAt = now;
      elapsed = 0;
    }
    const frame = this.atlas.frames[clip][frameAt(KNIGHT_CLIPS[clip], elapsed)]!;
    const { cell, source } = this.atlas;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    // Anchor feet (drawn near +44 in cell space) at the origin.
    ctx.drawImage(source, frame.x, frame.y, cell, cell, -cell / 2, -cell / 2 - 44, cell, cell);
    ctx.restore();
  }
}
