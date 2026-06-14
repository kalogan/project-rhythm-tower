import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Object3D, PerspectiveCamera } from 'three';
import type { BandPack } from '../content/schemas.js';
import { resolveArtKit, lookColors } from './resolveArtKit.js';
import { buildTowerScene } from './towerScene.js';
import { BossActor, type BossActorState } from './BossActor.js';

/** Optional boss looming in the backdrop (the region's landmark awakened). */
export interface BossPresence {
  readonly object: Object3D;
  readonly getState: () => BossActorState;
}

/**
 * The 2.5D backdrop: a low-poly TOWER that scrolls downward (the player reads as
 * climbing) with parallax depth layers. Purely cosmetic — a projection of the band's
 * data-defined look. Band-agnostic: any band gets the climb feel from its own palette
 * + prop kit via the routing seam.
 */
function TowerRig({ band, floorIndex }: { band: BandPack; floorIndex: number }): JSX.Element {
  const colors = lookColors(band.look);
  const kit = resolveArtKit(band.artKitId);

  // Rebuilt only when the band/floor changes (never per frame).
  const scene = useMemo(
    () => buildTowerScene(kit, colors, 7000 + band.bandOrder * 131 + floorIndex * 7),
    [kit, colors.ground, colors.accent, band.bandOrder, floorIndex],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05); // clamp after tab refocus so nothing teleports
    for (const layer of scene.layers) {
      layer.group.position.y -= layer.speed * dt;
      if (layer.group.position.y <= -layer.period) layer.group.position.y += layer.period;
    }
    const t = state.clock.elapsedTime;
    scene.crown.position.y = scene.crownBaseY + Math.sin(t * 0.8) * 0.35;
    scene.crown.rotation.y = t * 0.25;
  });

  return (
    <>
      {scene.layers.map((l, i) => (
        <primitive key={i} object={l.group} />
      ))}
      <primitive object={scene.crown} />
      {/* A base disc grounds the columns and fades into fog. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
        <circleGeometry args={[26, 32]} />
        <meshStandardMaterial color={colors.ground} />
      </mesh>
    </>
  );
}

export function TowerRenderer({
  band,
  floorIndex,
  boss,
}: {
  band: BandPack;
  floorIndex: number;
  boss?: BossPresence | undefined;
}): JSX.Element {
  const colors = lookColors(band.look);
  return (
    <Canvas
      camera={{ position: [0, 3, 13], fov: 55 }}
      onCreated={({ camera }) => (camera as PerspectiveCamera).lookAt(0, 9, 0)}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={[colors.sky]} />
      <fog attach="fog" args={[colors.fog, 14, 58]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 18, 8]} intensity={2.2} />
      <TowerRig band={band} floorIndex={floorIndex} />
      {boss && <BossActor object={boss.object} getState={boss.getState} />}
    </Canvas>
  );
}
