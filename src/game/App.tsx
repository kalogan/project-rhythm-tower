import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_MAPPING, generateChart, makeBeatGrid, type FloorScore } from '../core/index.js';
import { BANDS } from '../content/packs.js';
import { toChartSpec } from '../content/schemas.js';
import { TowerRenderer } from './TowerRenderer.js';
import { FloorPlayer } from './FloorPlayer.js';
import { createAudioDriver, type AudioDriver } from './audio/audioDriver.js';
import { loadLeaderboard, recordScore, type ScoreEntry } from './leaderboard.js';

type Phase = 'title' | 'transition' | 'playing' | 'result';
type Mode = 'solo' | 'double';
type RunEnd = null | 'complete' | 'over';
const MAX_LIVES = 3;
const TRANSITION_MS = 850;

export function App(): JSX.Element {
  // Run state: where we are in the climb (band/floor), the accumulated RUN total, and
  // the run-lives. A floor is cleared by SURVIVING it (HP > 0). On death you spend a
  // life; out of lives ends the run and banks the full-run total to the global top-3.
  const [bandIndex, setBandIndex] = useState(0);
  const [floorIndex, setFloorIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('title');
  const [mode, setMode] = useState<Mode>('solo');
  const [score, setScore] = useState<FloorScore | null>(null);
  const [board, setBoard] = useState<ScoreEntry[]>(() => loadLeaderboard());
  const [runPoints, setRunPoints] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [runEnd, setRunEnd] = useState<RunEnd>(null);
  const [resultTotal, setResultTotal] = useState(0);
  const audioRef = useRef<AudioDriver | null>(null);

  const band = BANDS[bandIndex]!;
  const floor = band.floors[floorIndex]!;
  const grid = makeBeatGrid(floor.chart.bpm, floor.chart.beatsPerBar);
  const mapping = floor.mapping ?? DEFAULT_MAPPING;
  const chart = useMemo(() => generateChart(toChartSpec(floor), floor.seed), [floor]);

  const isBandLastFloor = floorIndex >= band.floors.length - 1;
  const isTowerTop = isBandLastFloor && bandIndex >= BANDS.length - 1;

  // Mirror run state into refs so the (stable) onComplete callback resolves a floor with
  // no stale closures — and without changing identity (which would restart the floor).
  const runPointsRef = useRef(0);
  runPointsRef.current = runPoints;
  const livesRef = useRef(MAX_LIVES);
  livesRef.current = lives;
  const ctxRef = useRef({ isTowerTop, bandName: band.name, floorName: floor.name });
  ctxRef.current = { isTowerTop, bandName: band.name, floorName: floor.name };

  // Enter a floor via a brief "Get ready" transition splash, then play.
  const startFloor = useCallback(async () => {
    if (!audioRef.current) audioRef.current = createAudioDriver();
    await audioRef.current.resume();
    setScore(null);
    setPhase('transition');
  }, []);

  // The transition splash auto-advances into play.
  useEffect(() => {
    if (phase !== 'transition') return;
    const id = window.setTimeout(() => setPhase('playing'), TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Resolve a finished floor synchronously: accumulate the run total, spend a life on a
  // death, and bank the run total when the run ends (topped out or out of lives).
  const onComplete = useCallback((s: FloorScore) => {
    const { isTowerTop: top, bandName, floorName } = ctxRef.current;
    const total = runPointsRef.current + s.points;
    setResultTotal(total);
    if (s.cleared) {
      setRunPoints(total);
      if (top) {
        setBoard(recordScore({ points: total, floorName: `Topped out — ${bandName}`, accuracy: s.accuracy, cleared: true, at: Date.now() }));
        setRunEnd('complete');
      }
    } else {
      const remaining = livesRef.current - 1;
      setLives(remaining);
      if (remaining <= 0) {
        setBoard(recordScore({ points: total, floorName: `Reached ${bandName} · ${floorName}`, accuracy: s.accuracy, cleared: false, at: Date.now() }));
        setRunEnd('over');
      }
    }
    setScore(s);
    setPhase('result');
  }, []);

  const startRun = useCallback(() => {
    setBandIndex(0);
    setFloorIndex(0);
    setRunPoints(0);
    setLives(MAX_LIVES);
    setRunEnd(null);
    void startFloor();
  }, [startFloor]);

  const advance = useCallback(() => {
    if (runEnd) {
      startRun(); // run ended — start a fresh climb
      return;
    }
    if (score?.cleared) {
      if (isBandLastFloor) {
        setBandIndex((b) => b + 1);
        setFloorIndex(0);
      } else {
        setFloorIndex((i) => i + 1);
      }
    }
    // died with lives left -> retry the same floor (board + run total persist).
    void startFloor();
  }, [runEnd, score, isBandLastFloor, startRun, startFloor]);

  const selectSolo = useCallback(() => {
    setMode('solo');
    void startRun();
  }, [startRun]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <TowerRenderer band={band} floorIndex={floorIndex} />

      {phase === 'playing' && audioRef.current && (
        <FloorPlayer
          chart={chart}
          grid={grid}
          mapping={mapping}
          audio={audioRef.current}
          lives={lives}
          runPoints={runPoints}
          onComplete={onComplete}
        />
      )}

      {phase === 'title' && (
        <Overlay>
          <h1 style={{ margin: 0, fontSize: 46, color: '#ffd98a', letterSpacing: 1 }}>Rhythm Tower</h1>
          <p style={{ opacity: 0.85, margin: 0 }}>Decode the colour, hit the button on the beat, climb.</p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
            <ModeCard
              title="Solo"
              desc="Climb one tower. Colour → button on the beat. Survive each floor; combos heal your HP. (I J K L / gamepad)"
              onClick={selectSolo}
            />
            <ModeCard
              title="Double"
              badge="Coming soon"
              desc="Two towers, two D-pads, one brain — left + right lanes in a call-and-response duet. Shared HP."
              disabled
            />
          </div>
          {board[0] && <p style={{ opacity: 0.7, margin: 0 }}>Best run: {board[0].points.toLocaleString()} pts</p>}
        </Overlay>
      )}

      {phase === 'transition' && (
        <Overlay>
          <div style={{ textAlign: 'center', animation: 'riseIn 0.5s ease' }}>
            <div style={{ opacity: 0.7, letterSpacing: 3, fontSize: 13 }}>
              {mode === 'double' ? 'DOUBLE' : 'SOLO'} · {band.name}
            </div>
            <h2 style={{ fontSize: 38, color: '#ffd98a', margin: '10px 0 4px' }}>
              Floor {floorIndex + 1}: {floor.name}
            </h2>
            <div style={{ opacity: 0.6 }}>Get ready…</div>
          </div>
        </Overlay>
      )}

      {phase === 'result' && score && (
        <Overlay>
          <h2
            style={{
              margin: 0,
              color: runEnd === 'complete' ? '#ffd98a' : runEnd === 'over' ? '#ef4444' : score.cleared ? '#a3e635' : '#ef4444',
            }}
          >
            {runEnd === 'complete' ? 'Tower Topped! 🎉' : runEnd === 'over' ? 'Run Over' : score.cleared ? 'Floor Cleared!' : 'You Fell!'}
          </h2>
          <p style={{ fontSize: 34, fontWeight: 800, color: '#ffd98a', margin: 0 }}>
            {resultTotal.toLocaleString()} pts
          </p>
          <p style={{ fontSize: 13, opacity: 0.7, margin: 0 }}>run total{runEnd ? ' · banked' : ''}</p>
          <p style={{ fontSize: 16, margin: 0 }}>
            This floor {score.points.toLocaleString()} · {(score.accuracy * 100).toFixed(0)}% acc · combo {score.maxCombo}
          </p>
          <p style={{ margin: 0, opacity: 0.9 }}>
            {runEnd === 'over' ? 'Out of lives' : `Lives ${'♥'.repeat(Math.max(0, lives))}`}
          </p>
          {runEnd && <Leaderboard board={board} youAt={resultTotal} />}
          <Button onClick={advance}>
            {runEnd ? 'New Run' : score.cleared ? (isBandLastFloor ? 'Next Band' : 'Next Floor') : `Retry (${'♥'.repeat(Math.max(0, lives))})`}
          </Button>
        </Overlay>
      )}
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

function Leaderboard({ board, youAt }: { board: ScoreEntry[]; youAt: number }): JSX.Element {
  let highlighted = false;
  return (
    <div style={{ minWidth: 300, maxWidth: 380 }}>
      <div style={{ opacity: 0.7, fontSize: 14, textAlign: 'center', marginBottom: 6 }}>TOP SCORES</div>
      {board.length === 0 && <div style={{ opacity: 0.6, textAlign: 'center' }}>No scores yet — set one!</div>}
      {board.map((e, i) => {
        // Highlight the single row that matches this run's score (first match only).
        const isYou = !highlighted && e.points === youAt;
        if (isYou) highlighted = true;
        return (
          <div
            key={`${e.at}-${i}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '6px 12px',
              borderRadius: 8,
              background: isYou ? 'rgba(255,217,138,0.18)' : 'transparent',
              color: isYou ? '#ffd98a' : '#f4f1e8',
            }}
          >
            <span style={{ width: 24 }}>{MEDALS[i] ?? i + 1}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
              {e.floorName}
            </span>
            <span style={{ fontWeight: 700 }}>{e.points.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function ModeCard({
  title,
  desc,
  onClick,
  badge,
  disabled,
}: {
  title: string;
  desc: string;
  onClick?: () => void;
  badge?: string;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 230,
        padding: 18,
        textAlign: 'left',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.14)',
        background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(59,91,219,0.20)',
        color: '#f4f1e8',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 24, fontWeight: 800 }}>{title}</span>
        {badge && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#3b5bdb' }}>{badge}</span>
        )}
      </div>
      <p style={{ opacity: 0.82, fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>{desc}</p>
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        color: '#f4f1e8',
        background: 'rgba(11,16,32,0.55)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 28px',
        fontSize: 18,
        fontWeight: 700,
        color: '#0b1020',
        background: '#ffd98a',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
