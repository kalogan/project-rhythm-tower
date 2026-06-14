import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { CueColor } from '../core/index.js';

const CUE_HEX: Readonly<Record<CueColor, string>> = {
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
};

/** Minimal phase read the actor animates against (from the boss chart + clock). */
export interface BossPhaseLite {
  readonly kind: 'barrage' | 'weakspot';
  readonly color?: CueColor;
}

const scratch = new Color();

/**
 * Renders the boss inside the tower scene: it LOOMS high during a barrage and LUNGES
 * down toward the player, exposing a weak-spot glow in the phase colour, during a
 * weak-spot window. `getPhase` is polled each frame so the actor stays in sync with
 * the gameplay clock. Cosmetic only — judgment is the boss chart's decoys + strikes.
 */
export function BossActor({ object, getPhase }: { object: Object3D; getPhase: () => BossPhaseLite | undefined }): JSX.Element {
  const groupRef = useRef<Group>(null);
  const spotRef = useRef<Mesh>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const phase = getPhase();
    const exposed = phase?.kind === 'weakspot';
    const targetY = exposed ? 5.5 : phase?.kind === 'barrage' ? 10 : 8;
    const d = Math.min(1, dt * 3.2);
    const g = groupRef.current;
    if (g) {
      g.position.y += (targetY + Math.sin(t * 1.6) * 0.25 - g.position.y) * d;
      // Face the player with a menacing sway — never a full spin. Lean in when it lunges.
      g.rotation.y = Math.sin(t * 0.6) * 0.22;
      const targetLean = exposed ? 0.26 : 0;
      g.rotation.x += (targetLean - g.rotation.x) * d;
    }
    const spot = spotRef.current;
    if (spot) {
      spot.visible = Boolean(exposed && phase?.color);
      if (exposed && phase?.color) {
        const mat = spot.material as MeshStandardMaterial;
        scratch.set(CUE_HEX[phase.color]);
        mat.color.copy(scratch);
        mat.emissive.copy(scratch);
        spot.scale.setScalar(1 + Math.sin(t * 8) * 0.2);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 8, -1]} scale={1.4}>
      <primitive object={object} />
      <mesh ref={spotRef} position={[0, 0, 1.8]} visible={false}>
        <sphereGeometry args={[0.55, 18, 18]} />
        <meshStandardMaterial emissiveIntensity={2.4} />
      </mesh>
    </group>
  );
}
