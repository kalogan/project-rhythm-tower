# CLAUDE.md — `<PROJECT NAME>` (the agent entrypoint)

> This is the file an agent reads FIRST in the repo (name it `CLAUDE.md` at the repo
> root). It's a thin index that points at the real docs + states the rules that must
> never be missed. Keep it SHORT — link out, don't duplicate. Companions:
> `docs/00_PROJECT_BRIEF.md` (what the project is) + `docs/ARCHITECT_BUILDER_PIPELINE.md`
> (how to orchestrate).

`<One-line description of the project.>` **Before doing any work, read
`docs/00_PROJECT_BRIEF.md`** (the locked design + constraints). Build **one slice at
a time**; for large features, phase into sequenced, individually-green slices.

## Current state (iterated — read before assuming what exists)
`<2–4 sentences: what's built, what's in flight, what NOT to rebuild. Point at the
brief §4 + the latest status/scorecard as the live source of truth. Update this as
the project grows — a stale "current state" is how agents rebuild things.>`

**Shared-file footgun:** `<name the files multiple builders tend to touch — the
registry, the schema, the shared renderer — and the rule: never run two builders
editing the same file at once; they share one working tree.>`

## The non-negotiable constraints (NON-NEGOTIABLE — mirror brief §7)
1. `<constraint 1>`
2. `<constraint 2>`
3. `<constraint 3>`
4. `<constraint 4 — version everything + golden fixtures>`
5. `<constraint 5 — deterministic core>`
6. `<constraint 6 — testing contract + arch-guards stay green>`

## Tech spine
`<one-line stack + the package/folder layout so an agent can navigate cold.>`

## The gate (what "done" means)
`<the exact commands — see brief §8. Note the DEPLOY build command explicitly if it
differs from the per-package build (e.g. a recursive build the host runs), so a
shared-schema change is verified the way the deploy actually builds it.>`

## Environment notes
`<OS, runtime versions, package manager, how to run the dev server / tests / lints,
any local services (DB/cache) + how they're started. The things an agent needs to
not guess.>`

## Working agreements (the director's standing preferences)
`<e.g. commit discipline (targeted adds only, author identity, no Co-Authored-By if
you don't want it), "leave deploys for me", "never paste secrets", push cadence,
which actions need a stop-and-ask. These are the taste/process rules encoded once so
they aren't re-litigated per slice.>`
