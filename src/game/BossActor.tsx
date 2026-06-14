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

const scratch = new Color();

/** Minimal phase read the actor animates against (from the boss chart + clock). */
export interface BossPhaseLite {
  readonly kind: 'barrage' | 'weakspot';
  readonly color?: CueColor;
}

/** Everything the actor needs each frame, polled from the gameplay clock. */
export interface BossActorState {
  readonly phase?: BossPhaseLite | undefined;
  /** Cumulative weakening 0..1 (the boss trembles harder as it nears defeat). */
  readonly damage: number;
  /** Seconds since the last weak-spot hit (a flinch fades over ~0.18s). */
  readonly hitT: number;
  /** Seconds since defeated; < 0 means still alive. */
  readonly defeatT: number;
}

const TOP_Y = 12;

/**
 * Renders the boss in the tower scene: it LOOMS high + far during a barrage and SWOOPS
 * down toward the player (exposing a weak-spot glow) during a weak-spot window. It
 * FLINCHES + trembles as it takes weak-spot hits, and on defeat it recoils then PLUMMETS
 * off the tower past the player. Cosmetic only — judgment is the boss chart.
 */
export function BossActor({ object, getState }: { object: Object3D; getState: () => BossActorState }): JSX.Element {
  const groupRef = useRef<Group>(null);
  const spotRef = useRef<Mesh>(null);
  const wasDefeated = useRef(false);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const st = getState();
    const spot = spotRef.current;

    // ── DEFEAT: knocked off the tower. ──
    if (st.defeatT >= 0) {
      wasDefeated.current = true;
      if (spot) spot.visible = false;
      const k = st.defeatT;
      if (k < 0.35) {
        // a beat of recoil — flung up + tipped back
        g.position.y += (14 - g.position.y) * Math.min(1, dt * 6);
        g.rotation.x += (-0.7 - g.rotation.x) * Math.min(1, dt * 6);
      } else {
        const fall = k - 0.35;
        g.position.y -= (4 + 18 * fall) * dt; // accelerating plummet into the fog
        g.position.z += (3 - g.position.z) * Math.min(1, dt * 2); // tumbles past the player
        g.rotation.z += dt * 3.6;
        g.rotation.x += dt * 1.2;
      }
      return;
    }

    // Respawn cleanly after a defeat (new fight): snap back to the top.
    if (wasDefeated.current) {
      wasDefeated.current = false;
      g.position.set(0, TOP_Y, -6);
      g.rotation.set(0, 0, 0);
      g.scale.setScalar(0.78);
    }

    // ── ALIVE: loom / swoop + damage tremble + hit flinch. ──
    const exposed = st.phase?.kind === 'weakspot';
    const ty = exposed ? 6.5 : TOP_Y;
    const tz = exposed ? 2 : -6;
    const baseS = exposed ? 1.15 : 0.78;
    const flinch = st.hitT < 0.18 ? (0.18 - st.hitT) * 1.6 : 0;
    const tremble = st.damage * 0.09;
    const d = Math.min(1, dt * 3);

    g.position.y += (ty + Math.sin(t * 1.6) * 0.2 - g.position.y) * d;
    g.position.z += (tz - g.position.z) * d;
    g.position.x = Math.sin(t * 47) * tremble; // shakes harder as it weakens
    const s = baseS * (1 + flinch);
    g.scale.setScalar(g.scale.x + (s - g.scale.x) * Math.min(1, dt * 8));
    g.rotation.y = Math.sin(t * 0.6) * 0.18;
    g.rotation.x += ((exposed ? 0.32 : 0) + flinch * 0.5 - g.rotation.x) * d;
    g.rotation.z += (0 - g.rotation.z) * d;

    if (spot) {
      spot.visible = Boolean(exposed && st.phase?.color);
      if (exposed && st.phase?.color) {
        const mat = spot.material as MeshStandardMaterial;
        scratch.set(CUE_HEX[st.phase.color]);
        mat.color.copy(scratch);
        mat.emissive.copy(scratch);
        spot.scale.setScalar(1 + Math.sin(t * 8) * 0.2);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, TOP_Y, -6]} scale={0.78}>
      <primitive object={object} />
      <mesh ref={spotRef} position={[0, 0, 1.8]} visible={false}>
        <sphereGeometry args={[0.55, 18, 18]} />
        <meshStandardMaterial emissiveIntensity={2.4} />
      </mesh>
    </group>
  );
}
