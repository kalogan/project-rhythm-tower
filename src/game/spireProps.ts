import { ConeGeometry, Group, Mesh, OctahedronGeometry, TetrahedronGeometry } from 'three';
import { makePrng } from '../core/prng.js';
import { flatMat, emissiveMat } from '../art/palette.js';
import { jitterVerts } from '../art/geo.js';

/**
 * The Spire prop kit — bespoke, deterministic geometry generators for the cool
 * cobalt/violet escalation band. RESHAPED + RECOLORED, never borrowed from the
 * Atrium: where the Atrium is a box plinth + cylinder post + octa lantern, the
 * Spire is a tapered obelisk + crystal beacon and angular tetra shards.
 *
 * Contract: (seed) => Object3D, base-pivot (+Y up), faceted low-poly, emissive
 * where it should bloom. Biome-LOCAL palette tokens live here so they can't leak.
 */
const SPIRE = {
  cobaltStone: 0x3b3a9e,
  violetStone: 0x6f5cf0,
  deepNavy: 0x161a3a,
  beaconCyan: 0x8fe3ff,
} as const;

/**
 * The hero landmark you orient by: a tall tapered obelisk of faceted cobalt stone
 * crowned by a bright cyan crystal beacon that blooms. Pivoted at its base.
 */
export function spireObelisk(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  // Tapered four-sided obelisk shaft (a narrow cone with 4 radial segments reads
  // as a faceted stone needle — distinct from the Atrium's round post).
  const shaft = new Mesh(
    jitterVerts(new ConeGeometry(1.0, 5.6, 4, 1), prng, 0.07),
    flatMat(SPIRE.cobaltStone),
  );
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 2.8;
  group.add(shaft);

  // A violet collar near the tip for contrast banding.
  const collar = new Mesh(new OctahedronGeometry(0.7, 0), flatMat(SPIRE.violetStone));
  collar.position.y = 5.0;
  group.add(collar);

  // The crystal beacon: a bright cyan octahedron that blooms — the band's light.
  const beacon = new Mesh(
    new OctahedronGeometry(0.85, 0),
    emissiveMat(SPIRE.beaconCyan, SPIRE.beaconCyan, 2.6),
  );
  beacon.position.y = 6.4;
  group.add(beacon);

  return group;
}

/**
 * A field tile: an angular crystal shard cluster — a tilted tetrahedron of dark
 * navy stone with a small glowing cyan splinter. Different geometry from the
 * Atrium's box-capped cylinder pillar (angular shards, not carved pillars).
 */
export function spireShard(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  const shard = new Mesh(
    jitterVerts(new TetrahedronGeometry(0.9 + prng.range(0, 0.5), 0), prng, 0.08),
    flatMat(SPIRE.deepNavy),
  );
  shard.rotation.set(prng.range(-0.2, 0.2), prng.range(0, Math.PI), prng.range(-0.25, 0.25));
  shard.position.y = 0.7;
  group.add(shard);

  const splinter = new Mesh(
    new TetrahedronGeometry(0.32, 0),
    emissiveMat(SPIRE.beaconCyan, SPIRE.beaconCyan, 1.4),
  );
  splinter.position.set(prng.range(-0.3, 0.3), 1.2, prng.range(-0.3, 0.3));
  splinter.rotation.y = prng.range(0, Math.PI);
  group.add(splinter);

  return group;
}
