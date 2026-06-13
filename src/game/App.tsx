import { useCallback, useRef, useState } from 'react';
import { DEFAULT_MAPPING, makeBeatGrid, type FloorScore } from '../core/index.js';
import { BANDS } from '../content/packs.js';
import { TowerRenderer } from './TowerRenderer.js';
import { FloorPlayer } from './FloorPlayer.js';
import { createAudioDriver, type AudioDriver } from './audio/audioDriver.js';

type Phase = 'menu' | 'playing' | 'result';

export function App(): JSX.Element {
  // Track WHERE in the climb we are: which band (by climb order) + which floor.
  // The tower is the ordered list of BANDS; clearing a band's last floor advances
  // to the next band's first floor (cozy: we only ever advance on `cleared`).
  const [bandIndex, setBandIndex] = useState(0);
  const [floorIndex, setFloorIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('menu');
  const [score, setScore] = useState<FloorScore | null>(null);
  const audioRef = useRef<AudioDriver | null>(null);

  const band = BANDS[bandIndex]!;
  const floor = band.floors[floorIndex]!;
  const grid = makeBeatGrid(floor.chart.bpm, floor.chart.beatsPerBar);
  const mapping = floor.mapping ?? DEFAULT_MAPPING;

  // Is there anywhere left to climb after this floor?
  const isBandLastFloor = floorIndex >= band.floors.length - 1;
  const isTowerTop = isBandLastFloor && bandIndex >= BANDS.length - 1;
  const canAdvance = Boolean(score?.cleared) && !isTowerTop;

  const startFloor = useCallback(async () => {
    if (!audioRef.current) audioRef.current = createAudioDriver();
    await audioRef.current.resume();
    setScore(null);
    setPhase('playing');
  }, []);

  const onComplete = useCallback((s: FloorScore) => {
    setScore(s);
    setPhase('result');
  }, []);

  const advance = useCallback(() => {
    // Only climb on a clear; otherwise this is a Retry (same floor).
    if (score?.cleared && !isTowerTop) {
      if (isBandLastFloor) {
        // Cleared the band's crown — ascend to the next band's first floor.
        setBandIndex((b) => b + 1);
        setFloorIndex(0);
      } else {
        setFloorIndex((i) => i + 1);
      }
    }
    void startFloor();
  }, [score, isBandLastFloor, isTowerTop, startFloor]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <TowerRenderer band={band} floorIndex={floorIndex} />

      {phase === 'playing' && audioRef.current && (
        <FloorPlayer floor={floor} grid={grid} mapping={mapping} audio={audioRef.current} onComplete={onComplete} />
      )}

      {phase === 'menu' && (
        <Overlay>
          <h1 style={{ margin: 0, fontSize: 40, color: '#ffd98a' }}>Rhythm Tower</h1>
          <p style={{ maxWidth: 440, textAlign: 'center', lineHeight: 1.5 }}>
            Climb the tower. A color flashes — decode it to its button and hit it on the beat.
            <br />
            <b>blue→X · green→A · red→B · yellow→Y</b>
            <br />
            Keys: <b>I J K L</b> (or a gamepad's face buttons).
          </p>
          <p style={{ opacity: 0.8 }}>
            {band.name} · Floor {floorIndex + 1}: {floor.name}
          </p>
          <Button onClick={startFloor}>Start</Button>
        </Overlay>
      )}

      {phase === 'result' && score && (
        <Overlay>
          <h2 style={{ margin: 0, color: score.cleared ? '#a3e635' : '#ef4444' }}>
            {score.cleared ? 'Floor Cleared!' : 'Try Again'}
          </h2>
          <p style={{ fontSize: 18 }}>
            Accuracy {(score.accuracy * 100).toFixed(0)}% · Max combo {score.maxCombo}
          </p>
          <p style={{ opacity: 0.85 }}>
            {score.perfect} perfect · {score.good} good · {score.wrong} wrong · {score.miss} miss
          </p>
          <Button onClick={advance}>
            {canAdvance ? (isBandLastFloor ? 'Next Band' : 'Next Floor') : 'Retry'}
          </Button>
        </Overlay>
      )}
    </div>
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
