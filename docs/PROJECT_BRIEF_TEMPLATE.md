# 00 · Project Brief — `<PROJECT NAME>` (READ FIRST, ALWAYS)

> Fill every `<…>`. This is the shared context every Architect/Builder agent loads
> alongside the [Architect–Builder Pipeline](../ARCHITECT_BUILDER_PIPELINE.md). The
> pipeline says *how* to build; THIS says *what* you're building and the rules that
> never bend. Keep it short, opinionated, and current — it's the thing the Architect
> grills against and dispatches from. (Companion: `CLAUDE_md_TEMPLATE.md` is the
> agent-facing entrypoint that points here.)

---

## 1. The product in one paragraph
`<What it is, for whom, and the single sentence that captures why it exists. One paragraph. If you can't, you haven't decided yet — decide.>`

*Example (woodturning sim): "A browser 3D woodturning simulator that teaches the real techniques of the craft — roughing, spindle/bowl gouges, parting, sanding — through hands-on practice with honest tool-to-wood physics and gentle coaching, so a beginner builds real muscle-memory and judgment before touching a live lathe."*

## 2. Pillars (3–5, ranked)
The non-negotiable design truths. Everything serves these; if a feature fights a pillar, the pillar wins.
1. `<Pillar 1 — the core promise>`
2. `<Pillar 2>`
3. `<Pillar 3>`

*Example: 1. Honest physics teaches judgment (tool angle/speed/pressure → real wood behavior). 2. Learn by doing, not reading (practice + feedback, not lecture walls). 3. Cozy + forgiving (mistakes are lessons, never punishment).*

## 3. The core loop
`<The 30-second to few-minute loop the user repeats. Draw it. What's the dopamine? What pulls them to the next rep?>`

*Example: pick a project → mount the blank → shape with a tool (physics) → get gentle real-time feedback (catch, tear-out, angle) → finish + a "what you learned" beat → next technique/project.*

## 4. Current state
`<What exists today. Update this every milestone — it's the "don't rebuild what's here" section. For a brand-new project: "nothing yet; greenfield.">`

## 5. Scope — IN vs OUT (be ruthless)
- **In (now):** `<the must-haves for the first usable version>`
- **Out (later / never):** `<everything you're deferring or refusing — name it so it doesn't sneak in>`

## 6. Tech spine (locked)
`<The stack + the high-level architecture diagram. Lock it so builders don't re-litigate it per slice. Name the source-of-truth boundary (see constraint #2).>`

```
<e.g. pure-logic core (deterministic, no UI/IO imports)
   → server/authority (if multiplayer/persisted)
   → DB (versioned rows) / persistence
   → client (React + render layer)>
```
**Stack:** `<languages, frameworks, test runner, schema/validation, lint/arch-guard, CI, hosting>`

## 7. The non-negotiable constraints (the quality bar — every builder gets these)
Few, explicit, **testable**, and each one **gated** (a rule that isn't gated will be violated). Adapt to your project; the *kinds* that belong here:
1. **`<Architecture boundary>`** — e.g. "the pure-logic core imports no UI/transport/DB" (enforced by an automated dependency guard).
2. **`<Source of truth>`** — e.g. "the server/core is authoritative; the client is optimistic-cosmetic; never trust client-reported state." (For a single-player app: "the deterministic core is the truth; the view is a projection.")
3. **`<Hot-path discipline>`** — e.g. "no per-frame allocation in the render/tick loop; pre-allocate + mutate in place."
4. **`<Versioning>`** — "every persisted row/type carries a schemaVersion and migrates forward; ship a golden fixture with every schema change."
5. **`<Determinism>`** — "the core injects clock + RNG; never call wall-clock/`Math.random` directly" (makes everything testable + replayable).
6. **`<Testing contract>`** — "every new system ships tests; every content/data pack passes its lint; the arch-guards stay green."

## 8. The balanced hard-gate (the automated definition of "done")
The fast, deterministic, **blocking** commands the Architect re-runs with REAL exit codes (never trusts a builder's "green"). List YOUR exact commands:
- `<typecheck>` → exit 0
- `<lint + architecture guards>` → exit 0
- `<unit tests>` → exit 0 (record COUNTS)
- `<schema/migration golden fixtures>` → exit 0
- `<content/data lint, if any>` → exit 0
- `<build>` → exit 0  ← **and the deploy build if it differs (e.g. a recursive/all-package build)**

## 9. Safety boundaries (Architect never does these unattended — §8 of the pipeline)
- `<destructive/irreversible: hard resets, force-push, dropping data>`
- `<external/side-effectful: deploys, sending messages, spending money, production>`
- `<designated risky milestones the director flagged "stop and ask first">`
- `<trust actions: auth, secrets, access control>`

## 10. Commercial / success model (if any)
`<How it makes money or what "success" means. Even a learning tool has a success metric — name it so PMF stays a deliberate human call, never assumed.>`

## 11. Glossary (project-specific terms)
`<Define the nouns your builders must use precisely.>`
