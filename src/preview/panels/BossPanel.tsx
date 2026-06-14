import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  beatToTime,
  generateBossChart,
  makeBeatGrid,
  phaseAtBeat,
  timeToBeat,
  type BossChart,
  type BossSpec,
  type CueColor,
} from '../../core/index.js';
import { createAudioDriver, type AudioDriver } from '../../game/audio/audioDriver.js';
import { Btn, MONO, PANEL, Section, Slider } from '../ui.js';

const CUE_HEX: Readonly<Record<CueColor, string>> = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
};
const COLORS: readonly CueColor[] = ['blue', 'green', 'red', 'yellow'];

const PX_PER_SEC = 120;
const PLAYHEAD = 0.28;

const SELECT = {
  width: '100%',
  padding: 6,
  background: '#10162e',
  color: '#e6ecff',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  boxSizing: 'border-box' as const,
};

export function BossPanel(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [bpm, setBpm] = useState(120);
  const [phases, setPhases] = useState(4);
  const [barrageBeats, setBarrageBeats] = useState(8);
  const [barrageDensity, setBarrageDensity] = useState(0.7);
  const [weakSpotBeats, setWeakSpotBeats] = useState(3);
  const [weakA, setWeakA] = useState<CueColor>('green');
  const [weakB, setWeakB] = useState<CueColor>('red');
  const [seed, setSeed] = useState(4242);

  const spec: BossSpec = useMemo(
    () => ({
      bpm,
      beatsPerBar: 4,
      phases,
      barrageBeats,
      barrageDensity,
      weakSpotBeats,
      weakSpotColors: [weakA, weakB],
      decoyColors: COLORS,
      leadInBeats: 4,
    }),
    [bpm, phases, barrageBeats, barrageDensity, weakSpotBeats, weakA, weakB],
  );

  const boss = useMemo(() => generateBossChart(spec, seed), [spec, seed]);
  const grid = useMemo(() => makeBeatGrid(spec.bpm, spec.beatsPerBar), [spec.bpm, spec.beatsPerBar]);
  const endTime = useMemo(() => beatToTime(grid, boss.beats), [grid, boss.beats]);

  const decoyCount = boss.cues.filter((c) => c.kind === 'decoy').length;
  const strikeCount = boss.cues.filter((c) => c.kind === 'tap').length;

  // ── Audio + playhead (driven by the audio clock, like the Charts panel). ──
  const audioRef = useRef<AudioDriver | null>(null);
  const t0Ref = useRef(0);
  const activeRef = useRef(false);
  const playTimeRef = useRef(0);
  const [playTime, setPlayTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  playingRef.current = playing;
  const endRef = useRef(endTime);
  endRef.current = endTime;

  // Silence + reset whenever the fight changes.
  useEffect(() => {
    audioRef.current?.stopAll();
    activeRef.current = false;
    setPlaying(false);
    playTimeRef.current = 0;
    setPlayTime(0);
  }, [boss]);
  useEffect(() => () => audioRef.current?.stopAll(), []);

  const play = useCallback(async () => {
    let audio = audioRef.current;
    if (!audio) {
      audio = createAudioDriver();
      audioRef.current = audio;
    }
    await audio.resume();
    audio.stopAll();
    const t0 = audio.now() - playTimeRef.current;
    audio.scheduleFloor(grid, { cues: boss.cues }, t0);
    t0Ref.current = t0;
    activeRef.current = true;
    setPlaying(true);
  }, [grid, boss]);

  const pause = useCallback(() => {
    audioRef.current?.stopAll();
    activeRef.current = false;
    setPlaying(false);
  }, []);
  const stop = useCallback(() => {
    audioRef.current?.stopAll();
    activeRef.current = false;
    setPlaying(false);
    playTimeRef.current = 0;
    setPlayTime(0);
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
      if (playingRef.current && activeRef.current && audioRef.current) {
        const audio = audioRef.current;
        let t = audio.now() - t0Ref.current;
        if (t >= endRef.current) {
          audio.stopAll();
          const nt0 = audio.now() + 0.08;
          audio.scheduleFloor(grid, { cues: boss.cues }, nt0);
          t0Ref.current = nt0;
          t = 0;
        }
        playTimeRef.current = Math.max(0, t);
        setPlayTime(playTimeRef.current);
      }
      drawBoss(ctx, canvas, boss, grid, playTimeRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [boss, grid]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#0a0710' }} />

      <div style={PANEL}>
        <div style={{ fontWeight: 700 }}>Boss · prototype</div>
        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
          dodge the barrage (decoys — don&apos;t press) → strike the weak spot. NOT yet in the game.
        </div>

        <Section title="Fight">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, ...MONO }}>
            <span style={chip}>phases {phases}</span>
            <span style={chip}>decoys {decoyCount}</span>
            <span style={chip}>strikes {strikeCount}</span>
          </div>
        </Section>

        <Section title="Transport">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn onClick={() => (playing ? pause() : void play())}>{playing ? '❚❚ Pause' : '▶ Play'}</Btn>
            <Btn onClick={stop}>■ Stop</Btn>
            <span style={{ ...MONO, fontSize: 11, opacity: 0.55 }}>♪ with music</span>
          </div>
          <div style={{ ...MONO, fontSize: 11, opacity: 0.7, marginTop: 6 }}>
            {playTime.toFixed(2)}s / {endTime.toFixed(2)}s
          </div>
        </Section>

        <Section title="Attack pattern">
          <Slider label="BPM" value={bpm} min={80} max={180} step={1} onChange={setBpm} />
          <Slider label="Phases (cycles)" value={phases} min={1} max={8} step={1} onChange={setPhases} />
          <Slider label="Barrage length (beats)" value={barrageBeats} min={2} max={16} step={1} onChange={setBarrageBeats} />
          <Slider label="Barrage density" value={barrageDensity} min={0.1} max={1} step={0.05} onChange={setBarrageDensity} />
          <Slider label="Weak-spot window (beats)" value={weakSpotBeats} min={1} max={8} step={1} onChange={setWeakSpotBeats} />
        </Section>

        <Section title="Weak-spot colours (cycled)">
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={weakA} onChange={(e) => setWeakA(e.target.value as CueColor)} style={SELECT}>
              {COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={weakB} onChange={(e) => setWeakB(e.target.value as CueColor)} style={SELECT}>
              {COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section title="Seed">
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ ...SELECT, ...MONO }} />
            <Btn onClick={() => setSeed(Math.floor(Math.random() * 99999))}>↻</Btn>
          </div>
        </Section>
      </div>
    </>
  );
}

const chip = {
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
};

function drawBoss(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, boss: BossChart, grid: ReturnType<typeof makeBeatGrid>, playTime: number): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const playheadX = w * PLAYHEAD;
  const laneY = h * 0.62;
  const toX = (t: number): number => playheadX + (t - playTime) * PX_PER_SEC;

  // Phase background bands (barrage = danger red; weak-spot = the exposed colour).
  for (const p of boss.phases) {
    const x0 = toX(beatToTime(grid, p.startBeat));
    const x1 = toX(beatToTime(grid, p.endBeat));
    if (x1 < 0 || x0 > w) continue;
    ctx.fillStyle = p.kind === 'barrage' ? 'rgba(239,68,68,0.10)' : `${CUE_HEX[p.color ?? 'green']}22`;
    ctx.fillRect(x0, laneY - 70, x1 - x0, 140);
  }

  // The lane + playhead.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, laneY);
  ctx.lineTo(w, laneY);
  ctx.stroke();
  ctx.strokeStyle = '#ffd98a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, laneY - 80);
  ctx.lineTo(playheadX, laneY + 80);
  ctx.stroke();

  // Cues.
  for (const cue of boss.cues) {
    const x = toX(beatToTime(grid, cue.beat));
    if (x < -40 || x > w + 40) continue;
    if (cue.kind === 'decoy') {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(x, laneY, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, laneY - 8);
      ctx.lineTo(x + 8, laneY + 8);
      ctx.moveTo(x + 8, laneY - 8);
      ctx.lineTo(x - 8, laneY + 8);
      ctx.stroke();
    } else {
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(x, laneY, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The boss: a dark angular head up top that LUNGES down + exposes the weak-spot
  // colour during a weak-spot phase, and rears up during a barrage.
  const beatNow = timeToBeat(grid, playTime);
  const phase = phaseAtBeat(boss, beatNow);
  const exposed = phase?.kind === 'weakspot';
  const bossY = exposed ? h * 0.34 : h * 0.2;
  const bx = w * 0.5;
  ctx.fillStyle = '#241828';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, bossY - 46);
  ctx.lineTo(bx + 60, bossY);
  ctx.lineTo(bx + 34, bossY + 52);
  ctx.lineTo(bx - 34, bossY + 52);
  ctx.lineTo(bx - 60, bossY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // eyes
  ctx.fillStyle = exposed ? '#ffd98a' : '#ef4444';
  ctx.beginPath();
  ctx.arc(bx - 20, bossY, 5, 0, Math.PI * 2);
  ctx.arc(bx + 20, bossY, 5, 0, Math.PI * 2);
  ctx.fill();
  // weak spot
  if (exposed && phase?.color) {
    ctx.fillStyle = CUE_HEX[phase.color];
    ctx.beginPath();
    ctx.arc(bx, bossY + 24, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Phase label.
  ctx.fillStyle = '#e6ecff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(exposed ? 'WEAK SPOT — strike!' : phase ? 'BARRAGE — dodge!' : '', bx, h * 0.5);
  ctx.textAlign = 'left';
}
