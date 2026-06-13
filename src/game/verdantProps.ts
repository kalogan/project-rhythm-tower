import {
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { makePrng } from '../core/prng.js';
import { flatMat, emissiveMat } from '../art/palette.js';
import { jitterVerts } from '../art/geo.js';

/**
 * The Verdant Canopy prop kit — bespoke, deterministic geometry generators for the
 * green glasshouse cue-kinds band. RESHAPED + RECOLORED, never borrowed: where the
 * Atrium is box+cylinder+octa and the Spire is cone+tetra, the Verdant is built from
 * ORGANIC rounded forms — bulbous seed-pods, sphere planters, and torus leaf-rings —
 * so it reads as living, not carved.
 *
 * Contract: (seed) => Object3D, base-pivot (+Y up), faceted low-poly, emissive where
 * it should bloom. Biome-LOCAL palette tokens live here so they can't leak.
 */
const VERDANT = {
  mossStone: 0x10241a,
  emerald: 0x1f7a4d,
  jadeGlass: 0x7be08a,
  limeLight: 0xd6ff5c,
} as const;

/**
 * The hero landmark you orient by: the Lumen Pod — a fat faceted seed-pod flower of
 * pale-jade glass on a stout emerald stalk, crowned by a glowing lime stamen that
 * blooms like a lantern of chlorophyll. Round + organic, distinct from the Atrium's
 * hard octa lantern and the Spire's angular crystal beacon. Pivoted at its base.
 */
export function verdantPod(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  // A low mossy planter mound (a squashed icosahedron reads as a soft dirt clod).
  const mound = new Mesh(jitterVerts(new IcosahedronGeometry(1.3, 0), prng, 0.1), flatMat(VERDANT.mossStone));
  mound.scale.set(1.0, 0.55, 1.0);
  mound.position.y = 0.5;
  group.add(mound);

  // A stout tapered emerald stalk (a stretched dodecahedron — chunky + organic).
  const stalk = new Mesh(jitterVerts(new DodecahedronGeometry(0.45, 0), prng, 0.05), flatMat(VERDANT.emerald));
  stalk.scale.set(0.7, 3.2, 0.7);
  stalk.position.y = 2.4;
  group.add(stalk);

  // The bulbous jade-glass pod (an elongated sphere — the seed-flower's body).
  const pod = new Mesh(
    jitterVerts(new SphereGeometry(1.05, 8, 6), prng, 0.06),
    emissiveMat(VERDANT.jadeGlass, VERDANT.jadeGlass, 1.4),
  );
  pod.scale.set(0.9, 1.25, 0.9);
  pod.position.y = 4.6;
  group.add(pod);

  // The glowing lime stamen poking from the pod's crown — the band's bright light.
  const stamen = new Mesh(
    new SphereGeometry(0.42, 6, 5),
    emissiveMat(VERDANT.limeLight, VERDANT.limeLight, 2.8),
  );
  stamen.position.y = 5.9;
  group.add(stamen);

  return group;
}

/**
 * A field tile: a tiered moss planter with a curling fern-frond ring — a rounded
 * emerald bowl topped by a lime-lit torus leaf-ring. Organic + ring-shaped, distinct
 * from the Atrium's box-capped pillar and the Spire's angular shard.
 */
export function verdantPlanter(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  // The bowl: a squashed faceted sphere of emerald moss.
  const bowl = new Mesh(
    jitterVerts(new SphereGeometry(0.7 + prng.range(0, 0.3), 7, 5), prng, 0.06),
    flatMat(VERDANT.emerald),
  );
  bowl.scale.set(1.0, 0.7, 1.0);
  bowl.position.y = 0.55;
  group.add(bowl);

  // The fern-frond ring: a glowing lime torus tilted off the bowl's rim.
  const frond = new Mesh(
    new TorusGeometry(0.5, 0.12, 5, 9),
    emissiveMat(VERDANT.limeLight, VERDANT.jadeGlass, 1.3),
  );
  frond.rotation.set(Math.PI / 2 + prng.range(-0.25, 0.25), prng.range(0, Math.PI), 0);
  frond.position.y = 1.05;
  group.add(frond);

  return group;
}
