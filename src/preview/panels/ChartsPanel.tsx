import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  beatToTime,
  generateChart,
  makeBeatGrid,
  pointsForVerdicts,
  secPerBeat,
  type Chart,
  type CueColor,
  type CueKind,
  type Verdict,
} from '../../core/index.js';
import { toChartSpec, type Floor } from '../../content/schemas.js';
import type { ChartSpec } from '../../core/chart.js';
import { BANDS } from '../../content/packs.js';
import { createAudioDriver, type AudioDriver } from '../../game/audio/audioDriver.js';
import { Btn, MONO, PANEL, Section, Slider } from '../ui.js';

// Mirror the in-game cue colours (FloorPlayer's CUE_HEX) so the timeline reads the
// same as the lane: blue/green/red/yellow discs.
const CUE_HEX: Readonly<Record<CueColor, string>> = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
};

const KINDS: readonly CueKind[] = ['tap', 'decoy', 'double', 'hold'];

// Horizontal beat-ruler timeline: beats run left→right, the chart scrolls under a
// fixed playhead. Layout constants pre-declared (no per-frame allocation).
const PX_PER_SEC = 120; // horizontal scale
const TRACK_Y = 0.5; // cue lane vertical position (fraction of canvas height)
const PLAYHEAD_FRAC = 0.28; // where the hit line sits across the canvas

const INPUT_STYLE = {
  width: '100%',
  padding: 6,
  background: '#10162e',
  color: '#e6ecff',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  boxSizing: 'border-box' as const,
};

/** Resolved per-kind cue tallies for the generated chart. */
function countKinds(chart: Chart): Record<CueKind, number> {
  const out: Record<CueKind, number> = { tap: 0, decoy: 0, double: 0, hold: 0 };
  for (const c of chart.cues) out[c.kind] += 1;
  return out;
}

export function ChartsPanel(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [bandIdx, setBandIdx] = useState(0);
  const [floorIdx, setFloorIdx] = useState(0);

  const band = BANDS[bandIdx]!;
  const floors = band.floors;
  const floor: Floor = floors[Math.min(floorIdx, floors.length - 1)]!;

  // The floor's authored spec, used to seed the knobs when band/floor changes.
  const baseSpec = useMemo(() => toChartSpec(floor), [floor]);

  // Live-overridable knobs. `colors`/`beats`/`beatsPerBar`/`leadInBeats` stay the
  // floor's authored values; the director tunes the probability knobs + seed.
  const [seed, setSeed] = useState(floor.seed);
  const [bpm, setBpm] = useState(baseSpec.bpm);
  const [density, setDensity] = useState(baseSpec.density);
  const [decoyChance, setDecoyChance] = useState(baseSpec.decoyChance);
  const [doubleChance, setDoubleChance] = useState(baseSpec.doubleChance);
  const [holdChance, setHoldChance] = useState(baseSpec.holdChance);
  const [copied, setCopied] = useState(false);

  // Re-seed all knobs to the floor's authored recipe when band/floor switches.
  useEffect(() => {
    setSeed(floor.seed);
    setBpm(baseSpec.bpm);
    setDensity(baseSpec.density);
    setDecoyChance(baseSpec.decoyChance);
    setDoubleChance(baseSpec.doubleChance);
    setHoldChance(baseSpec.holdChance);
    setCopied(false);
  }, [floor, baseSpec]);

  // Keep the floor index valid when switching to a band with fewer floors.
  useEffect(() => {
    if (floorIdx > floors.length - 1) setFloorIdx(0);
  }, [floors.length, floorIdx]);

  // The overridden spec the chart regenerates from (and what we export).
  const spec: ChartSpec = useMemo(
    () => ({
      ...baseSpec,
      bpm,
      density,
      decoyChance,
      doubleChance,
      holdChance,
    }),
    [baseSpec, bpm, density, decoyChance, doubleChance, holdChance],
  );

  // Deterministic — regenerate ONLY when spec or seed changes (never per frame).
  const chart = useMemo(() => generateChart(spec, seed), [spec, seed]);
  const grid = useMemo(() => makeBeatGrid(spec.bpm, spec.beatsPerBar), [spec.bpm, spec.beatsPerBar]);
  const kindCounts = useMemo(() => countKinds(chart), [chart]);

  // The end time of the chart (last cue start, plus any hold tail), for loop + total.
  const endTime = useMemo(() => {
    let last = 0;
    for (const c of chart.cues) {
      const end = beatToTime(grid, c.beat + (c.kind === 'hold' ? (c.holdBeats ?? 1) : 0));
      if (end > last) last = end;
    }
    return last + 1.5; // small tail so the last cue scrolls past the playhead
  }, [chart, grid]);

  const [playing, setPlaying] = useState(false);
  // Live playback clock (seconds into the chart). Kept in a ref so the rAF loop
  // doesn't re-subscribe on every tick; mirrored to state only for the readout.
  const playTimeRef = useRef(0);
  const [playTime, setPlayTime] = useState(0);

  // Audio: the real procedural bed + cue tones. The visual playhead is driven by the
  // AUDIO clock (audio.now() - t0) while playing, so sound + timeline stay sample-locked
  // — exactly how the game keeps judgment and visuals in sync.
  const audioRef = useRef<AudioDriver | null>(null);
  const t0Ref = useRef(0);
  const audioActiveRef = useRef(false);

  // Reset the playhead AND silence audio whenever the chart changes (retuning a knob,
  // switching floor) — press Play again to hear the new chart.
  useEffect(() => {
    audioRef.current?.stopAll();
    audioActiveRef.current = false;
    setPlaying(false);
    playTimeRef.current = 0;
    setPlayTime(0);
  }, [chart]);

  // Silence audio on unmount (leaving the panel / tab).
  useEffect(() => () => audioRef.current?.stopAll(), []);

  // ── The rAF draw loop. Re-created when the data it draws changes, but the clock
  // lives in refs so play/scrub state survives. dt clamped; rAF cleaned up. ──
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const endTimeRef = useRef(endTime);
  endTimeRef.current = endTime;

  const pause = useCallback(() => {
    audioRef.current?.stopAll();
    audioActiveRef.current = false;
    setPlaying(false);
  }, []);

  const play = useCallback(async () => {
    let audio = audioRef.current;
    if (!audio) {
      audio = createAudioDriver();
      audioRef.current = audio;
    }
    await audio.resume(); // the Play click is the user gesture Web Audio needs
    audio.stopAll();
    // Schedule the whole chart so audio.now() - t0 == the current playhead.
    const t0 = audio.now() - playTimeRef.current;
    audio.scheduleFloor(grid, chart, t0);
    t0Ref.current = t0;
    audioActiveRef.current = true;
    setPlaying(true);
  }, [grid, chart]);

  const stop = useCallback(() => {
    audioRef.current?.stopAll();
    audioActiveRef.current = false;
    setPlaying(false);
    playTimeRef.current = 0;
    setPlayTime(0);
  }, []);

  // Scrubbing seeks the playhead and pauses (press Play to hear from the new spot).
  const seek = useCallback((t: number) => {
    audioRef.current?.stopAll();
    audioActiveRef.current = false;
    setPlaying(false);
    playTimeRef.current = t;
    setPlayTime(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = (): void => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const loop = (): void => {
      if (playingRef.current && audioActiveRef.current && audioRef.current) {
        const audio = audioRef.current;
        let t = audio.now() - t0Ref.current;
        if (t >= endTimeRef.current) {
          // Loop: reschedule the bed from the top so the music keeps playing.
          audio.stopAll();
          const nt0 = audio.now() + 0.08;
          audio.scheduleFloor(grid, chart, nt0);
          t0Ref.current = nt0;
          t = 0;
        }
        playTimeRef.current = Math.max(0, t);
        setPlayTime(playTimeRef.current);
      }

      drawTimeline(ctx, canvas, chart, grid, spec, playTimeRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [chart, grid, spec]);

  // "Score if perfect": treat every cue whose hit-moment has passed the playhead as a
  // perfect success (decoys score as 'avoided' — the correct no-press), via the core's
  // own point math. Purely indicative.
  const liveScore = useMemo(() => {
    const verdicts: (Verdict | null)[] = chart.cues.map((c) =>
      beatToTime(grid, c.beat) <= playTime ? (c.kind === 'decoy' ? 'avoided' : 'perfect') : null,
    );
    return pointsForVerdicts(verdicts);
  }, [chart, grid, playTime]);
  const perfectTotal = useMemo(
    () => pointsForVerdicts(chart.cues.map((c) => (c.kind === 'decoy' ? 'avoided' : 'perfect'))),
    [chart],
  );

  // Export the overridden ChartSpec (the floor's `chart` block) + seed for pasting.
  const exportSpec = useMemo(
    () => ({
      seed,
      chart: {
        bpm: spec.bpm,
        beats: spec.beats,
        colors: spec.colors,
        density: round3(spec.density),
        ...(spec.decoyChance > 0 ? { decoyChance: round3(spec.decoyChance) } : {}),
        ...(spec.doubleChance > 0 ? { doubleChance: round3(spec.doubleChance) } : {}),
        ...(spec.holdChance > 0 ? { holdChance: round3(spec.holdChance) } : {}),
      },
    }),
    [spec, seed],
  );

  const copy = (): void => {
    void navigator.clipboard?.writeText(JSON.stringify(exportSpec, null, 2));
    setCopied(true);
  };

  const totalCues = chart.cues.length;

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#070b18' }}
      />

      <div style={PANEL}>
        <div style={{ fontWeight: 700 }}>Charts · timeline</div>
        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
          deterministic generated chart — play / scrub / retune
        </div>

        <Section title="Band">
          <select
            value={bandIdx}
            onChange={(e) => setBandIdx(Number(e.target.value))}
            style={INPUT_STYLE}
          >
            {BANDS.map((b, i) => (
              <option key={b.id} value={i}>
                {b.bandOrder}. {b.name} ({b.escalationAxis})
              </option>
            ))}
          </select>
        </Section>

        <Section title="Floor">
          <select
            value={Math.min(floorIdx, floors.length - 1)}
            onChange={(e) => setFloorIdx(Number(e.target.value))}
            style={INPUT_STYLE}
          >
            {floors.map((f, i) => (
              <option key={f.id} value={i}>
                {f.index + 1}. {f.name}
              </option>
            ))}
          </select>
          <div style={{ ...MONO, fontSize: 11, opacity: 0.7, marginTop: 6, lineHeight: 1.6 }}>
            <div>
              bpm {spec.bpm} · density {round3(spec.density)} · {spec.colors.length} colors ·{' '}
              {spec.beats} beats
            </div>
            <div>
              decoy {round3(spec.decoyChance)} · double {round3(spec.doubleChance)} · hold{' '}
              {round3(spec.holdChance)}
            </div>
          </div>
        </Section>

        <Section title="Cues (generated)">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            {KINDS.map((k) => (
              <span
                key={k}
                style={{
                  ...MONO,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {k} {kindCounts[k]}
              </span>
            ))}
            <span
              style={{
                ...MONO,
                padding: '3px 8px',
                borderRadius: 6,
                background: '#3b5bdb',
              }}
            >
              total {totalCues}
            </span>
          </div>
        </Section>

        <Section title="Transport">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn onClick={() => (playing ? pause() : void play())}>{playing ? '❚❚ Pause' : '▶ Play'}</Btn>
            <Btn onClick={stop}>■ Stop</Btn>
            <span style={{ ...MONO, fontSize: 11, opacity: 0.55 }}>♪ with music</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(endTime, 0.001)}
            step={0.01}
            value={Math.min(playTime, endTime)}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ width: '100%', marginTop: 8 }}
          />
          <div style={{ ...MONO, fontSize: 11, opacity: 0.75, display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {playTime.toFixed(2)}s · beat {timeToBeatLabel(grid, playTime)}
            </span>
            <span>{endTime.toFixed(2)}s</span>
          </div>
          <div style={{ ...MONO, fontSize: 12, marginTop: 6 }}>
            score if perfect: <b style={{ color: '#ffd98a' }}>{liveScore.toLocaleString()}</b>
            <span style={{ opacity: 0.55 }}> / {perfectTotal.toLocaleString()}</span>
          </div>
        </Section>

        <Section title="Knobs — override + regenerate">
          <Slider label="BPM" value={bpm} min={60} max={220} step={1} onChange={setBpm} />
          <Slider label="Density" value={density} min={0} max={1} step={0.01} onChange={setDensity} />
          <Slider
            label="Decoy chance"
            value={decoyChance}
            min={0}
            max={1}
            step={0.01}
            onChange={setDecoyChance}
          />
          <Slider
            label="Double chance"
            value={doubleChance}
            min={0}
            max={1}
            step={0.01}
            onChange={setDoubleChance}
          />
          <Slider
            label="Hold chance"
            value={holdChance}
            min={0}
            max={1}
            step={0.01}
            onChange={setHoldChance}
          />
        </Section>

        <Section title="Seed">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ ...INPUT_STYLE, flex: 1, ...MONO }}
            />
            <Btn onClick={() => setSeed(Math.floor(Math.random() * 99999))}>↻ Reroll</Btn>
          </div>
        </Section>

        <Section title="Export — paste into the floor's `chart`">
          <Btn onClick={copy}>{copied ? '✓ Copied JSON' : 'Copy chart JSON'}</Btn>
          <pre style={{ ...MONO, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap', opacity: 0.8 }}>
            {JSON.stringify(exportSpec, null, 2)}
          </pre>
        </Section>
      </div>
    </>
  );
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** A compact "bar.beat" label for a time, for the transport readout. */
function timeToBeatLabel(grid: BeatGrid, t: number): string {
  const beat = (t - grid.offsetSec) / secPerBeat(grid);
  if (beat < 0) return '–';
  const bar = Math.floor(beat / grid.beatsPerBar) + 1;
  const inBar = Math.floor(beat % grid.beatsPerBar) + 1;
  return `${bar}.${inBar}`;
}

// Reuse the BeatGrid type for the label/draw helpers without re-importing the value.
type BeatGrid = ReturnType<typeof makeBeatGrid>;

/**
 * Draw the horizontal beat-ruler timeline. Beats run left→right; the chart scrolls
 * so the current play time sits under a fixed playhead. Each cue is coloured by its
 * CueColor and shaped by kind, matching the in-game lane read:
 *   tap = filled disc · decoy = small disc + red X · double = two-colour disc ·
 *   hold = head disc + a bar tail of holdBeats length.
 */
function drawTimeline(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  chart: Chart,
  grid: BeatGrid,
  spec: ChartSpec,
  now: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const playX = w * PLAYHEAD_FRAC;
  const trackY = h * TRACK_Y;
  const spb = secPerBeat(grid);

  // Map a chart time (seconds) to an x position (the playhead = `now`).
  const xOf = (t: number): number => playX + (t - now) * PX_PER_SEC;

  // ── Beat / bar ruler ──
  const leftTime = now - playX / PX_PER_SEC;
  const rightTime = now + (w - playX) / PX_PER_SEC;
  const firstBeat = Math.max(0, Math.floor(leftTime / spb));
  const lastBeat = Math.min(spec.beats, Math.ceil(rightTime / spb));

  ctx.textAlign = 'center';
  ctx.font = '11px ui-monospace, monospace';
  for (let beat = firstBeat; beat <= lastBeat; beat++) {
    const x = xOf(beat * spb);
    const isBar = beat % grid.beatsPerBar === 0;
    ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = isBar ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.12);
    ctx.lineTo(x, h * 0.88);
    ctx.stroke();
    if (isBar) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`bar ${beat / grid.beatsPerBar + 1}`, x, h * 0.1);
    }
  }

  // Lead-in shade (the no-cue intro beats).
  if (spec.leadInBeats > 0) {
    const x0 = xOf(0);
    const x1 = xOf(spec.leadInBeats * spb);
    ctx.fillStyle = 'rgba(120,140,200,0.07)';
    ctx.fillRect(Math.min(x0, x1), h * 0.12, Math.abs(x1 - x0), h * 0.76);
  }

  // ── Cues ──
  for (const cue of chart.cues) {
    const t = beatToTime(grid, cue.beat);
    const cx = xOf(t);
    if (cx < -80 || cx > w + 80) continue;
    const passed = t < now;
    ctx.globalAlpha = passed ? 0.35 : 1;

    if (cue.kind === 'hold') {
      const holdBeats = cue.holdBeats ?? 1;
      const ex = xOf(t + holdBeats * spb);
      const HALF = 9;
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.globalAlpha = passed ? 0.25 : 0.85;
      ctx.fillRect(cx, trackY - HALF, ex - cx, HALF * 2);
      ctx.globalAlpha = passed ? 0.35 : 1;
      // end-cap
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, trackY, 9, 0, Math.PI * 2);
      ctx.stroke();
      // head
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, trackY, 16, 0, Math.PI * 2);
      ctx.fill();
    } else if (cue.kind === 'double') {
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, trackY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CUE_HEX[cue.color2 ?? cue.color];
      ctx.beginPath();
      ctx.arc(cx, trackY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, trackY, 9, 0, Math.PI * 2);
      ctx.stroke();
    } else if (cue.kind === 'decoy') {
      ctx.globalAlpha = passed ? 0.2 : 0.55;
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, trackY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = passed ? 0.35 : 1;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 7, trackY - 7);
      ctx.lineTo(cx + 7, trackY + 7);
      ctx.moveTo(cx + 7, trackY - 7);
      ctx.lineTo(cx - 7, trackY + 7);
      ctx.stroke();
    } else {
      // tap
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(cx, trackY, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Playhead / hit line ──
  ctx.strokeStyle = '#ffd98a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playX, h * 0.06);
  ctx.lineTo(playX, h * 0.94);
  ctx.stroke();
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.moveTo(playX - 6, h * 0.06);
  ctx.lineTo(playX + 6, h * 0.06);
  ctx.lineTo(playX, h * 0.06 + 8);
  ctx.fill();
}
