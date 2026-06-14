import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { BANDS } from '../../content/packs.js';
import { resolveArtKit } from '../../game/resolveArtKit.js';
import { Turntable } from '../orbit.js';
import { Btn, MONO } from '../ui.js';

function PropCard({ artKitId, kind, seed, label, sky }: { artKitId: string; kind: 'landmark' | 'pillar'; seed: number; label: string; sky: string }): JSX.Element {
  const object = useMemo(() => resolveArtKit(artKitId)[kind](seed), [artKitId, kind, seed]);
  return (
    <div style={{ width: 236, textAlign: 'center' }}>
      <div style={{ width: 236, height: 236, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
        <Canvas camera={{ position: [3.2, 3, 5], fov: 42 }} dpr={[1, 1.5]} onCreated={({ camera }) => camera.lookAt(0, 1.5, 0)}>
          <color attach="background" args={[sky]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 9, 4]} intensity={2} />
          <pointLight position={[0, 3, 2]} intensity={12} distance={14} />
          <group position={[0, 0, 0]}>
            <Turntable object={object} />
          </group>
        </Canvas>
      </div>
      <div style={{ ...MONO, fontSize: 12, marginTop: 6, opacity: 0.85 }}>{label}</div>
    </div>
  );
}

export function PropsPanel(): JSX.Element {
  const [seed, setSeed] = useState(7001);

  const cards = useMemo(
    () =>
      BANDS.flatMap((b) => [
        { key: `${b.id}-l`, artKitId: b.artKitId, kind: 'landmark' as const, label: `${b.name} · landmark`, sky: b.look.skyColor },
        { key: `${b.id}-p`, artKitId: b.artKitId, kind: 'pillar' as const, label: `${b.name} · field`, sky: b.look.skyColor },
      ]),
    [],
  );

  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '70px 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 700 }}>Props · {cards.length} kit pieces on turntables</div>
        <span style={{ ...MONO, opacity: 0.6, fontSize: 12 }}>seed {seed}</span>
        <Btn onClick={() => setSeed(Math.floor(Math.random() * 99999))}>↻ Reroll</Btn>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        {cards.map((c) => (
          <PropCard key={c.key} artKitId={c.artKitId} kind={c.kind} seed={seed} label={c.label} sky={c.sky} />
        ))}
      </div>
    </div>
  );
}
