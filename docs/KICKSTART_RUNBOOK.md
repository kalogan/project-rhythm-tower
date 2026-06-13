# Kickstart Runbook — spinning up a NEW project on the Architect–Builder Pipeline

> A concrete checklist for going from "I have an idea" to "the pipeline is running."
> Expands §"Adapting to another project" of the
> [Architect–Builder Pipeline](../ARCHITECT_BUILDER_PIPELINE.md). Hand this + the
> two templates (`PROJECT_BRIEF_TEMPLATE.md`, `CLAUDE_md_TEMPLATE.md`) to an Architect
> agent and answer its grills.

## The kickstart kit (what to feed a fresh Architect agent)
1. **`ARCHITECT_BUILDER_PIPELINE.md`** — the methodology (how to orchestrate). Reused verbatim across projects.
2. **`docs/00_PROJECT_BRIEF.md`** — filled from `PROJECT_BRIEF_TEMPLATE.md`. The *what* + the rules. **This is the piece the pipeline can't supply — you must author it (or have the Architect grill it out of you).**
3. **`CLAUDE.md`** — filled from `CLAUDE_md_TEMPLATE.md`. The repo entrypoint that points at the other two.

The pipeline alone is necessary but **not sufficient** — without the Brief there's nothing to grill against or build toward. The fastest path: let the Architect **grill you into the Brief first** (step 1 below), then it can run autonomously.

## Step 0 — Decide it's worth the pipeline
Use it when the work **decomposes into many disjoint slices**, quality must stay high without constant babysitting, and the work is mostly reversible. For a tiny one-off, skip it and just build.

## Step 1 — GRILL the design into a Brief (do this before any code)
Have the Architect interrogate you on the **forks that most change the build** — typically:
- **Core mechanic / loop** — the one thing the user does repeatedly.
- **Data / state / (movement) model** — the shape of the truth.
- **Fail-state + UX tone** — what "doing it wrong" feels like.
- **Generation / authoring approach** — hand-authored vs procedural vs data-driven content.
- **Build-vs-reuse** — what you adopt off-the-shelf vs build.
Answer as mutually-exclusive choices. Output: a filled `00_PROJECT_BRIEF.md`.

## Step 2 — Write the non-negotiable constraints (Brief §7)
Few, explicit, **testable**, each one **gated**. The recurring high-value ones: an
architecture boundary (enforced by a dep-guard), a single source-of-truth rule, a
hot-path discipline, versioning + golden fixtures, deterministic core, a testing
contract. *A rule that isn't in the gate will be violated.*

## Step 3 — Define the balanced hard-gate (Brief §8)
The fast deterministic command set that defines "done": typecheck · lint + arch-guards ·
unit tests (record counts) · golden/migration · content lint · build. **Include the
deploy build** if it differs from per-package builds (the host's recursive build is
the real gate — verify shared/schema changes that way). Wire arch-guards (e.g.
dependency-cruiser) so boundaries are enforced, not hoped.

## Step 4 — Scaffold the repo
- Monorepo or single package? Set up the package manager, TS/strict (or your lang), the
  test runner, the linter + the **architecture guard**, and CI that runs the gate on PR.
- Pick the **work branch**; keep the default branch clean. Decide commit-author identity
  + message convention.
- Stand up local services (DB/cache) + the dev/test scripts. Document all of it in `CLAUDE.md` §Environment.

## Step 5 — Set the safety boundaries (Brief §9)
The stop-and-ask list the Architect never crosses unattended: destructive/irreversible
git, deploys/external side-effects, designated risky milestones, trust/auth/secret
changes. Put deploy in the director's hands unless explicitly delegated.

## Step 6 — Set up durable status + a review queue
- **Status/memory:** what's done, what's running (with builder IDs), what's queued, the
  last known-green gate counts, the active constraints — so a fresh context resumes cold.
- **Review queue:** a place to append taste/feel/wording items for the director instead
  of blocking on them (write → persist → notify).
- A **roadmap** with explicit next-up ordering.

## Step 7 — Run the loop
`grill → plan (disjoint, sequenced) → dispatch (scoped + constrained + gated, background)
→ supervise (mtime + commits, not process counts) → VERIFY (re-run the gate, real exit
codes, record counts) → recover (salvage → relaunch) → persist → advance (or stop-before).`

## First-week pitfalls (pre-paid in blood — see the pipeline Appendix)
- **Don't trust "all green"** — re-run the gate yourself with real exit codes; record test counts (a silent drop = deleted tests).
- **Liveness = file mtime + commits**, never process count (a hung gate leaves zombie processes that look alive).
- **Commit per layer + timeout every gate command** — so a hang costs one increment + fails fast, not the whole task forever.
- **Targeted `git add` only** — never `git add -A` with parallel builders (it sweeps another's files).
- **Stale build masquerades as a bug** — when a report doesn't match the source, rebuild/hard-refresh before chasing a ghost. Verify shared-schema changes with the *deploy* build, not just per-package typecheck.
- **A new optional schema field:** prefer `optional` over `default` on widely-constructed types, or every existing literal/fixture breaks the build.
