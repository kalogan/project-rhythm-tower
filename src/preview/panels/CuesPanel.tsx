import { useEffect, useRef, useState } from 'react';
import {
  BUTTONS,
  CUE_COLORS,
  DEFAULT_MAPPING,
  type Button,
  type ColorMapping,
  type CueColor,
} from '../../core/index.js';
import { bakeKnightAtlas, SpriteAnimator } from '../../game/sprite/spriteAtlas.js';
import { attackClipFor } from '../../game/sprite/clips.js';
import { ShatterField } from '../../game/sprite/shatter.js';
import { Fx } from '../../game/fx.js';
import { Btn, MONO, PANEL, Section, Slider } from '../ui.js';

/** The in-game cue palette + button palette (mirrors FloorPlayer's CUE_HEX/BUTTON_HEX). */
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

// Module-level dash patterns so the decoy ring allocates no array per frame (matches FloorPlayer).
const DECOY_DASH: readonly number[] = [4, 4];
const EMPTY_DASH: readonly number[] = [];

/** A fixed scrambled permutation of the default map — previews a mutated-band legend. */
const SCRAMBLED_MAPPING: ColorMapping = { blue: 'A', green: 'B', red: 'Y', yellow: 'X' };

type CueKind = 'tap' | 'decoy' | 'double' | 'hold';
const CUE_KINDS: readonly { kind: CueKind; label: string }[] = [
  { kind: 'tap', label: 'TAP' },
  { kind: 'decoy', label: 'DECOY' },
  { kind: 'double', label: 'DOUBLE' },
  { kind: 'hold', label: 'HOLD' },
];

/**
 * Draw ONE cue glyph centred at (cx, cy), using the EXACT shape code from
 * FloorPlayer.draw() so the lab reads identically to the game. `holdActive` brightens a
 * hold (as when the player is mid-press); `holdBeats` sets the tail length in beats.
 */
function drawCueKind(
  ctx: CanvasRenderingContext2D,
  kind: CueKind,
  cx: number,
  cy: number,
  color: CueColor,
  color2: CueColor,
  holdActive: boolean,
  holdBeats: number,
): void {
  ctx.globalAlpha = 1;
  if (kind === 'double') {
    // DOUBLE: outer ring = color, inner disc = color2, white seam between (press BOTH).
    ctx.fillStyle = CUE_HEX[color];
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CUE_HEX[color2];
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === 'decoy') {
    // DECOY: small + dimmed, black dashed "no" ring + red X — read is "leave it".
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = CUE_HEX[color];
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
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy - 11);
    ctx.lineTo(cx + 11, cy + 11);
    ctx.moveTo(cx + 11, cy - 11);
    ctx.lineTo(cx - 11, cy + 11);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (kind === 'hold') {
    // HOLD: a head disc + tail bar running UP the lane + an end-cap ring; brighter active.
    const PX_PER_BEAT = 34; // lab-local scale for the tail length (a beat ≈ this many px)
    const tailLen = holdBeats * PX_PER_BEAT;
    const ex = cx;
    const ey = cy - tailLen;
    const HALF = 11;
    ctx.fillStyle = CUE_HEX[color];
    ctx.globalAlpha = holdActive ? 1 : 0.5;
    ctx.fillRect(cx - HALF, ey, HALF * 2, cy - ey);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = holdActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ex, ey, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = CUE_HEX[color];
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    if (holdActive) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // TAP: a plain filled disc r26.
    ctx.fillStyle = CUE_HEX[color];
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The mutable bits the rAF loop reads each frame, held in one ref (no React churn). */
interface LoopState {
  color: CueColor;
  color2: CueColor;
  holdBeats: number;
  holdActive: boolean;
  mapping: ColorMapping;
}

export function CuesPanel(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Persistent, pre-allocated engine pieces + the live knob values for the loop.
  const fxRef = useRef<Fx | null>(null);
  const shatterRef = useRef<ShatterField | null>(null);
  const animRef = useRef<SpriteAnimator | null>(null);
  const stateRef = useRef<LoopState>({
    color: 'blue',
    color2: 'red',
    holdBeats: 2,
    holdActive: true,
    mapping: DEFAULT_MAPPING,
  });

  // React state mirrors the side controls; an effect syncs it into stateRef for the loop.
  const [color, setColor] = useState<CueColor>('blue');
  const [color2, setColor2] = useState<CueColor>('red');
  const [holdBeats, setHoldBeats] = useState(2);
  const [holdActive, setHoldActive] = useState(true);
  const [mutated, setMutated] = useState(false);

  const mapping = mutated ? SCRAMBLED_MAPPING : DEFAULT_MAPPING;

  // One shared monotonic clock base so the draw loop and the trigger handlers (which call
  // animator.play / fx.slash) live on the SAME timeline — otherwise the swing/slash never plays.
  const t0Ref = useRef<number>(performance.now());
  const fxClock = (): number => (performance.now() - t0Ref.current) / 1000;

  useEffect(() => {
    stateRef.current = { color, color2, holdBeats, holdActive, mapping };
  }, [color, color2, holdBeats, holdActive, mapping]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pre-allocate ONCE — nothing in the loop news up an object (hot-path discipline).
    const fx = new Fx();
    const shatter = new ShatterField();
    const animator = new SpriteAnimator(bakeKnightAtlas());
    fxRef.current = fx;
    shatterRef.current = shatter;
    animRef.current = animator;

    // The loop reads the SAME clock base the trigger handlers use (t0Ref).
    t0Ref.current = performance.now();
    const clock = (): number => (performance.now() - t0Ref.current) / 1000;

    const resize = (): void => {
      const host = canvas.parentElement;
      canvas.width = host ? host.clientWidth : window.innerWidth;
      canvas.height = host ? host.clientHeight : window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let lastNow = clock();
    const loop = (): void => {
      const now = clock();
      const dt = Math.min(0.05, Math.max(0, now - lastNow));
      lastNow = now;
      fx.decay(dt);
      shatter.update(dt);
      draw(ctx, canvas, stateRef.current, now, animator, shatter, fx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      fxRef.current = null;
      shatterRef.current = null;
      animRef.current = null;
    };
  }, []);

  // The FX stage's strike point, kept in sync with draw() so triggers land on it.
  const stagePoint = (): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return { x: canvas.width / 2, y: canvas.height * 0.66 };
  };

  // Fire a per-button attack swing + a button-tinted slash (mirrors FloorPlayer.handlePress).
  const fireAttack = (button: Button): void => {
    const anim = animRef.current;
    const fx = fxRef.current;
    if (!anim || !fx) return;
    const now = fxClock();
    anim.play(attackClipFor(button), now);
    fx.slash(BUTTON_HEX[button], now);
  };

  // A colour-coded cue shatter at the strike point (mirrors a perfect-hit burst).
  const fireShatter = (): void => {
    const shatter = shatterRef.current;
    if (!shatter) return;
    const p = stagePoint();
    shatter.burst(p.x, p.y, CUE_HEX[stateRef.current.color], 22);
  };

  // The gold flash + camera shake of a clean perfect (Fx.flashHit + Fx.shakeHit).
  const fireFlashShake = (): void => {
    const fx = fxRef.current;
    if (!fx) return;
    fx.flashHit(0.5, '#ffd98a');
    fx.shakeHit(8);
  };

  // A whiff: a quick shake on a bad parry (so the director can read the miss feel).
  const fireMiss = (): void => {
    const anim = animRef.current;
    const fx = fxRef.current;
    if (!anim || !fx) return;
    anim.play('miss', fxClock());
    fx.shakeHit(4.5);
  };

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, left: 320 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
      </div>

      <div style={PANEL}>
        <div style={{ fontWeight: 700 }}>Cue & FX lab</div>
        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
          every cue kind + the juice, drawn exactly as in-game
        </div>

        <Section title="Demo cue colour">
          <div style={{ display: 'flex', gap: 8 }}>
            {CUE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  flex: 1,
                  height: 30,
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: CUE_HEX[c],
                  border: color === c ? '3px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
          <div style={{ opacity: 0.6, fontSize: 11, marginTop: 6 }}>
            second colour (DOUBLE inner disc)
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {CUE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor2(c)}
                title={c}
                style={{
                  flex: 1,
                  height: 22,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: CUE_HEX[c],
                  border: color2 === c ? '3px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
        </Section>

        <Section title="Hold">
          <Slider label="Hold length (beats)" value={holdBeats} min={1} max={8} onChange={setHoldBeats} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <input type="checkbox" checked={holdActive} onChange={(e) => setHoldActive(e.target.checked)} />
            <span style={{ opacity: 0.85 }}>held (bright/locked)</span>
          </label>
        </Section>

        <Section title="Colour → button mapping">
          <div style={{ ...MONO, fontSize: 13 }}>
            {CUE_COLORS.map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: CUE_HEX[c],
                    display: 'inline-block',
                  }}
                />
                <span style={{ opacity: 0.8, width: 56 }}>{c}</span>
                <span style={{ opacity: 0.5 }}>→</span>
                <span style={{ fontWeight: 700 }}>{mapping[c]}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Btn onClick={() => setMutated((m) => !m)}>
              {mutated ? 'mutated — reset to default' : 'mutate mapping (scramble)'}
            </Btn>
          </div>
        </Section>

        <Section title="Fire effects">
          <div style={{ opacity: 0.6, fontSize: 11, marginBottom: 6 }}>per-button attack swing + slash</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {BUTTONS.map((b) => (
              <button
                key={b}
                onClick={() => fireAttack(b)}
                style={{
                  flex: 1,
                  height: 34,
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: '#0b1020',
                  fontWeight: 700,
                  background: BUTTON_HEX[b],
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                {b}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Btn onClick={fireShatter}>shatter</Btn>
            <Btn onClick={fireFlashShake}>flash + shake</Btn>
            <Btn onClick={fireMiss}>whiff (miss)</Btn>
          </div>
        </Section>
      </div>
    </>
  );
}

/** The cue row, the FX stage, and the legend — mirrors FloorPlayer.draw()'s loop/draw order. */
function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: LoopState,
  now: number,
  animator: SpriteAnimator,
  shatter: ShatterField,
  fx: Fx,
): void {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  // Dark backdrop matching the other panels.
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, w, h);

  // --- The cue vocabulary row, each kind drawn exactly as in-game. ---
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CUE VOCABULARY', w / 2, h * 0.1);

  const rowY = h * 0.26;
  const slot = w / (CUE_KINDS.length + 1);
  CUE_KINDS.forEach((k, i) => {
    const cx = slot * (i + 1);
    drawCueKind(ctx, k.kind, cx, rowY, s.color, s.color2, s.holdActive, s.holdBeats);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(k.label, cx, rowY + 56);
  });

  // --- The mapping legend (the 4 colours with their mapped letters). ---
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('MAPPING LEGEND', w / 2, h * 0.42 - 30);
  ctx.font = '16px system-ui, sans-serif';
  const ly = h * 0.42;
  CUE_COLORS.forEach((c, i) => {
    const lx = w / 2 - 96 + i * 64;
    ctx.fillStyle = CUE_HEX[c];
    ctx.beginPath();
    ctx.arc(lx, ly, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.fillText(s.mapping[c], lx, ly + 5);
  });

  // --- The FX stage: fighter at a strike point, with shake/slash/shatter/flash. ---
  const laneX = w / 2;
  const hitY = h * 0.66;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('FX STAGE', w / 2, h * 0.52);

  const shake = fx.shakeOffset();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // Strike-point marker (timing reference), same ellipse as the game.
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(laneX, hitY, 70, 12, 0, 0, Math.PI * 2);
  ctx.stroke();

  // The swordfighter, facing up the lane (feet anchored just below the strike point).
  animator.draw(ctx, now, laneX, hitY + 40, 1.15, 0);

  // Slash arc + shatter shards on top (drawn inside the shake transform, like the game).
  fx.drawSlash(ctx, laneX, hitY, now, 0);
  shatter.draw(ctx);

  ctx.restore(); // end camera-shake transform

  // Full-screen hit flash, last and shake-independent (mirrors FloorPlayer).
  fx.drawFlash(ctx, w, h);
}
