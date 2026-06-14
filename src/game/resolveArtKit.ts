import type { Object3D } from 'three';
import type { BandLook } from '../content/schemas.js';
import { atriumLantern, atriumPillar, atriumWraith } from './atriumProps.js';
import { spireObelisk, spireShard } from './spireProps.js';
import { verdantPod, verdantPlanter } from './verdantProps.js';
import { summitBeacon, summitMonolith } from './summitProps.js';
import { belfryBell, belfryChime } from './belfryProps.js';

/**
 * THE ROUTING SEAM. A band references an `artKitId`; the renderer resolves it to a
 * bespoke prop kit ONLY for that id. Adding a band = add ONE case here + a new
 * props module — purely additive, never edits a sibling's kit.
 */
export interface ArtKit {
  /** The hero landmark generator (base-pivot Object3D). */
  landmark: (seed: number) => Object3D;
  /** A scatter-field tile generator. */
  pillar: (seed: number) => Object3D;
  /** The region's BOSS — the landmark awakened (centred for loom/lunge). Optional
   * until each band ships its boss; the preview/game fall back to the landmark. */
  boss?: (seed: number) => Object3D;
}

const ATRIUM_KIT: ArtKit = { landmark: atriumLantern, pillar: atriumPillar, boss: atriumWraith };
const SPIRE_KIT: ArtKit = { landmark: spireObelisk, pillar: spireShard };
const VERDANT_KIT: ArtKit = { landmark: verdantPod, pillar: verdantPlanter };
const SUMMIT_KIT: ArtKit = { landmark: summitBeacon, pillar: summitMonolith };
const BELFRY_KIT: ArtKit = { landmark: belfryBell, pillar: belfryChime };

export function resolveArtKit(artKitId: string): ArtKit {
  switch (artKitId) {
    case 'atrium':
      return ATRIUM_KIT;
    case 'spire':
      return SPIRE_KIT;
    case 'verdant':
      return VERDANT_KIT;
    case 'summit':
      return SUMMIT_KIT;
    case 'belfry':
      return BELFRY_KIT;
    default:
      // Unknown kit: fall back to the atrium kit so the tower always renders.
      return ATRIUM_KIT;
  }
}

/** Cosmetic-only: derive scene colors from a band's data-defined look. */
export function lookColors(look: BandLook): { sky: string; fog: string; accent: string; ground: string } {
  return {
    sky: look.skyColor,
    fog: look.fogColor,
    accent: look.accent,
    ground: look.palette[0] ?? '#222',
  };
}
