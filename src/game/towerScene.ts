import { BoxGeometry, Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { makePrng } from '../core/prng.js';
import { flatMat, emissiveMat } from '../art/palette.js';
import { jitterVerts } from '../art/geo.js';
import type { ArtKit } from './resolveArtKit.js';

/**
 * Builds the climbing-tower backdrop as a set of PARALLAX LAYERS that scroll
 * DOWNWARD (so the player reads as rising), plus a hero crown high above. Layers
 * loop seamlessly: each layer's content repeats every `period` units, so resetting
 * its offset by `period` is invisible. Closer layers scroll faster — combined with
 * perspective, that's the parallax. All geometry is deterministic (seeded); motion
 * is applied per-frame by the renderer (allowed in the view layer, not the core).
 */
export interface ParallaxLayer {
  readonly group: Group;
  /** World units/second the layer travels downward. */
  readonly speed: number;
  /** Vertical repeat distance for seamless looping. */
  readonly period: number;
}

export interface TowerScene {
  readonly layers: ParallaxLayer[];
  /** The hero landmark, kept high above; the renderer bobs/rotates it. */
  readonly crown: Object3D;
  readonly crownBaseY: number;
}

export interface SceneColors {
  sky: string;
  fog: string;
  accent: string;
  ground: string;
}

/**
 * A curved back WALL of faceted bricks behind the playfield (slow, far layer).
 *
 * PERF: the bricks and emissive lamps are dense, repeated scatter, so each is baked
 * into a SINGLE InstancedMesh (1 draw call per field — ENVIRONMENT_ART_PIPELINE §7).
 * All bricks share ONE jittered geometry (baked once from the seeded PRNG — same
 * faceted feel, still fully deterministic); per-brick variety is the matrix only.
 * The InstancedMeshes live in the layer's Group exactly as the old Meshes did, so
 * TowerRenderer's `group.position.y` parallax scroll + seamless loop are unchanged.
 */
function buildWall(colors: SceneColors, seed: number): ParallaxLayer {
  const prng = makePrng(seed);
  const group = new Group();
  const spacing = 3;
  const rows = 9; // covers the view with headroom; loops by `spacing`
  const radius = 12;
  const segs = 9;

  // Shared, baked geometries (one jittered brick reused across every instance).
  const brickGeo = jitterVerts(new BoxGeometry(2.0, 2.6, 1.2), prng, 0.05);
  const lampGeo = new BoxGeometry(0.4, 0.4, 0.2);
  const stone = flatMat(colors.ground);
  const lampMat = emissiveMat(colors.accent, colors.accent, 1.8);

  const brickMesh = new InstancedMesh(brickGeo, stone, segs * rows);
  // Lamps appear only on segments where s % 3 === 1 (segs 1,4,7) → 3 segs × rows.
  const lampSegs = Math.floor((segs + 1) / 3); // count of s in [0,segs) with s%3===1
  const lampMesh = new InstancedMesh(lampGeo, lampMat, lampSegs * rows);

  const m = new Matrix4();
  const pos = new Vector3();
  const quat = new Quaternion();
  const euler = new Euler();
  const one = new Vector3(1, 1, 1);

  let brickI = 0;
  let lampI = 0;
  for (let s = 0; s < segs; s++) {
    // Back hemisphere only (z < 0) so bricks never sit in front of the camera.
    const a = Math.PI * 1.12 + (s / (segs - 1)) * Math.PI * 0.76;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const rotY = -a + Math.PI / 2;
    const emissiveHere = s % 3 === 1;
    for (let r = 0; r < rows; r++) {
      pos.set(x, r * spacing, z);
      quat.setFromEuler(euler.set(0, rotY, 0));
      m.compose(pos, quat, one);
      brickMesh.setMatrixAt(brickI++, m);
      if (emissiveHere) {
        pos.set(x * 0.93, r * spacing + 0.9, z * 0.93);
        m.compose(pos, quat, one);
        lampMesh.setMatrixAt(lampI++, m);
      }
    }
  }
  brickMesh.instanceMatrix.needsUpdate = true;
  lampMesh.instanceMatrix.needsUpdate = true;
  group.add(brickMesh, lampMesh);

  return { group, speed: 1.5, period: spacing };
}

/** Two vertical columns of the band's pillar prop framing the lane (one parallax layer). */
function buildColumns(kit: ArtKit, x: number, z: number, scale: number, speed: number, seed: number): ParallaxLayer {
  const group = new Group();
  const spacing = 6;
  const rows = 6;
  const left = kit.pillar(seed);
  const right = kit.pillar(seed + 991);
  left.scale.setScalar(scale);
  right.scale.setScalar(scale);
  for (let r = 0; r < rows; r++) {
    const l = left.clone();
    l.position.set(-x, r * spacing, z);
    group.add(l);
    const ri = right.clone();
    ri.position.set(x, r * spacing, z);
    group.add(ri);
  }
  return { group, speed, period: spacing };
}

export function buildTowerScene(kit: ArtKit, colors: SceneColors, seed: number): TowerScene {
  const layers: ParallaxLayer[] = [
    buildWall(colors, seed),
    buildColumns(kit, 7.5, -2, 1.1, 2.6, seed + 17), // mid
    buildColumns(kit, 5.0, 3.5, 1.6, 3.8, seed + 53), // near (faster = stronger parallax)
  ];

  const crownBaseY = 15;
  const crown = kit.landmark(seed + 7);
  crown.position.set(0, crownBaseY, -6);
  crown.scale.setScalar(1.6);

  return { layers, crown, crownBaseY };
}
