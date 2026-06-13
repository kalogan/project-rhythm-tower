import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, OctahedronGeometry } from 'three';
import { makePrng } from '../core/prng.js';
import { flatMat, emissiveMat } from '../art/palette.js';
import { jitterVerts } from '../art/geo.js';

/**
 * The Stormcrown Summit prop kit — bespoke, deterministic geometry generators for
 * the windswept tempo band. RESHAPED + RECOLORED, never borrowed from a sibling:
 * where the Atrium is box+cylinder+octa, the Spire is cone+tetra, and the Verdant
 * is sphere+dodec+torus, the Summit is a RIVEN CRAG — a steep, hard-jittered cone
 * crag stacked into an asymmetric storm-stone spire, banded by glowing ember
 * forge-seams and crowned by a hovering violet stormlight. Tall + angular + broken,
 * not a clean needle (Spire) or a soft pod (Verdant).
 *
 * Contract: (seed) => Object3D, base-pivot (+Y up), faceted low-poly, emissive
 * where it should bloom. Biome-LOCAL palette tokens live here so they can't leak.
 */
const SUMMIT = {
  slate: 0x181520,
  stormStone: 0x3e2a4a,
  emberLight: 0xff7a30,
  stormlight: 0xb06cff,
} as const;

/**
 * The hero landmark you orient by: the Stormcrown Beacon — a riven crag of charcoal
 * storm-stone built from two offset, heavily-jittered cone segments (so the silhouette
 * reads as a cracked, leaning crag, not a smooth obelisk), girdled by a glowing ember
 * forge-seam ring, and crowned by a hovering violet stormlight octahedron that blooms
 * like caught lightning. Pivoted at its base.
 */
export function summitBeacon(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  // Lower crag: a broad, steep, hard-jittered cone of dark slate — the storm-stone
  // base. Low radial count + heavy jitter = a faceted, broken crag face.
  const lower = new Mesh(
    jitterVerts(new ConeGeometry(1.7, 3.6, 5, 1), prng, 0.22),
    flatMat(SUMMIT.slate),
  );
  lower.rotation.y = prng.range(0, Math.PI);
  lower.position.y = 1.8;
  group.add(lower);

  // The ember forge-seam: a thin glowing cylinder band wedged where the crag cracks,
  // tilted off-axis so it reads as a molten seam, not a clean collar.
  const seam = new Mesh(
    new CylinderGeometry(1.15, 1.3, 0.45, 5, 1),
    emissiveMat(SUMMIT.emberLight, SUMMIT.emberLight, 2.2),
  );
  seam.rotation.z = prng.range(-0.18, 0.18);
  seam.position.y = 3.2;
  group.add(seam);

  // Upper crag: a narrower, leaning cone offset off the seam — the broken upper crag
  // that makes the spire asymmetric (a leaning storm-crag, never a symmetric needle).
  const upper = new Mesh(
    jitterVerts(new ConeGeometry(1.0, 3.0, 5, 1), prng, 0.18),
    flatMat(SUMMIT.stormStone),
  );
  upper.rotation.set(prng.range(-0.12, 0.12), prng.range(0, Math.PI), prng.range(0.05, 0.22));
  upper.position.set(prng.range(-0.25, 0.25), 5.0, prng.range(-0.25, 0.25));
  group.add(upper);

  // The hovering violet stormlight: an octahedron that floats just above the crown
  // and blooms — the band's light is the STORM, riding above the stone.
  const stormlight = new Mesh(
    new OctahedronGeometry(0.7, 0),
    emissiveMat(SUMMIT.stormlight, SUMMIT.stormlight, 2.8),
  );
  stormlight.position.y = 7.0;
  group.add(stormlight);

  return group;
}

/**
 * A field tile: a leaning storm-stone slab cracked by a glowing ember vent — a tall
 * tilted box monolith of dark slate split by a thin emissive ember strip. Slab-and-vent,
 * distinct from the Atrium's capped pillar, the Spire's angular shard, and the Verdant's
 * rounded planter.
 */
export function summitMonolith(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  const slab = new Mesh(
    jitterVerts(new BoxGeometry(0.7, 1.8 + prng.range(0, 0.9), 0.5), prng, 0.07),
    flatMat(SUMMIT.slate),
  );
  // Lean it into the gale.
  slab.rotation.set(prng.range(-0.12, 0.12), prng.range(0, Math.PI), prng.range(-0.22, 0.22));
  slab.position.y = 1.0;
  group.add(slab);

  // The ember vent: a thin glowing strip up the slab's face, a cooling-lava crack.
  const vent = new Mesh(
    new BoxGeometry(0.12, 1.2, 0.08),
    emissiveMat(SUMMIT.emberLight, SUMMIT.emberLight, 1.6),
  );
  vent.rotation.copy(slab.rotation);
  vent.position.set(0, 1.0, 0.28);
  group.add(vent);

  return group;
}
