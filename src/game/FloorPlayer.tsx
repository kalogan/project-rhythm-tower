import { useEffect, useRef } from 'react';
import {
  beatToTime,
  createFloorSession,
  finalize,
  generateChart,
  isComplete,
  pressButton,
  tick,
  type BeatGrid,
  type ColorMapping,
  type CueColor,
  type FloorScore,
  type FloorSession,
  type Verdict,
} from '../core/index.js';
import { toChartSpec, type Floor } from '../content/schemas.js';
import type { AudioDriver } from './audio/audioDriver.js';
import { createInput } from './input.js';

const CUE_HEX: Readonly<Record<CueColor, string>> = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
};

const LEAD_SEC = 2.0;
const PX_PER_SEC = 240;
const HIT_X = 160;

/**
 * Runs ONE floor: builds the deterministic chart, drives audio + input, and renders
 * the cue track + HUD imperatively to a canvas (no per-frame React churn). All
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
    const input = createInput(floorTime, (button, t) => {
      const res = pressButton(session, button, t);
      session = res.session;
      if (res.verdict) flash = { verdict: res.verdict, at: t };
    });

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
    };
  }, [floor, grid, mapping, audio, onComplete]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />;
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
  const laneY = h * 0.42;

  ctx.clearRect(0, 0, w, h);

  // Hit line.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(HIT_X, laneY - 60);
  ctx.lineTo(HIT_X, laneY + 60);
  ctx.stroke();

  // Cues approaching the hit line.
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    const verdict = session.verdicts[i];
    const x = HIT_X + (beatToTime(grid, cue.beat) - now) * PX_PER_SEC;
    if (x < HIT_X - 120 || x > w + 60) continue;

    ctx.globalAlpha = verdict ? 0.25 : 1;
    ctx.fillStyle = CUE_HEX[cue.color];
    ctx.beginPath();
    ctx.arc(x, laneY, cue.kind === 'decoy' ? 16 : 24, 0, Math.PI * 2);
    ctx.fill();
    if (cue.kind === 'decoy') {
      ctx.globalAlpha = verdict ? 0.25 : 1;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Mapping legend (baseline teaching aid: which color = which button).
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

  // HUD: combo + progress.
  const resolved = session.verdicts.filter((v) => v !== null).length;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(`Combo ${session.combo}`, 24, 40);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(`${resolved}/${cues.length}`, 24, 66);

  // Verdict flash near the hit line.
  if (flash && now - flash.at < 0.45) {
    ctx.globalAlpha = 1 - (now - flash.at) / 0.45;
    ctx.fillStyle = VERDICT_COLOR[flash.verdict];
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(VERDICT_TEXT[flash.verdict], HIT_X, laneY - 80);
    ctx.globalAlpha = 1;
  }
}
