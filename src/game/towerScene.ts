import { BoxGeometry, Group, Mesh, type Object3D } from 'three';
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

/** A curved back WALL of faceted bricks behind the playfield (slow, far layer). */
function buildWall(colors: SceneColors, seed: number): ParallaxLayer {
  const prng = makePrng(seed);
  const group = new Group();
  const spacing = 3;
  const rows = 9; // covers the view with headroom; loops by `spacing`
  const radius = 12;
  const segs = 9;
  const stone = flatMat(colors.ground);
  for (let s = 0; s < segs; s++) {
    // Back hemisphere only (z < 0) so bricks never sit in front of the camera.
    const a = Math.PI * 1.12 + (s / (segs - 1)) * Math.PI * 0.76;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const emissiveHere = s % 3 === 1;
    for (let r = 0; r < rows; r++) {
      const brick = new Mesh(jitterVerts(new BoxGeometry(2.0, 2.6, 1.2), prng, 0.05), stone);
      brick.position.set(x, r * spacing, z);
      brick.rotation.y = -a + Math.PI / 2;
      group.add(brick);
      if (emissiveHere) {
        const lamp = new Mesh(new BoxGeometry(0.4, 0.4, 0.2), emissiveMat(colors.accent, colors.accent, 1.8));
        lamp.position.set(x * 0.93, r * spacing + 0.9, z * 0.93);
        lamp.rotation.y = brick.rotation.y;
        group.add(lamp);
      }
    }
  }
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
