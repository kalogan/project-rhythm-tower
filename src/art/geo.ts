import type { BufferGeometry } from 'three';
import type { Prng } from '../core/prng.js';

/**
 * Shared geometry helpers (global). Deterministic: jitter is driven by an injected
 * seeded PRNG so the same seed yields the same mesh. Art may import the core's PRNG
 * (the reverse — core importing art — is forbidden by the arch-guard).
 */
export function jitterVerts(geo: BufferGeometry, prng: Prng, amount: number): BufferGeometry {
  const pos = geo.attributes.position;
  if (!pos) return geo;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + prng.range(-amount, amount),
      pos.getY(i) + prng.range(-amount, amount),
      pos.getZ(i) + prng.range(-amount, amount),
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
