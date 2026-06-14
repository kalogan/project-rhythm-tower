# 00 · Project Brief — `Project Rhythm Tower` (READ FIRST, ALWAYS)

> The shared context every Architect/Builder agent loads alongside the
> [Architect–Builder Pipeline](./ARCHITECT_BUILDER_PIPELINE.md). The pipeline says
> *how* to build; THIS says *what* we're building and the rules that never bend.
> Companion: [`../CLAUDE.md`](../CLAUDE.md) is the agent entrypoint that points here.

---

## 1. The product in one paragraph
A cozy 2.5D **rhythm tower-climber** for the browser. You ascend a tower one floor at
a time; each floor is a short rhythm challenge where a colored cue **flashes** and you
must **decode it into the right button** (blue→X, green→A, red→B, yellow→Y — the Xbox
face-button colors) and press it inside the beat window. Clear the floor's chart and
you climb; the decode-under-tempo is the skill, not just timing. It exists to make a
rhythm game whose difficulty grows along a *cognitive* axis (decoding a shifting
mapping) rather than only a twitch axis — climbed in a warm, forgiving mood where a
miss costs a retry, never a fall.

## 2. Pillars (3–5, ranked)
1. **Decode-under-tempo is the core skill.** The flash→button translation (and its
   mutation as you climb) is what makes this distinct from a lane game.
2. **Cozy & forgiving.** Floors are checkpoints; mistakes are lessons, never
   punishment. No permadeath, no falling. The mood is warm low-poly + bloom.
3. **Deterministic, authored-as-data climb.** Charts derive from a seeded generator;
   the audio/visuals are projections of one beat grid. Same seed → same floor.
4. **Escalation by band.** Each tower band introduces exactly one new difficulty axis
   (mapping mutation → new cue kinds → tempo/density), so the climb stays legible.

## 3. The core loop
Enter a floor → the procedural track starts on a shared beat grid → colored cues flash
on the beat → **decode color→button** under the active mapping and press in the window →
get instant, gentle feedback (perfect/good/miss, combo) → clear the floor's accuracy
bar → ascend to the next floor (new backdrop band as you rise). The dopamine is the
ascent + combo flow; the pull is "one more floor / can I hold the mutated mapping?"

## 4. Current state
Greenfield scaffold landed. Built: the toolchain (TS strict, Vite, Vitest, ESLint,
dependency-cruiser arch-guard, CI), and the **deterministic core** (`src/core`): seeded
PRNG, injected clock, beat grid, color→button cue model + mapping, deterministic chart
generator, judgment windows, scoring, and a pure floor-session reducer — all unit
tested. Content schemas (Zod), the first band pack (`atrium`), content/biome lints, and
a climbing-tower r3f backdrop (downward-scrolling parallax) + DOM cue-layer app shell.
Mobile/portrait play (responsive vertical falling lane + split two-per-side touch
controls) and a Vercel deploy config are in. A procedural music bed (percussion, bass,
low-passed pad on a i–vi–iv–v progression, arpeggio, scale-tuned cue tones) plays per
floor. FOUR bands climb end-to-end: Atrium (baseline), Spire (mapping mutation), Verdant
Canopy (decoys + doubles; doubles require BOTH buttons), Stormcrown Summit (tempo ramp
132→200 BPM, guarded by a minimum cue-spacing so hit windows never overlap). A swordfighter
stands at the hit point and swings a per-button attack, shattering well-timed cues, with
hit flash / shake / blade slash juice. NOT yet built: HOLD cues (need input-release
plumbing), atmosphere/bloom, real fighter art (placeholder atlas). Don't rebuild the core.

## 5. Scope — IN vs OUT (be ruthless)
- **In (now):** the decode-cue rhythm loop; floors-as-checkpoints; keyboard + gamepad +
  **touch** input; **portrait/mobile play** (responsive vertical cue lane); one playable
  band (baseline tap cues) end-to-end; deterministic chart gen; procedural Web Audio beat;
  the 2.5D r3f backdrop + DOM cue/HUD layer; **Vercel static deploy** config; the gate.
- **Out (later):** real licensed music; online play/leaderboards; account/persistence
  backend; level editor; story/narrative; monetization. (The richer cue kinds are *later*,
  not *never*.)

**Roadmap — Double mode** (start-screen stub shipped; gameplay phased, not yet built):
one player controls **two lanes via two 4-direction D-pads** (mobile: on-screen L/R d-pads;
desktop: WASD + arrow keys — left d-pad = left lane, right d-pad = right lane). **Shared HP
pool** across both lanes. Charts start as **call-and-response duets** (the two lanes form a
musical back-and-forth), scaling to **independent charts** later. Single-player only (no
online co-op). Phases: P1 two-lane core · P2 shared-HP/lives + combined run total to a
separate Double leaderboard · P3 polish (two fighters, two thumb clusters, shared music bed).

## 6. Tech spine (locked)
Single-package browser app. **The deterministic core is the source of truth; audio and
render are projections of it.**

```
src/core      pure deterministic logic (PRNG, clock, beat grid, cues, chart,
              judgment, scoring, session) — NO React/three/DOM/audio/IO imports
   ↓ (data)
src/content   Zod schemas + JSON packs/registries (bands, floors, mappings) + fixtures
   ↓
src/game      React + react-three-fiber backdrop (floors-as-biomes), DOM/canvas cue+HUD
              layer, input (keyboard+gamepad), Web Audio driver — all projections of core
src/art       shared three.js material/geometry helpers (low-poly + bloom)
src/lint      content + biome lint CLIs (the quality gates)
```
**Stack:** TypeScript (strict) · Vite · React 18 + react-three-fiber · three.js ·
Web Audio · Zod · Vitest · ESLint + dependency-cruiser (arch-guard) · GitHub Actions CI ·
pnpm.

## 7. The non-negotiable constraints (the quality bar — every builder gets these)
1. **Core purity (arch boundary).** `src/core` imports no React/three/DOM/audio/IO and
   no `src/game|art|lint`. Enforced by dependency-cruiser (`pnpm arch`).
2. **Source of truth.** The deterministic core is authoritative; audio + render are
   optimistic-cosmetic projections. All judgment (hit/miss/timing/score) is computed in
   the core, never in the view.
3. **Determinism.** The core injects clock + seeded PRNG; never `Math.random`,
   `Date.now`, or `performance.now` in `src/core` (eslint + arch-guard enforced). Same
   seed + inputs → same chart + same judgment.
4. **Hot-path discipline.** No per-frame allocation in the render/tick/audio loops;
   pre-allocate + mutate in place. `tick()` returns the same reference when idle.
5. **Version everything + golden fixtures.** Every content type / persisted shape carries
   `schemaVersion` and migrates forward; ship a golden fixture with every schema change.
6. **Additive content seam.** Floors/bands are data composed with deterministic
   generators, gated by id — adding a band touches only its own pack + kit + one routing
   case; it never edits a sibling. (Environment pipeline §1.)
7. **Testing contract.** Every new system ships tests; content + biome lints and the
   arch-guard stay green.

## 8. The balanced hard-gate (the automated definition of "done")
Fast, deterministic, blocking. Re-run with REAL exit codes; record test COUNTS.
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0  AND  `pnpm arch` (dependency-cruiser arch-guard) → exit 0
- `pnpm lint:content` → exit 0  AND  `pnpm lint:biome` → exit 0
- `pnpm test` → exit 0 (record counts)
- `pnpm build` → exit 0  ← the deploy build (tsc + vite build)
- Convenience: `pnpm gate` runs the whole chain.

## 9. Safety boundaries (Architect never does these unattended)
- Destructive/irreversible git: `reset --hard` that discards work, force-push, history
  rewrite while a parallel builder is live.
- External/side-effectful: deploys, publishing, spending money, sending messages.
- Trust actions: secrets, auth, access control.
- Opening a PR: only on explicit director request.

## 10. Commercial / success model (if any)
Non-commercial passion build for now. "Success" = the decode-cue loop *feels good* and a
band's escalation reads as fair-but-rising. PMF (is the decode-skill actually fun vs.
gimmicky?) stays a deliberate human call — judged by playtest, never assumed from a green
gate.

## 11. Glossary (project-specific terms)
- **Cue** — a flashed color the player must decode into a button and press on the beat.
- **Mapping** — the color→button table (default = Xbox colors); *mutates* as escalation.
- **Beat grid** — tempo→time source of truth; audio + visuals project from it.
- **Floor** — one rhythm challenge; clearing its chart's accuracy bar lets you ascend.
- **Band** — a run of floors sharing a look + one escalation axis (a "biome" of the tower).
- **Chart** — the deterministic set of cues for a floor, generated from a spec + seed.
- **Verdict** — a cue's resolved outcome: perfect / good / wrong / miss / avoided.
