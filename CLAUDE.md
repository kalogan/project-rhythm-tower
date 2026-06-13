# CLAUDE.md — `Project Rhythm Tower` (the agent entrypoint)

A cozy 2.5D rhythm tower-climber: decode flashed colors into buttons on the beat to
climb. **Before doing any work, read [`docs/00_PROJECT_BRIEF.md`](docs/00_PROJECT_BRIEF.md)**
(the locked design + constraints) and [`docs/ARCHITECT_BUILDER_PIPELINE.md`](docs/ARCHITECT_BUILDER_PIPELINE.md)
(how to orchestrate). Build **one slice at a time**; phase large features into sequenced,
individually-green slices.

## Current state (read before assuming what exists)
Greenfield scaffold. **Built & tested:** the toolchain (TS strict · Vite · Vitest ·
ESLint · dependency-cruiser · CI) and the **deterministic core** (`src/core`: PRNG, clock,
beat grid, color→button cues + mapping, deterministic chart generator, judgment, scoring,
pure floor-session reducer). **Scaffolded (first vertical slice):** Zod content schemas +
the `atrium` band pack + golden fixture, the content/biome lint CLIs, and a thin r3f
backdrop + DOM cue/HUD app shell. **Not built yet — don't assume:** real procedural audio
synthesis, full hold/double cue handling, more bands, atmosphere/bloom. **Don't rebuild the
core.** See brief §4 for the live source of truth.

**Shared-file footgun:** the files multiple builders tend to touch — the routing seam
(`src/game/resolveArtKit.ts` once it exists), the content registries (`src/content/registries/*`),
and `src/content/schemas.ts` — must never have two builders editing them at once; they
share one working tree. Serialize those; parallelize only fully disjoint file sets.

## The non-negotiable constraints (NON-NEGOTIABLE — mirror brief §7)
1. **Core purity:** `src/core` imports no React/three/DOM/audio/IO and no `game|art|lint`
   (dependency-cruiser enforced).
2. **Source of truth:** the deterministic core is authoritative; audio + render are
   cosmetic projections. Judgment lives in the core only.
3. **Determinism:** core injects clock + seeded PRNG; never `Math.random`/`Date.now`/
   `performance.now` in `src/core`.
4. **Hot-path discipline:** no per-frame allocation in render/tick/audio loops; mutate in
   place; idle `tick()` returns the same reference.
5. **Version everything + golden fixtures:** every content/persisted shape carries
   `schemaVersion`, migrates forward, ships a golden fixture on change.
6. **Additive content seam:** adding a band touches only its own pack + kit + one routing
   case; never edits a sibling.
7. **Testing contract:** every new system ships tests; content + biome lints + arch-guard
   stay green.

## Tech spine
TS (strict) · Vite · React 18 + react-three-fiber · three.js · Web Audio · Zod · Vitest ·
ESLint + dependency-cruiser · pnpm. Layout: `src/core` (pure logic) → `src/content`
(schemas + JSON packs) → `src/game` (r3f backdrop + DOM cue/HUD + input + audio) ·
`src/art` (shared three.js helpers) · `src/lint` (gate CLIs). See brief §6.

## The gate (what "done" means)
```
pnpm typecheck        # tsc --noEmit, exit 0
pnpm lint && pnpm arch # eslint + dependency-cruiser arch-guard, exit 0
pnpm lint:content      # Zod validity of every pack/registry, exit 0
pnpm lint:biome        # 5-principle environment lint, exit 0
pnpm test              # vitest run, exit 0 (record COUNTS)
pnpm build             # tsc --noEmit && vite build = the DEPLOY build, exit 0
pnpm gate              # runs the whole chain
```
Re-run with REAL exit codes; never trust a builder's "green". Record test counts (a silent
drop = deleted tests).

## Environment notes
Node 22 · pnpm 10. `pnpm install` (esbuild is whitelisted under `pnpm.onlyBuiltDependencies`).
`pnpm dev` serves on :5180, `pnpm preview` on :5181 — boot on alt ports, never disturb a
running instance. Tests are Node-env Vitest with hard timeouts (gate can't wedge).

## Working agreements (the director's standing preferences)
- **Grill before building** anything with open design forks (brief is the spec).
- **Targeted `git add <file>` only** — never `git add -A`/`.` with parallel builders.
- **Commit per layer**, clear messages; work branch is `claude/tower-rhythm-game-7a8727`,
  default branch stays clean. No `Co-Authored-By` trailer.
- **Leave deploys + PRs to the director** (open a PR only when explicitly asked).
- **Queue taste items** (feel/look/wording) for the director instead of blocking.
- When a report doesn't match the source, **rebuild/refresh before chasing a ghost.**
