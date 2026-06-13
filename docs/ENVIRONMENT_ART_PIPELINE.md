---
title: Cozy Low-Poly Environment Pipeline
subtitle: How to build distinct, legible, hand-authored game environments as data + deterministic generators
audience: [human, llm-agent]
status: portable-guide
source_project: Wayfinders (browser persistent-shard MMORPG)
engine_reference: TypeScript · three.js / react-three-fiber · Zod
license_note: This describes a WORKFLOW and an ARCHITECTURE. The principles are engine-agnostic; the code-level specifics assume a three.js scene graph. Adapt the seams to your own renderer.
---

# Cozy Low-Poly Environment Pipeline

A field guide to the approach we use to build environments — biomes — that feel
hand-made and distinct from each other, in a consistent cozy low-poly + bloom art
style, while staying cheap to run and safe to ship at scale.

The core idea in one sentence: **an environment is DATA (a "pack" that places
things) composed with DETERMINISTIC CODE GENERATORS (a "prop kit" that builds the
meshes), gated by automated quality lints — so a biome is authored, not modeled,
and adding one never touches another.**

This document is written to be read by a person *and* followed by a coding agent.
The narrative sections explain the "why"; the fenced blocks (schemas, contracts,
checklists, commands) are the machine-actionable "how."

---

## 0. TL;DR — the loop

```
THEME (region look)  →  PACK (biome layout, pure JSON)  →  PROP KIT (deterministic mesh generators)
                                  ↓                                    ↓
                          ATMOSPHERE (cosmetic ambience)      ROUTING SEAM (pack-id → kit, additive)
                                  ↓
                          LINT GATES (anchor · not-barren · legibility · distinct · cohesion)
                                  ↓
                          Build ONE reference biome → human eyeball → replicate the rest
```

Five non-negotiable quality principles every environment must satisfy (these are
enforced by lint where they can be measured, and by human review where they can't):

1. **OPEN** — a coherent explorable *area* that feels part of a larger world, not a
   confined gimmick level (no corridors / jump-puzzles unless that IS the concept).
2. **ANCHORED** — at least one *hero landmark* you orient by (a lighthouse, a henge,
   a world-tree, a glowing arch). Big maps get several, spread out.
3. **LEGIBLE** — strong contrast; you can always *see*. Colors must never blend into
   mush. Night scenes read via **emissive glow + contrast**, never murk.
4. **WALKABLE** — comfortable traversal; no jagged terrain or swim-throughs that
   fight the player.
5. **DISTINCT** — its own palette / sky / props, so it never blends with its
   siblings. Each environment gets a **recolored AND reshaped** prop kit — never a
   borrowed one.

---

## 1. The architecture: content-as-data, with a code seam

There are **two halves** to every environment, and keeping them separate is the
whole trick:

| Half | Lives in | Form | Who can break what |
|------|----------|------|--------------------|
| **Layout** — what is placed where, the palette, the mood numbers | `content/` | Pure JSON ("packs" + "registries") | Editing one biome's JSON cannot affect another |
| **Geometry** — how a prop is actually built into a mesh | client render code | Deterministic TS generator functions | A biome's kit is *gated by pack id*, so other biomes render byte-identical |

The seam between them is a **pack-id gate**: a pack references prop ids like
`prop.aurora-henge`; the renderer intercepts those ids *only when the resolved pack
is `pack:aurora`*. New biome art is therefore **purely additive** — no shared
schema change, no risk of regressing a shipped biome. This is the single most
important architectural property; preserve it in any adaptation.

```
ADDITIVE RULE (machine-checkable invariant):
  Adding a new biome touches ONLY:
    - content/packs/pack.<name>.json          (new file)
    - content/registries/*.json               (append rows: mobs, loot, etc.)
    - <renderPath>/<name>Props.ts             (new file)
    - <renderPath>/<name>Atmosphere.ts        (new file, optional)
    - the ONE routing module (resolveArtKit)  (add a case)
  It MUST NOT edit any other biome's pack or kit.
```

---

## 2. Directory layout

```
content/
  registries/
    themes.json          # region "look" families (palette, sky/fog defaults, band order)
    mobs.json            # creatures placeable in packs
    lootTables.json
    items.json  abilities.json  ...
  packs/
    pack.aurora.json     # ONE biome = ONE pack file (pure data)
    pack.mesa.json
    pack.<name>.json
  __fixtures__/          # golden-corpus snapshots for migration tests

<client>/game/
  <name>Props.ts         # bespoke prop kit: deterministic (prng)=>Object3D generators
  <name>Atmosphere.ts    # cosmetic ambience layer (particles, glow, water, sky FX)
  <ZoneRenderer>.tsx     # the shared zone renderer + resolveArtKit (the routing seam)
  art/
    prng.ts              # seeded PRNG (determinism source)
    palette.ts           # shared material helpers (flatMat, emissiveMat)
    geo.ts               # shared geometry helpers (jitterVerts, nonIndexedFlat)
    generators.ts        # the generator contract + shared field instancing

<shared>/content/
  biomeLint.ts           # the automated quality gate (see §6)
  themeLint.ts
```

---

## 3. The THEME — a region's shared "look"

A theme is the palette/sky/fog family that several sibling biomes share so a whole
*region* reads as one place. Biomes opt in via `themeId`. Themes are pure data.

```jsonc
// content/registries/themes.json  →  themes["theme:golden-reach"]
{
  "schemaVersion": 1,
  "id": "theme:golden-reach",
  "name": "Golden Reach",
  "description": "The warm golden-hour start band — cultivated, earthy lowlands of amber light.",
  "bandOrder": 3,                       // difficulty/progression band
  "paletteFamily": {                    // the region's signature hues
    "primary": "#c98a3a", "secondary": "#e8b24a", "accent": "#ffd98a"
  },
  "skyDefaults": { "zenithColor": "#5a78a8", "horizonColor": "#e8a85a",
                   "groundColor": "#caa46a", "warmth": 0.78 },
  "fogDefaults": { "color": "#e6c79a", "near": 40, "far": 120 },
  "propMaterialPalette": ["material:sun-timber", "material:amber-stone", "material:woven-thatch"],
  "mobFamily": "family:reach-fauna",
  "tags": ["start", "warm", "cultivated"]
}
```

The lint (see §6) checks that a biome's own palette/sky **sits within** its theme's
family (cohesion) yet still **differs from its theme siblings** (distinct identity).
Sibling biomes feel related but never interchangeable.

---

## 4. The PACK — one biome as pure data

A pack is the entire biome's *layout* with **zero geometry code**: terrain
generation parameters, the sky/fog/ambience mood, the hero landmarks, every
hand-placed prop, the instanced scatter fields, the spawn points. Annotated
skeleton (real fields, trimmed):

```jsonc
{
  "schemaVersion": 2,
  "id": "pack:aurora",
  "themeId": "theme:glacial-aurora",        // inherits the region look (§3)
  "name": "Aurora Tundra",
  "description": "...the design brief, in prose, as the source of truth...",
  "biome": "generic",                         // the shared render path (no bespoke structure kind)
  "version": "0.1.0",

  // ── Inhabitants (reference rows in the registries; never inline) ──
  "mobRefs": ["mob:arctic-fox", "mob:snowy-owl", "mob:spirit-elk"],
  "spawnGroups": [
    { "id": "spawn:arctic-fox", "mobRef": "mob:arctic-fox", "weight": 38, "minCount": 1, "maxCount": 2 }
  ],

  // ── HERO ANCHORS (the orientation landmarks — REQUIRED, lint-HARD) ──
  "landmarks": [
    { "id": "landmark:aurora-henge", "name": "The Aurora-Henge",
      "requiredLevel": 0, "pos": [-40, 0, -50], "chartRadius": 16 }
  ],

  // ── The MOOD numbers (drive the renderer's sky/fog/particles) ──
  "environment": {
    "precipitation": "none", "skyColor": "#0e1430", "horizonColor": "#243a6a",
    "fogColor": "#1a2648", "fogDensity": 0.78, "ambientTint": "#9fc4f0",
    "particleColor": "#5cffa6", "emberGlow": 0
  },

  // ── The render recipe: terrain gen + sky + fog + ambient audio ──
  "artKit": {
    "terrain": {                              // procedural heightfield params
      "artKitId": "terrain.snow", "seed": 7401, "size": 192, "segments": 96,
      "octaves": 3, "roughness": 0.28, "scale": 0.018, "height": 3.0,
      "palette": { "low": "#243258", "mid": "#324272", "high": "#5a72b0",
                   "rock": "#3a4566", "slope": "#445284", "peak": "#dce6ff",
                   "facetNoise": 0.08 }
    },
    "skybox": { "artKitId": "sky.aurora", "zenithColor": "#0e1430",
                "horizonColor": "#243a6a", "groundColor": "#1a2440", "warmth": 0.2 },
    "fog": { "color": "#1a2648", "near": 64, "far": 192 },
    "ambience": { "bedSoundId": "amb.wind", "gain": 0.6 }
  },

  // ── The actual placement of the biome's set-dressing ──
  "zoneLayout": {
    "playerStart": [0, 0, 34],
    "movementMode": "walk",                   // no genre-shifting verbs (no swim/glide gates)

    // HERO pieces — placed individually so they keep full detail + bloom punch:
    "props": [
      { "artKitId": "prop.aurora-henge", "pos": [-40,0,-50], "rotY": 0.4, "scale": 1.0, "seed": 7001 }
    ],

    // SCATTER fields — baked to ONE instanced mesh each (1 draw call, see §7):
    "propFields": [
      { "artKitId": "prop.aurora-snowdrift", "count": 72, "radius": 92,
        "innerRadius": 12, "scaleMin": 0.8, "scaleMax": 1.6, "seed": 7101 }
    ],

    "spawnPoints": [
      { "id": "sp:fox-1", "spawnGroupId": "spawn:arctic-fox", "pos": [8, 0, -10] }
    ]
  },

  "tags": ["expedition", "aurora", "tundra", "night", "cozy"]
}
```

**Authoring conventions that matter:**

- **The `description` is the design brief.** Write the vision in prose *first* — the
  anchors, the palette logic, the legibility plan, the "why it's distinct from its
  nearest sibling." Everything downstream serves it. (Ours run long on purpose.)
- **Every placement carries a `seed`.** Determinism is law (§7): same seed → same
  mesh, forever. No `Math.random()` at placement OR generation time.
- **`pos` is `[x, y, z]`**, y up, 1 unit = 1 meter. Props pivot at their base.
- **Hero vs field is a perf decision** (§7), not just an art one: anything you want
  dense goes in `propFields` (instanced); anything you want pixel-perfect and unique
  goes in `props`.

---

## 5. The PROP KIT — deterministic geometry generators

The geometry lives in code, behind a single tiny contract. Each prop is a pure
function from a seeded PRNG to a scene-graph object:

```ts
// THE GENERATOR CONTRACT (memorize this — it is the whole API)
//   (prng: ArtPRNG) => THREE.Object3D
//   - pivot at the BASE of the object (+Y up, +Z forward, 1 unit = 1 m)
//   - DETERMINISTIC: same seed → same mesh. No Math.random / Date.now.
//   - faceted low-poly to match the house style; emissive where it should bloom.

import { flatMat, emissiveMat } from '../art/palette.js';   // shared material helpers
import { jitterVerts, nonIndexedFlat } from '../art/geo.js'; // shared geometry helpers
import type { ArtPRNG } from '../art/prng.js';

// A biome-scoped palette: module-local color tokens. The biome's LEGIBILITY is
// designed HERE — a cool dark base vs. bright emissive beacons that POP off it.
const AUR = {
  snowDeep:   new Color(0x2a3a64),  // dark cool base
  snowCrest:  new Color(0xdce6ff),  // bright crest that pops off the dark
  auroraCyan: new Color(0x4ff0d8),  // emissive beacon → bloom
  amberGlow:  new Color(0xffb24a),  // warm light vs. the cold (contrast)
  // ...
} as const;

function glowMat(c: Color, intensity: number) { return emissiveMat(c, c, intensity); }

// One generator per prop id referenced by the pack:
export function auroraHenge(prng: ArtPRNG): Group { /* ...build the hero anchor... */ }
export function auroraSnowdrift(prng: ArtPRNG): Group { /* ...field tile... */ }
```

**House-style rules baked into the kit:**

- **Faceted low-poly + bloom.** Flat-shaded facets; emissive materials on anything
  that should glow (windows, runes, water, fire) so the post-process bloom does the
  "magic" for free.
- **Legibility is a palette decision, made in the kit.** Pick a *cool dark base* and
  a few *bright emissive beacons* that pop off it. For a night biome this is the
  entire game: the aurora/glow IS the light you navigate by.
- **Reshape, don't reskin.** A new biome's tree is a *different mesh*, not the last
  biome's tree in a new color. Sharing happens at the helper level (`flatMat`,
  `jitterVerts`, a `makeSpringPool` recipe), not the prop level.
- **Shared low-level helpers, biome-local tokens.** Material/geometry helpers are
  global; the color palette is a module const in the kit so it can't leak.

---

## 6. The ATMOSPHERE — cosmetic ambience

A separate, optional module adds the *living* polish that sells the mood: drifting
snow, aurora ribbons, steam columns, a glowing pool, fireflies, light-shafts. It is
**purely cosmetic and data-gated** (only runs for its pack id; every other biome is
byte-identical). It obeys the hot-path rules hard:

```ts
// ATMOSPHERE CONTRACT
//  - Build EVERYTHING once (e.g. in a useMemo). No per-frame allocation, no setState.
//  - Each particle system = ONE Points/InstancedMesh (1 draw call), shared material.
//  - Per-frame update mutates pre-allocated typed arrays / transforms IN PLACE.
//  - All motion is a pure function of clock t + per-element phase seeded at build.
//  - Prefer emissive + bloom over real lights (lights are expensive; glow is not).
```

Atmosphere is where "okay" biomes become memorable. Budget time for it.

---

## 7. The two laws: determinism & performance

These are the constraints that keep the whole system shippable. Treat them as
inviolable.

**Determinism.** Every mesh and every particle is a pure function of an injected
seed (and, for motion, the clock). Never `Math.random()` or `Date.now()` in
generation or placement. This is what lets the same pack render identically on every
client and machine, and lets golden-corpus tests pin the output.

**Performance — instancing discipline.** A big map cannot ship thousands of raw
draw calls.

```
PERF RULE:
  - SCATTER fields (grass, rocks, drifts, reeds — the dense repeated stuff)
      → ONE InstancedMesh per field (1 draw call), no matter the count.
      → keep per-unit-area density LOWER on big maps; the SENSE of scale comes
        from terrain size + long fog + spread beacons, NOT 4× raw meshes.
  - HERO pieces (the few anchors + unique buildings)
      → individual groups, so they keep full detail + bloom.
  - Light count is a hard budget: prefer emissive+bloom over adding real lights.
```

---

## 8. The QUALITY GATE — automated lint

The five principles (§0) are partly machine-checkable. A content lint runs in CI and
blocks merge. Criteria, by severity:

| Criterion | Severity | What it checks |
|-----------|----------|----------------|
| **anchor** | HARD (fails build) | The biome has ≥1 valid hero landmark. |
| **not-barren** | HARD | A heightfield biome has authored prop dressing (`props`/`propFields`). |
| **legibility** | WARN | A deterministic contrast metric: the relative-luminance **spread** across the key terrain palette + accent tones must exceed a threshold (catches "every band the same brightness" mush). |
| **distinct-identity** | WARN | A biome's palette+sky signature must differ from its **theme siblings** (siblings in one region must still read as distinct maps). |
| **theme-cohesion** | WARN | A biome's signature must not drift too FAR from the mean of its theme family (no clashing outlier). |

```bash
# the gates (adapt names to your repo):
pnpm lint:content     # schema validity of every pack + registry
pnpm lint:biome       # the 5-principle environment lint above
pnpm lint:creature    # per-species mesh/stat validity
```

The lint encodes taste that CAN be measured. The rest — "does it feel open? is the
anchor readable from across the map? is traversal comfortable?" — is caught by the
**human eyeball pass** in the workflow (§9). Don't try to lint everything; lint the
measurable, review the rest.

---

## 9. The WORKFLOW — reference-first, then replicate

This is the actual day-to-day process, and the part most worth copying.

```
STEP 0  Write the brief. In the pack's `description`, in prose: the concept, the
        hero anchor(s), the palette + legibility plan, and explicitly "how is this
        DISTINCT from its nearest sibling?" This is the spec everything serves.

STEP 1  Build ONE reference biome end-to-end:
          a. theme entry (if it's a new region look)
          b. pack.<name>.json   (layout, mood, anchors, placements — all data)
          c. <name>Props.ts     (the bespoke kit: hero anchors first, then fields)
          d. <name>Atmosphere.ts (the ambience polish)
          e. wire the routing seam (resolveArtKit case for the pack id)
          f. add mobs/fauna rows in the registries

STEP 2  Run the gates: schema lint + biome lint + typecheck + build. Green or fix.

STEP 3  HUMAN EYEBALL. Look at it in-engine. Judge it on the 5 principles by feel.
        Iterate the data (palette, fog, anchor placement, density) — most fixes are
        JSON edits, no code. This is the taste loop the lint can't replace.

STEP 4  Once the reference is APPROVED, replicate the pattern for sibling biomes.
        Each is the same five files; the kit is reshaped+recolored, never borrowed.

PARALLELISM FOOTGUN: biome builders that edit a SHARED file (the routing module, a
        shared registry, the zone renderer) must be SERIALIZED — two at once on the
        same file corrupt each other. Parallelize only fully disjoint file sets.
```

The discipline that makes this scale: **one reference → human approval → replicate.**
Never mass-produce before the first one is judged good.

---

## 10. Adapting this to your own engine

The portable, engine-agnostic core (copy this wholesale):

- **Environments are DATA composed with deterministic generators.** Layout in
  declarative files; geometry behind a `(seed) => object` contract.
- **The additive pack-id seam** so new environments can't regress old ones.
- **The five quality principles** + an automated lint for the measurable ones
  (anchor presence, not-barren, palette contrast spread, sibling distinctness).
- **Determinism + instancing** as hard laws.
- **The reference-first workflow** with a mandatory human taste pass.

The engine-specific bits to re-bind to your stack:

- `three.js / r3f` → your renderer. The generator contract becomes
  `(prng) => <your scene node>`; "instanced field = 1 draw call" maps to your
  engine's instancing/batching primitive.
- The shared helpers (`flatMat`, `emissiveMat`, `jitterVerts`) → your material/mesh
  utilities. "Emissive + bloom" → your post-process stack.
- The lint CLI → any script that loads your data files and asserts the criteria.

Everything in §§0–9 above survives the swap; only §5–§7's three.js nouns change.

---

### Appendix A — machine-readable build manifest

A coding agent can treat the following as the checklist to add one environment.

```yaml
add_environment:
  inputs:
    name: <kebab-case>            # e.g. "aurora"
    theme_id: theme:<region>      # existing or new
    concept_brief: <prose>        # the design spec; becomes pack.description
  create_files:
    - path: content/packs/pack.<name>.json
      requires: [schemaVersion, id, themeId, description, artKit.terrain,
                 landmarks>=1, zoneLayout.props|propFields, zoneLayout.playerStart, tags]
    - path: <client>/game/<name>Props.ts
      contract: "(prng: ArtPRNG) => Object3D, base-pivot, deterministic, faceted low-poly"
      requires: [hero_anchor_generators, field_generators, biome_local_palette_const]
    - path: <client>/game/<name>Atmosphere.ts        # optional but recommended
      contract: "build-once, zero per-frame alloc, data-gated by pack id, emissive>lights"
  edit_files:
    - path: <client>/game/<ZoneRenderer>.tsx
      change: "add resolveArtKit case mapping prop.<name>-* ids to the new kit"
    - path: content/registries/mobs.json (+ lootTables/abilities as referenced)
      change: "append new rows; never inline mob/loot defs in the pack"
  forbidden:
    - editing any other biome's pack or prop kit
    - Math.random() / Date.now() anywhere in generation or placement
    - raw per-instance meshes for dense scatter (must be one instanced field)
    - genre-shifting movement verbs unless that IS the concept
  gates_must_pass:
    - <pkgmgr> lint:content
    - <pkgmgr> lint:biome        # anchor=HARD, not-barren=HARD, legibility/distinct/cohesion=WARN
    - <pkgmgr> -r build
  then:
    - human_eyeball_pass: "judge against the 5 principles; iterate the DATA first"
    - on_approval: "replicate the pattern for sibling biomes (serialize shared-file edits)"
```

### Appendix B — the five-principle review card (for the human pass)

```
[ ] OPEN      — reads as a real place, not a confined gimmick level
[ ] ANCHORED  — a hero landmark is visible + orienting from across the map
[ ] LEGIBLE   — I can always SEE; contrast carries it; no mush (even at night)
[ ] WALKABLE  — traversal is comfortable; no jagged/ swim fights
[ ] DISTINCT  — its palette/sky/props don't blend with any sibling biome
```
