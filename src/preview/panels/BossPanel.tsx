import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
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
import { BANDS } from '../../content/packs.js';
import { resolveArtKit, lookColors } from '../../game/resolveArtKit.js';
import { createAudioDriver, type AudioDriver } from '../../game/audio/audioDriver.js';
import { Orbit } from '../orbit.js';
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

type TimeRef = { readonly current: number };

/** The 3D boss: looms high during a barrage, lunges down + exposes its weak-spot glow
 *  during a weak-spot window. Reads the shared playhead ref each frame. */
function BossRig({ playTimeRef, boss, grid }: { playTimeRef: TimeRef; boss: BossChart; grid: ReturnType<typeof makeBeatGrid> }): JSX.Element {
  const kit = resolveArtKit('atrium');
  const creature = useMemo(() => (kit.boss ?? kit.landmark)(7001), [kit]);
  const groupRef = useRef<Group>(null);
  const spotRef = useRef<Mesh>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const phase = phaseAtBeat(boss, timeToBeat(grid, playTimeRef.current));
    const exposed = phase?.kind === 'weakspot';
    const targetY = exposed ? 1.1 : phase?.kind === 'barrage' ? 4.4 : 3;
    const g = groupRef.current;
    if (g) {
      g.position.y += (targetY + Math.sin(t * 1.6) * 0.2 - g.position.y) * Math.min(1, dt * 4);
      g.rotation.y += dt * (exposed ? 0.12 : 0.45);
    }
    const spot = spotRef.current;
    if (spot) {
      spot.visible = Boolean(exposed && phase?.color);
      if (exposed && phase?.color) {
        const mat = spot.material as MeshStandardMaterial;
        const c = new Color(CUE_HEX[phase.color]);
        mat.color.copy(c);
        mat.emissive.copy(c);
        spot.scale.setScalar(1 + Math.sin(t * 8) * 0.18);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 3, 0]}>
      <primitive object={creature} />
      <mesh ref={spotRef} position={[0, 0, 1.7]} visible={false}>
        <sphereGeometry args={[0.5, 18, 18]} />
        <meshStandardMaterial emissiveIntensity={2.4} />
      </mesh>
    </group>
  );
}

export function BossPanel(): JSX.Element {
  const timelineRef = useRef<HTMLCanvasElement>(null);

  const [bpm, setBpm] = useState(120);
  const [phases, setPhases] = useState(4);
  const [barrageBeats, setBarrageBeats] = useState(8);
  const [barrageDensity, setBarrageDensity] = useState(0.7);
  const [weakSpotBeats, setWeakSpotBeats] = useState(3);
  const [weakA, setWeakA] = useState<CueColor>('green');
  const [weakB, setWeakB] = useState<CueColor>('red');
  const [seed, setSeed] = useState(4242);

  const spec: BossSpec = useMemo(
    () => ({ bpm, beatsPerBar: 4, phases, barrageBeats, barrageDensity, weakSpotBeats, weakSpotColors: [weakA, weakB], decoyColors: COLORS, leadInBeats: 4 }),
    [bpm, phases, barrageBeats, barrageDensity, weakSpotBeats, weakA, weakB],
  );
  const boss = useMemo(() => generateBossChart(spec, seed), [spec, seed]);
  const grid = useMemo(() => makeBeatGrid(spec.bpm, spec.beatsPerBar), [spec.bpm, spec.beatsPerBar]);
  const endTime = useMemo(() => beatToTime(grid, boss.beats), [grid, boss.beats]);
  const sky = lookColors(BANDS[0]!.look).sky;

  const decoyCount = boss.cues.filter((c) => c.kind === 'decoy').length;
  const strikeCount = boss.cues.filter((c) => c.kind === 'tap').length;

  // Audio + audio-clock-driven playhead (shared with the 3D rig via playTimeRef).
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
    const canvas = timelineRef.current;
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
      drawTimeline(ctx, canvas, boss, grid, playTimeRef.current);
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
      {/* 3D boss view (top) */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '62%' }}>
        <Canvas camera={{ position: [0, 3.4, 12], fov: 50 }} dpr={[1, 1.5]} onCreated={({ camera }) => camera.lookAt(0, 3, 0)}>
          <color attach="background" args={[sky]} />
          <fog attach="fog" args={[sky, 18, 60]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[6, 14, 6]} intensity={2} />
          <BossRig playTimeRef={playTimeRef} boss={boss} grid={grid} />
          <Orbit target={[0, 3, 0]} />
        </Canvas>
      </div>

      {/* Phase timeline (bottom) */}
      <canvas
        ref={timelineRef}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', width: '100%', background: '#0a0710' }}
      />

      <div style={PANEL}>
        <div style={{ fontWeight: 700 }}>Boss · Atrium reference</div>
        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>
          the Lantern awakened — dodge the barrage, strike the weak spot. NOT yet in the game.
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
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={weakB} onChange={(e) => setWeakB(e.target.value as CueColor)} style={SELECT}>
              {COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
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

function drawTimeline(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, boss: BossChart, grid: ReturnType<typeof makeBeatGrid>, playTime: number): void {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const playheadX = w * PLAYHEAD;
  const laneY = h * 0.5;
  const toX = (t: number): number => playheadX + (t - playTime) * PX_PER_SEC;

  // Phase bands: barrage = danger red; weak-spot = the exposed colour.
  for (const p of boss.phases) {
    const x0 = toX(beatToTime(grid, p.startBeat));
    const x1 = toX(beatToTime(grid, p.endBeat));
    if (x1 < 0 || x0 > w) continue;
    ctx.fillStyle = p.kind === 'barrage' ? 'rgba(239,68,68,0.12)' : `${CUE_HEX[p.color ?? 'green']}26`;
    ctx.fillRect(x0, 0, x1 - x0, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    if (x0 > -40) ctx.fillText(p.kind === 'barrage' ? 'DODGE' : 'STRIKE', x0 + 4, 14);
  }

  // Cues.
  for (const cue of boss.cues) {
    const x = toX(beatToTime(grid, cue.beat));
    if (x < -40 || x > w + 40) continue;
    if (cue.kind === 'decoy') {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(x, laneY, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 7, laneY - 7);
      ctx.lineTo(x + 7, laneY + 7);
      ctx.moveTo(x + 7, laneY - 7);
      ctx.lineTo(x - 7, laneY + 7);
      ctx.stroke();
    } else {
      ctx.fillStyle = CUE_HEX[cue.color];
      ctx.beginPath();
      ctx.arc(x, laneY, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Playhead.
  ctx.strokeStyle = '#ffd98a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, h);
  ctx.stroke();
}
