import { Color, MeshStandardMaterial } from 'three';

/**
 * Shared low-level material helpers (global). Biome-LOCAL color tokens live in each
 * band's prop kit, never here — so a band's palette can't leak into a sibling.
 * House style: faceted low-poly + emissive-for-bloom.
 */
export function flatMat(color: number | string): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });
}

export function emissiveMat(
  color: number | string,
  emissive: number | string,
  intensity = 1,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: new Color(color),
    emissive: new Color(emissive),
    emissiveIntensity: intensity,
    flatShading: true,
    roughness: 0.6,
    metalness: 0,
  });
}
