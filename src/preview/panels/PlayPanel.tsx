import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_MAPPING,
  generateBossChart,
  generateChart,
  makeBeatGrid,
  phaseAtBeat,
  timeToBeat,
  type BossChart,
  type BossSpec,
  type Chart,
  type FloorScore,
  type Verdict,
} from '../../core/index.js';
import { BANDS } from '../../content/packs.js';
import { toChartSpec } from '../../content/schemas.js';
import { resolveArtKit } from '../../game/resolveArtKit.js';
import { TowerRenderer, type BossPresence } from '../../game/TowerRenderer.js';
import { FloorPlayer } from '../../game/FloorPlayer.js';
import { createAudioDriver, type AudioDriver } from '../../game/audio/audioDriver.js';
import { Btn, MONO } from '../ui.js';

const COLORS = ['blue', 'green', 'red', 'yellow'] as const;

interface Stop {
  readonly bandIdx: number;
  readonly floorIdx: number;
  readonly boss: boolean;
  readonly label: string;
}

/** Every floor in the tower plus a Boss stop per band — the skip list. */
const STOPS: Stop[] = BANDS.flatMap((b, bi) => [
  ...b.floors.map((f, fi) => ({ bandIdx: bi, floorIdx: fi, boss: false, label: `${b.name} · ${f.name}` })),
  { bandIdx: bi, floorIdx: b.floors.length - 1, boss: true, label: `${b.name} · ★ BOSS` },
]);

/** A short defeat line per region (prototype — moves to pack data when wired to the game). */
const BOSS_LINES: Readonly<Record<string, string>> = {
  'pack:atrium': "The Lantern's light goes out.",
  'pack:spire': 'The Beacon dims and topples.',
  'pack:verdant': 'The Lumen Pod wilts and falls away.',
  'pack:summit': 'The Stormcrown is cast from the peak.',
  'pack:belfry': 'The Great Bell tolls once, and drops.',
};

function bossSpec(bpm: number): BossSpec {
  return {
    bpm,
    beatsPerBar: 4,
    phases: 4,
    barrageBeats: 8,
    barrageDensity: 0.7,
    weakSpotBeats: 3,
    weakSpotColors: ['green', 'red'],
    decoyColors: COLORS,
    leadInBeats: 4,
  };
}

/**
 * A play SANDBOX inside the preview: pick (or skip to) any floor — or a band's boss —
 * and play it with the real engine (HP, fighter, juice, music). Lets the director jump
 * straight to the boss without climbing.
 */
export function PlayPanel(): JSX.Element {
  const [stopIdx, setStopIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [score, setScore] = useState<FloorScore | null>(null);
  const audioRef = useRef<AudioDriver | null>(null);

  const stop = STOPS[Math.min(stopIdx, STOPS.length - 1)]!;
  const band = BANDS[stop.bandIdx]!;
  const floor = band.floors[stop.floorIdx]!;

  const { chart, grid, mapping, bossFull } = useMemo<{
    chart: Chart;
    grid: ReturnType<typeof makeBeatGrid>;
    mapping: typeof DEFAULT_MAPPING;
    bossFull: BossChart | null;
  }>(() => {
    if (stop.boss) {
      const spec = bossSpec(floor.chart.bpm);
      const bc = generateBossChart(spec, 4242 + stop.bandIdx);
      return { chart: { cues: bc.cues }, grid: makeBeatGrid(spec.bpm, spec.beatsPerBar), mapping: DEFAULT_MAPPING, bossFull: bc };
    }
    return {
      chart: generateChart(toChartSpec(floor), floor.seed),
      grid: makeBeatGrid(floor.chart.bpm, floor.chart.beatsPerBar),
      mapping: floor.mapping ?? DEFAULT_MAPPING,
      bossFull: null,
    };
  }, [stop, floor]);

  // The 3D boss creature (the region's landmark awakened) + a state read synced to the
  // gameplay clock: phase (loom/swoop), cumulative damage (trembles), the last-hit time
  // (flinch), and the defeat time (plummet off the tower).
  const bossObject = useMemo(
    () => (stop.boss ? (resolveArtKit(band.artKitId).boss ?? resolveArtKit(band.artKitId).landmark)(7001) : null),
    [stop.boss, band.artKitId],
  );
  const bossT0Ref = useRef(0);
  const strikesRef = useRef(0);
  const hitTimeRef = useRef(-100);
  const defeatTimeRef = useRef(-1);
  const LEAD_SEC = 2.0; // matches FloorPlayer's lead-in so the actor and cues align
  const totalStrikes = bossFull ? bossFull.cues.filter((c) => c.kind === 'tap').length : 0;

  // The current stop in a ref so the (stable) onComplete callback can read it.
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const bossPresence: BossPresence | undefined =
    stop.boss && bossObject
      ? {
          object: bossObject,
          getState: () => {
            const now = audioRef.current?.now() ?? 0;
            const ph = bossFull ? phaseAtBeat(bossFull, timeToBeat(grid, now - bossT0Ref.current)) : undefined;
            const phase = ph ? (ph.color !== undefined ? { kind: ph.kind, color: ph.color } : { kind: ph.kind }) : undefined;
            return {
              phase,
              damage: totalStrikes > 0 ? Math.min(1, strikesRef.current / totalStrikes) : 0,
              hitT: now - hitTimeRef.current,
              defeatT: defeatTimeRef.current < 0 ? -1 : now - defeatTimeRef.current,
            };
          },
        }
      : undefined;

  useEffect(() => () => audioRef.current?.stopAll(), []);

  const resetBoss = (): void => {
    strikesRef.current = 0;
    hitTimeRef.current = -100;
    defeatTimeRef.current = -1;
  };

  const start = useCallback(async () => {
    if (!audioRef.current) audioRef.current = createAudioDriver();
    await audioRef.current.resume();
    bossT0Ref.current = audioRef.current.now() + LEAD_SEC;
    resetBoss();
    setScore(null);
    setRunKey((k) => k + 1);
    setPlaying(true);
  }, []);

  const select = useCallback((idx: number) => {
    audioRef.current?.stopAll();
    resetBoss();
    setStopIdx(Math.max(0, Math.min(STOPS.length - 1, idx)));
    setScore(null);
    setPlaying(false);
  }, []);

  const onHit = useCallback((verdict: Verdict) => {
    if (verdict === 'perfect' || verdict === 'good') {
      strikesRef.current += 1;
      hitTimeRef.current = audioRef.current?.now() ?? 0;
    }
  }, []);

  const onComplete = useCallback((s: FloorScore) => {
    setScore(s);
    setPlaying(false);
    // A cleared boss is DEFEATED — start its plummet off the tower.
    if (s.cleared && stopRef.current.boss) defeatTimeRef.current = audioRef.current?.now() ?? 0;
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <TowerRenderer band={band} floorIndex={stop.floorIdx} boss={bossPresence} />

      {playing && audioRef.current && (
        <FloorPlayer
          key={runKey}
          chart={chart}
          grid={grid}
          mapping={mapping}
          audio={audioRef.current}
          music={band.music}
          lives={3}
          runPoints={0}
          onComplete={onComplete}
          onHit={onHit}
        />
      )}

      {/* Skip / select bar (below the tab bar). */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 12,
          zIndex: 30,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          background: 'rgba(10,14,28,0.9)',
          padding: 8,
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <Btn onClick={() => select(stopIdx - 1)}>◀</Btn>
        <select
          value={stopIdx}
          onChange={(e) => select(Number(e.target.value))}
          style={{
            padding: 6,
            background: '#10162e',
            color: '#e6ecff',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            maxWidth: 260,
          }}
        >
          {STOPS.map((s, i) => (
            <option key={`${s.label}-${i}`} value={i}>
              {s.label}
            </option>
          ))}
        </select>
        <Btn onClick={() => select(stopIdx + 1)}>▶</Btn>
        <Btn onClick={() => void start()}>{playing ? '↻ Restart' : '▶ Play'}</Btn>
      </div>

      {!playing && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: '#e6ecff' }}>
            {score ? (
              <>
                <div style={{ fontSize: 30, fontWeight: 800, color: score.cleared ? '#a3e635' : '#ef4444' }}>
                  {stop.boss && score.cleared ? 'DEFEATED' : score.cleared ? 'Cleared' : 'Down'}
                </div>
                {stop.boss && score.cleared && (
                  <div style={{ fontStyle: 'italic', opacity: 0.85, marginTop: 6 }}>{BOSS_LINES[band.id] ?? ''}</div>
                )}
                <div style={{ ...MONO, opacity: 0.85, marginTop: 6 }}>
                  {score.points.toLocaleString()} pts · {(score.accuracy * 100).toFixed(0)}% · HP {Math.round(score.hp)}
                </div>
                <div style={{ opacity: 0.6, marginTop: 8, fontSize: 13 }}>press Play to retry, ◀ ▶ to skip</div>
              </>
            ) : (
              <div style={{ opacity: 0.8 }}>
                {stop.label}
                <div style={{ opacity: 0.6, marginTop: 6, fontSize: 13 }}>press Play (I J K L to hit)</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
