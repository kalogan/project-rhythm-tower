/**
 * Content lint — schema validity of every pack. Run as `pnpm lint:content`.
 * Exit 0 = all packs valid; exit 1 = at least one invalid (blocks the gate).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BandPackSchema } from '../content/schemas.js';

const here = dirname(fileURLToPath(import.meta.url));
const packsDir = join(here, '..', 'content', 'packs');

function main(): void {
  const files = readdirSync(packsDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('content-lint: no packs found in', packsDir);
    process.exit(1);
  }

  let failures = 0;
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(packsDir, file), 'utf8')) as unknown;
    const result = BandPackSchema.safeParse(raw);
    if (result.success) {
      console.log(`  ok   ${file}  (${result.data.floors.length} floors)`);
    } else {
      failures += 1;
      console.error(`  FAIL ${file}`);
      for (const issue of result.error.issues) {
        console.error(`        ${issue.path.join('.')}: ${issue.message}`);
      }
    }
  }

  console.log(`content-lint: ${files.length - failures}/${files.length} packs valid`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
