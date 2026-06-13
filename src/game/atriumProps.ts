import { BoxGeometry, CylinderGeometry, Group, Mesh, OctahedronGeometry } from 'three';
import { makePrng } from '../core/prng.js';
import { flatMat, emissiveMat } from '../art/palette.js';
import { jitterVerts } from '../art/geo.js';

/**
 * The Atrium prop kit — bespoke, deterministic geometry generators.
 * Contract: (seed) => Object3D, base-pivot, faceted low-poly, emissive where it
 * should bloom. Biome-LOCAL palette tokens live here so they can't leak.
 */
const ATRIUM = {
  stone: 0x6b5236,
  warmStone: 0xc98a3a,
  lanternGold: 0xffd98a,
  teal: 0x4ff0d8,
} as const;

/** The hero landmark you orient by: a glowing paper lantern atop a stone plinth. */
export function atriumLantern(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  const plinth = new Mesh(jitterVerts(new BoxGeometry(2.2, 1.2, 2.2), prng, 0.06), flatMat(ATRIUM.stone));
  plinth.position.y = 0.6;
  group.add(plinth);

  const post = new Mesh(new CylinderGeometry(0.12, 0.16, 3.4, 6), flatMat(ATRIUM.warmStone));
  post.position.y = 1.2 + 1.7;
  group.add(post);

  const lantern = new Mesh(
    new OctahedronGeometry(0.9, 0),
    emissiveMat(ATRIUM.lanternGold, ATRIUM.lanternGold, 2.2),
  );
  lantern.position.y = 1.2 + 3.4;
  group.add(lantern);

  return group;
}

/** A simple field tile: a short carved pillar with a teal accent cap. */
export function atriumPillar(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  const shaft = new Mesh(
    jitterVerts(new CylinderGeometry(0.35, 0.42, 1.6 + prng.range(0, 0.8), 6), prng, 0.05),
    flatMat(ATRIUM.warmStone),
  );
  shaft.position.y = 0.8;
  group.add(shaft);

  const cap = new Mesh(new BoxGeometry(0.9, 0.2, 0.9), emissiveMat(ATRIUM.teal, ATRIUM.teal, 1.2));
  cap.position.y = 1.7;
  group.add(cap);

  return group;
}
