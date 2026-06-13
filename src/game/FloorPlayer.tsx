import { useEffect, useRef, useState } from 'react';
import {
  beatToTime,
  createFloorSession,
  DEFAULT_MAPPING,
  finalize,
  generateChart,
  isComplete,
  pressButton,
  releaseButton,
  secPerBeat,
  tick,
  type BeatGrid,
  type Button,
  type ColorMapping,
  type CueColor,
  type FloorScore,
  type FloorSession,
  type Verdict,
} from '../core/index.js';
import { toChartSpec, type Floor } from '../content/schemas.js';
import type { AudioDriver } from './audio/audioDriver.js';
import { createInput } from './input.js';
import { TouchControls } from './TouchControls.js';
import { bakeKnightAtlas, SpriteAnimator } from './sprite/spriteAtlas.js';
import { attackClipFor } from './sprite/clips.js';
import { ShatterField } from './sprite/shatter.js';
import { Fx } from './fx.js';

const CUE_HEX: Readonly<Record<CueColor, string>> = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
};

const BUTTON_HEX: Readonly<Record<Button, string>> = {
  X: '#3b82f6',
  A: '#22c55e',
  B: '#ef4444',
  Y: '#eab308',
};

const CUE_COLORS: readonly CueColor[] = ['blue', 'green', 'red', 'yellow'];

// Module-level so the decoy dashed ring allocates no array per frame (hot-path).
const DECOY_DASH: readonly number[] = [4, 4];
const EMPTY_DASH: readonly number[] = [];

/** True if the active mapping diverges from the default Xbox code (a mutated band). */
function isMutatedMapping(mapping: ColorMapping): boolean {
  return CUE_COLORS.some((c) => mapping[c] !== DEFAULT_MAPPING[c]);
}

const LEAD_SEC = 2.0;
const PX_PER_SEC = 240;
/** Distance of the hit line from the lane's far edge (px). */
const HIT_INSET = 160;

/** The strike point (where cues are judged) for the current canvas orientation. */
function strikePoint(canvas: HTMLCanvasElement): { x: number; y: number; portrait: boolean } {
  const portrait = canvas.height >= canvas.width;
  return {
    portrait,
    x: portrait ? canvas.width / 2 : HIT_INSET,
    y: portrait ? canvas.height * 0.7 : canvas.height * 0.42,
  };
}

/** Detect touch/portrait so we show thumb controls and reserve room for them. */
function useShowTouch(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const compute = (): void => {
      const coarse =
        'ontouchstart' in window || (window.matchMedia?.('(pointer: coarse)').matches ?? false);
      setShow(coarse || window.innerHeight > window.innerWidth);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return show;
}

/**
 * Runs ONE floor: builds the deterministic chart, drives audio + input (keyboard,
 * gamepad, touch), and renders the cue track + a swordfighter at the hit point who
 * swings (a per-button attack) on each press and shatters a well-timed cue. The lane
 * is responsive: vertical (cues fall) in portrait, horizontal in landscape. All
 * judgment goes through the core session — the view only draws its state.
 */
export function FloorPlayer({
  floor,
  grid,
  mapping,
  audio,
  onComplete,
}: {
  floor: Floor;
  grid: BeatGrid;
  mapping: ColorMapping;
  audio: AudioDriver;
  onComplete: (score: FloorScore) => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressRef = useRef<((button: Button) => void) | null>(null);
  const showTouch = useShowTouch();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const chart = generateChart(toChartSpec(floor), floor.seed);
    let session: FloorSession = createFloorSession(chart, grid, mapping);
    // The last moment any cue can still resolve — a HOLD resolves at its END beat
    // (start + holdBeats), which can land after the last cue's start beat, so fold
    // hold tails into the floor-end clock or the floor would cut a long hold short.
    let lastCueTime = 0;
    for (const c of chart.cues) {
      const end = beatToTime(grid, c.beat + (c.kind === 'hold' ? (c.holdBeats ?? 1) : 0));
      if (end > lastCueTime) lastCueTime = end;
    }

    const animator = new SpriteAnimator(bakeKnightAtlas());
    const shatter = new ShatterField();
    const fx = new Fx();

    const t0 = audio.now() + LEAD_SEC;
    audio.scheduleFloor(grid, chart, t0);
    const floorTime = (): number => audio.now() - t0;

    let flash: { verdict: Verdict; at: number } | null = null;
    const handlePress = (button: Button, t: number): void => {
      const res = pressButton(session, button, t);
      session = res.session;
      animator.play(attackClipFor(button), t); // the character always swings on input
      fx.slash(BUTTON_HEX[button], t); // blade trail tinted with the pressed button
      if (res.verdict) flash = { verdict: res.verdict, at: t };

      const sp = strikePoint(canvas);
      if (res.verdict === 'perfect' && res.cueId !== null) {
        const cue = chart.cues[res.cueId];
        shatter.burst(sp.x, sp.y, cue ? CUE_HEX[cue.color] : '#ffffff', 22);
        fx.flashHit(0.5, '#ffd98a'); // gold pop on a perfect
        fx.shakeHit(8);
      } else if (res.verdict === 'good' && res.cueId !== null) {
        const cue = chart.cues[res.cueId];
        shatter.burst(sp.x, sp.y, cue ? CUE_HEX[cue.color] : '#ffffff', 12);
        fx.flashHit(0.22, '#4ff0d8');
        fx.shakeHit(2.5);
      } else if (res.verdict === 'wrong') {
        shatter.burst(sp.x, sp.y, '#ffffff', 9); // a white clash spark on a bad parry
        fx.shakeHit(4.5);
      }
    };
    pressRef.current = (button) => handlePress(button, floorTime());

    // RELEASE: only matters for an in-flight HOLD. An early let-go breaks it (miss);
    // letting go at/after the end is fine. The miss whiff is fired by the loop's miss
    // detector below (it watches the miss count), so we just fold the new session in.
    const handleRelease = (button: Button, t: number): void => {
      const res = releaseButton(session, button, t);
      session = res.session;
    };

    const input = createInput(floorTime, handlePress, handleRelease);

    const resize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let done = false;
    let lastNow = floorTime();
    let prevMisses = 0;
    // Pre-allocated: which HOLD cues have already had their completion FX fired, so the
    // shatter/flash pops once when tick() resolves a held-through hold (no per-frame alloc).
    const holdFxFired = chart.cues.map(() => false);
    const loop = (): void => {
      input.pollGamepad();
      const now = floorTime();
      const dt = Math.min(0.05, Math.max(0, now - lastNow));
      lastNow = now;

      session = tick(session, now);
      // A cue that passed unhit (or a hold broken early) makes the fighter flinch (whiff).
      const misses = countVerdict(session, 'miss');
      if (misses > prevMisses) {
        animator.play('miss', now);
        fx.shakeHit(3);
      }
      prevMisses = misses;

      // A HOLD completes inside tick() (not on a press), so fire its shatter/flash here
      // once, when its verdict first lands as perfect/good.
      const sp = strikePoint(canvas);
      for (let i = 0; i < chart.cues.length; i++) {
        const cue = chart.cues[i]!;
        if (cue.kind !== 'hold' || holdFxFired[i]) continue;
        const v = session.verdicts[i];
        if (v === 'perfect' || v === 'good') {
          holdFxFired[i] = true;
          flash = { verdict: v, at: now };
          if (v === 'perfect') {
            shatter.burst(sp.x, sp.y, CUE_HEX[cue.color], 22);
            fx.flashHit(0.5, '#ffd98a');
            fx.shakeHit(8);
          } else {
            shatter.burst(sp.x, sp.y, CUE_HEX[cue.color], 12);
            fx.flashHit(0.22, '#4ff0d8');
            fx.shakeHit(2.5);
          }
        }
      }

      fx.decay(dt);
      shatter.update(dt);
      draw(ctx2d, canvas, session, chart.cues, grid, mapping, now, flash, animator, shatter, fx);

      if (!done && (isComplete(session) || now > lastCueTime + 1.4)) {
        done = true;
        session = tick(session, lastCueTime + 100); // resolve any stragglers
        onComplete(finalize(session, floor.clearThreshold));
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      input.dispose();
      audio.stopAll();
      pressRef.current = null;
    };
  }, [floor, grid, mapping, audio, onComplete]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
      {showTouch && <TouchControls onPress={(b) => pressRef.current?.(b)} />}
    </>
  );
}

function countVerdict(session: FloorSession, verdict: Verdict): number {
  let n = 0;
  for (const v of session.verdicts) if (v === verdict) n++;
  return n;
}

const VERDICT_TEXT: Readonly<Record<Verdict, string>> = {
  perfect: 'PERFECT',
  good: 'GOOD',
  wrong: 'WRONG',
  miss: 'MISS',
  avoided: 'DODGED',
};

const VERDICT_COLOR: Readonly<Record<Verdict, string>> = {
  perfect: '#ffd98a',
  good: '#4ff0d8',
  wrong: '#ef4444',
  miss: '#94a3b8',
  avoided: '#a3e635',
};

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  session: FloorSession,
  cues: FloorSession['cues'],
  grid: BeatGrid,
  mapping: ColorMapping,
  now: number,
  flash: { verdict: Verdict; at: number } | null,
  animator: SpriteAnimator,
  shatter: ShatterField,
  fx: Fx,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const portrait = h >= w;

  ctx.clearRect(0, 0, w, h);

  // Travel axis. Portrait: cues FALL down a vertical lane to a hit point above the
  // thumb buttons. Landscape: cues approach the hit point from the right.
  const hitPos = portrait ? h * 0.7 : HIT_INSET; // y (portrait) or x (landscape)
  const lateral = portrait ? w / 2 : h * 0.42; // x center (portrait) or y center (landscape)

  // Camera shake wraps the whole scene; the flash overlay is drawn after (no shake).
  const shake = fx.shakeOffset();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // Subtle hit-zone marker (timing reference) under the fighter.
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (portrait) ctx.ellipse(lateral, hitPos, 70, 12, 0, 0, Math.PI * 2);
  else ctx.ellipse(hitPos, lateral, 12, 60, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Cues approaching the hit point.
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    const verdict = session.verdicts[i];
    const along = (beatToTime(grid, cue.beat) - now) * PX_PER_SEC;
    const cx = portrait ? lateral : hitPos + along;
    const cy = portrait ? hitPos - along : lateral;
    if (portrait ? cy < -60 || cy > h + 60 : cx < hitPos - 120 || cx > w + 60) continue;
    // A shattered (hit) cue is gone; only draw unresolved / passed-by cues.
    if (verdict === 'perfect' || verdict === 'good') continue;

    ctx.globalAlpha = verdict ? 0.25 : 1;
    if (cue.kind === 'double') {
      // DOUBLE: two colours on one cue (press BOTH buttons). Outer ring = color,
      // inner disc = color2, so the player reads "two presses needed".
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CUE_HEX[cue.color2 ?? cue.color];
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();
      // A thin white seam separates the two colours so neither blends into the other.
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();
    } else if (cue.kind === 'decoy') {
      // DECOY: a fake-out you must NOT hit — drawn small + dimmed with a black "no"
      // ring and a red X struck through it so the read is unmistakably "leave it".
      ctx.globalAlpha = verdict ? 0.2 : 0.55;
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, cy, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash(DECOY_DASH);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash(EMPTY_DASH);
      // The "no" cross-out.
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy - 11);
      ctx.lineTo(cx + 11, cy + 11);
      ctx.moveTo(cx + 11, cy - 11);
      ctx.lineTo(cx - 11, cy + 11);
      ctx.stroke();
    } else if (cue.kind === 'hold') {
      // HOLD: a head you press ON the beat plus a TAIL/bar running back along the lane
      // for `holdBeats` (the far end is the END time you must hold until). While the cue
      // is actively held, the bar locks bright + filled (so the read is "keep holding").
      const holdBeats = cue.holdBeats ?? 1;
      const tailLen = holdBeats * secPerBeat(grid) * PX_PER_SEC;
      // The tail extends AWAY from the hit point (later beats = further out): in portrait
      // upward (toward smaller y), in landscape rightward (toward larger x).
      const ex = portrait ? cx : cx + tailLen;
      const ey = portrait ? cy - tailLen : cy;
      const held = session.holds[i];
      const active = held !== null && held !== undefined && !held.broken;
      const HALF = 11; // half-thickness of the lane bar
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.globalAlpha = (verdict ? 0.25 : 1) * (active ? 1 : 0.5);
      // The connecting bar between head and end-cap.
      if (portrait) ctx.fillRect(cx - HALF, ey, HALF * 2, cy - ey);
      else ctx.fillRect(cx, cy - HALF, ex - cx, HALF * 2);
      ctx.globalAlpha = verdict ? 0.25 : 1;
      // End-cap ring at the release point (the moment you may let go).
      ctx.strokeStyle = active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ex, ey, 13, 0, Math.PI * 2);
      ctx.stroke();
      // The head you press on the beat — a bright disc, ringed white while locked.
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The swordfighter at the hit point, facing the incoming cues.
  const facing = portrait ? 0 : Math.PI / 2;
  if (portrait) animator.draw(ctx, now, lateral, hitPos + 40, 1.15, 0);
  else animator.draw(ctx, now, hitPos, lateral, 1.0, facing);

  // Blade slash arc + shatter shards on top.
  fx.drawSlash(ctx, portrait ? lateral : hitPos, portrait ? hitPos : lateral, now, facing);
  shatter.draw(ctx);

  ctx.restore(); // end camera-shake transform; UI below is stable

  // Mapping legend. Landscape: always shown bottom-left. Portrait: hidden for the
  // default map (the tinted thumb buttons teach it), but SHOWN top-centre when the
  // mapping is MUTATED so mobile players can learn the new colour->button table.
  const showLegend = !portrait || isMutatedMapping(mapping);
  if (showLegend) {
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    CUE_COLORS.forEach((c, i) => {
      const lx = portrait ? w / 2 - 96 + i * 64 : 40 + i * 64;
      const ly = portrait ? 84 : h - 48;
      ctx.fillStyle = CUE_HEX[c];
      ctx.beginPath();
      ctx.arc(lx, ly, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.fillText(mapping[c], lx, ly + 5);
    });
  }

  // HUD: combo + progress (top-left).
  const resolved = session.verdicts.filter((v) => v !== null).length;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(`Combo ${session.combo}`, 24, 44);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(`${resolved}/${cues.length}`, 24, 70);

  // Verdict flash near the hit point.
  if (flash && now - flash.at < 0.45) {
    ctx.globalAlpha = 1 - (now - flash.at) / 0.45;
    ctx.fillStyle = VERDICT_COLOR[flash.verdict];
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (portrait) ctx.fillText(VERDICT_TEXT[flash.verdict], lateral, hitPos - 110);
    else ctx.fillText(VERDICT_TEXT[flash.verdict], hitPos, lateral - 80);
    ctx.globalAlpha = 1;
  }

  // Full-screen hit flash, last and shake-independent.
  fx.drawFlash(ctx, w, h);
}
