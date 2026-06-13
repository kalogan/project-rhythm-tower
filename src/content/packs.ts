import { BandPackSchema, type BandPack } from './schemas.js';
import atriumRaw from './packs/pack.atrium.json' with { type: 'json' };
import spireRaw from './packs/pack.spire.json' with { type: 'json' };
import verdantRaw from './packs/pack.verdant.json' with { type: 'json' };

/**
 * The registry of all tower bands, ordered by climb. Adding a band = add its JSON
 * here (additive seam — never edit a sibling). Packs are validated at load so a
 * malformed pack fails loudly at startup, not mid-climb.
 */
const RAW_PACKS: unknown[] = [atriumRaw, spireRaw, verdantRaw];

export const BANDS: readonly BandPack[] = RAW_PACKS.map((raw) => BandPackSchema.parse(raw)).sort(
  (a, b) => a.bandOrder - b.bandOrder,
);

export function bandByOrder(order: number): BandPack | undefined {
  return BANDS.find((b) => b.bandOrder === order);
}
