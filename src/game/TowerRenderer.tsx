import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import type { BandPack } from '../content/schemas.js';
import { resolveArtKit, lookColors } from './resolveArtKit.js';

/**
 * The 2.5D backdrop: a low-poly tower band rendered behind the DOM cue layer.
 * Purely cosmetic — a projection of the band's data-defined look. The hero
 * landmark (anchor principle) and scatter pillars come from the routing seam.
 */
export function TowerRenderer({ band, floorIndex }: { band: BandPack; floorIndex: number }): JSX.Element {
  const colors = lookColors(band.look);
  const kit = resolveArtKit(band.artKitId);

  const landmark = useMemo(() => kit.landmark(7001 + band.bandOrder), [kit, band.bandOrder]);
  const pillars = useMemo(() => Array.from({ length: 7 }, (_, i) => kit.pillar(8100 + i)), [kit]);

  return (
    <Canvas
      camera={{ position: [0, 3 + floorIndex * 0.15, 12], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[colors.sky]} />
      <fog attach="fog" args={[colors.fog, 16, 64]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[8, 14, 6]} intensity={2.4} />
      <primitive object={landmark} position={[0, 0, -7]} />
      {pillars.map((p, i) => (
        <primitive key={i} object={p} position={[Math.cos(i * 1.7) * 6, 0, -9 - i * 1.4]} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={colors.ground} />
      </mesh>
    </Canvas>
  );
}
