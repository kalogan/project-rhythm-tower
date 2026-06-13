/**
 * Biome lint — the 5-principle environment gate adapted to tower bands.
 * Run as `pnpm lint:biome`.
 *   anchor      HARD  band declares a hero landmark
 *   not-barren  HARD  band has floors, and each floor's chart can place >=1 cue
 *   legibility  WARN  palette relative-luminance spread exceeds a threshold (no mush)
 *   distinct    WARN  each band's palette signature differs from its siblings
 * HARD failures exit 1 (block the gate); WARNs print but pass.
 */
import { BANDS } from '../content/packs.js';
import type { BandPack } from '../content/schemas.js';

const LEGIBILITY_MIN_SPREAD = 0.3;
const DISTINCT_MIN_DELTA = 0.04;

function relLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin((n >> 16) & 0xff);
  const g = toLin((n >> 8) & 0xff);
  const b = toLin(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A coarse palette signature: mean RGB normalized, for sibling-distinctness comparison. */
function signature(band: BandPack): [number, number, number] {
  const cols = [...band.look.palette, band.look.accent, band.look.skyColor];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const hex of cols) {
    const n = parseInt(hex.slice(1), 16);
    r += (n >> 16) & 0xff;
    g += (n >> 8) & 0xff;
    b += n & 0xff;
  }
  const k = cols.length * 255;
  return [r / k, g / k, b / k];
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function main(): void {
  let hardFailures = 0;
  let warnings = 0;
  const sigs = BANDS.map((b) => ({ band: b, sig: signature(b) }));

  for (const band of BANDS) {
    console.log(`\n${band.id} (${band.name})`);

    // anchor — HARD
    if (band.look.landmark.trim().length === 0) {
      console.error('  FAIL anchor: no hero landmark declared');
      hardFailures += 1;
    } else {
      console.log(`  ok   anchor: "${band.look.landmark}"`);
    }

    // not-barren — HARD
    const barren = band.floors.find((f) => f.chart.density * (f.chart.beats - 4) < 1);
    if (band.floors.length === 0 || barren) {
      console.error(`  FAIL not-barren: ${barren ? `floor ${barren.id} can place <1 cue` : 'no floors'}`);
      hardFailures += 1;
    } else {
      console.log(`  ok   not-barren: ${band.floors.length} floors with authored cues`);
    }

    // legibility — WARN
    const lums = [...band.look.palette, band.look.accent].map(relLuminance);
    const spread = Math.max(...lums) - Math.min(...lums);
    if (spread < LEGIBILITY_MIN_SPREAD) {
      console.warn(`  WARN legibility: palette luminance spread ${spread.toFixed(2)} < ${LEGIBILITY_MIN_SPREAD}`);
      warnings += 1;
    } else {
      console.log(`  ok   legibility: luminance spread ${spread.toFixed(2)}`);
    }

    // distinct — WARN (only meaningful with siblings)
    const me = sigs.find((s) => s.band.id === band.id)!;
    const nearest = sigs
      .filter((s) => s.band.id !== band.id)
      .reduce<number>((min, s) => Math.min(min, dist(me.sig, s.sig)), Infinity);
    if (nearest !== Infinity && nearest < DISTINCT_MIN_DELTA) {
      console.warn(`  WARN distinct: palette too close to a sibling (delta ${nearest.toFixed(3)})`);
      warnings += 1;
    } else if (nearest !== Infinity) {
      console.log(`  ok   distinct: nearest sibling delta ${nearest.toFixed(3)}`);
    }
  }

  console.log(`\nbiome-lint: ${BANDS.length} bands, ${hardFailures} hard failure(s), ${warnings} warning(s)`);
  process.exit(hardFailures === 0 ? 0 : 1);
}

main();
