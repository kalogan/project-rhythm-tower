import { useEffect, useRef, useState } from 'react';
import {
  beatToTime,
  createFloorSession,
  finalize,
  generateChart,
  isComplete,
  pressButton,
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

const CUE_HEX: Readonly<Record<CueColor, string>> = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
};

const LEAD_SEC = 2.0;
const PX_PER_SEC = 240;
/** Distance of the hit line from the lane's far edge (px). */
const HIT_INSET = 160;

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
 * gamepad, touch), and renders the cue track + HUD imperatively to a canvas. The lane
 * is responsive: vertical (cues fall) in portrait, horizontal in landscape. All
 * judgment goes through the core session — the canvas only draws its state.
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
    const lastCueTime = chart.cues.length > 0 ? beatToTime(grid, chart.cues.at(-1)!.beat) : 0;

    const t0 = audio.now() + LEAD_SEC;
    audio.scheduleFloor(grid, chart, t0);
    const floorTime = (): number => audio.now() - t0;

    let flash: { verdict: Verdict; at: number } | null = null;
    const handlePress = (button: Button, t: number): void => {
      const res = pressButton(session, button, t);
      session = res.session;
      if (res.verdict) flash = { verdict: res.verdict, at: t };
    };
    pressRef.current = (button) => handlePress(button, floorTime());

    const input = createInput(floorTime, handlePress);

    const resize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let done = false;
    const loop = (): void => {
      input.pollGamepad();
      const now = floorTime();
      session = tick(session, now);

      draw(ctx2d, canvas, session, chart.cues, grid, mapping, now, flash);

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
): void {
  const w = canvas.width;
  const h = canvas.height;
  const portrait = h >= w;

  ctx.clearRect(0, 0, w, h);

  // Travel axis. Portrait: cues FALL down a vertical lane to a hit line above the
  // thumb buttons. Landscape: cues approach a vertical hit line from the right.
  const hitPos = portrait ? h * 0.7 : HIT_INSET; // y (portrait) or x (landscape)
  const lateral = portrait ? w / 2 : h * 0.42; // x center (portrait) or y center (landscape)

  // Hit line.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (portrait) {
    ctx.moveTo(lateral - 90, hitPos);
    ctx.lineTo(lateral + 90, hitPos);
  } else {
    ctx.moveTo(hitPos, lateral - 60);
    ctx.lineTo(hitPos, lateral + 60);
  }
  ctx.stroke();

  // Cues.
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    const verdict = session.verdicts[i];
    const along = (beatToTime(grid, cue.beat) - now) * PX_PER_SEC;
    const cx = portrait ? lateral : hitPos + along;
    const cy = portrait ? hitPos - along : lateral;
    if (portrait ? cy < -60 || cy > h + 60 : cx < hitPos - 120 || cx > w + 60) continue;

    ctx.globalAlpha = verdict ? 0.25 : 1;
    ctx.fillStyle = CUE_HEX[cue.color];
    ctx.beginPath();
    ctx.arc(cx, cy, cue.kind === 'decoy' ? 18 : 26, 0, Math.PI * 2);
    ctx.fill();
    if (cue.kind === 'decoy') {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Mapping legend — landscape only (in portrait the tinted thumb buttons teach it).
  if (!portrait) {
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const colors: CueColor[] = ['blue', 'green', 'red', 'yellow'];
    colors.forEach((c, i) => {
      const lx = 40 + i * 64;
      const ly = h - 48;
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

  // Verdict flash near the hit line.
  if (flash && now - flash.at < 0.45) {
    ctx.globalAlpha = 1 - (now - flash.at) / 0.45;
    ctx.fillStyle = VERDICT_COLOR[flash.verdict];
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (portrait) ctx.fillText(VERDICT_TEXT[flash.verdict], lateral, hitPos - 110);
    else ctx.fillText(VERDICT_TEXT[flash.verdict], hitPos, lateral - 80);
    ctx.globalAlpha = 1;
  }
}
