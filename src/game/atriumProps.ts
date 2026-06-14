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

/**
 * The Atrium BOSS: the Atrium Lantern AWAKENED — a floating lantern-wraith built from
 * the same shapes + palette as the kit (a giant emissive lantern core, torn-loose stone
 * shards orbiting, warm-timber horns, glowing teal eyes). Centred at the origin so the
 * renderer can loom/lunge it on the Y axis; the weak-spot glow is added by the renderer.
 */
export function atriumWraith(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  // Core: the lantern body, enlarged + brightly emissive (the bloom anchor).
  const core = new Mesh(
    jitterVerts(new OctahedronGeometry(1.5, 0), prng, 0.07),
    emissiveMat(ATRIUM.lanternGold, ATRIUM.lanternGold, 1.9),
  );
  group.add(core);

  // Torn-loose plinth shards orbiting the core (the landmark ripped from its base).
  const shardMat = flatMat(ATRIUM.stone);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 2.2 + prng.range(-0.2, 0.4);
    const shard = new Mesh(
      jitterVerts(new BoxGeometry(0.55, 0.9 + prng.range(0, 0.7), 0.45), prng, 0.07),
      shardMat,
    );
    shard.position.set(Math.cos(a) * r, Math.sin(a) * 0.9, Math.sin(a) * r * 0.4);
    shard.rotation.set(prng.range(0, 1.4), a, prng.range(0, 1.4));
    group.add(shard);
  }

  // Warm-timber horns sweeping back off the crown.
  const hornMat = flatMat(ATRIUM.warmStone);
  for (const sx of [-1, 1]) {
    const horn = new Mesh(new CylinderGeometry(0.05, 0.22, 1.5, 5), hornMat);
    horn.position.set(sx * 0.7, 1.35, -0.1);
    horn.rotation.z = sx * 0.5;
    group.add(horn);
  }

  // Glowing teal eyes (the cold accent against the warm body).
  const eyeMat = emissiveMat(ATRIUM.teal, ATRIUM.teal, 2.6);
  for (const sx of [-1, 1]) {
    const eye = new Mesh(new OctahedronGeometry(0.18, 0), eyeMat);
    eye.position.set(sx * 0.42, 0.35, 1.25);
    group.add(eye);
  }

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
