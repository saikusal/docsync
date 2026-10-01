---
name: sdlc-plan
description: Phase 4 — break the approved architecture into a prioritised, dependency-ordered task list in docs/impl-plan.md, including blocked tasks.
disable-model-invocation: true
---

# Phase 4 — Implementation planning

## Precondition
`docs/architecture.md` and `docs/design-review.md` must both be `Approved`.

## Steps
1. Read the requirements, architecture and design review.
2. Break the work into tasks small enough to review as one diff (roughly ≤ 200 lines each). For each task record:
   `T-n | Title | Component (C-n) | Requirements (FR/NFR) | Depends on | Blocked? | Done when (testable) | Tests to write`.
3. Order the tasks topologically by dependency. Put project scaffolding (package/config, lint, test runner) first and tests next to the
   code they cover; never leave all the tests to the end.
4. Add a **Mermaid dependency graph** and a **Blocked tasks** section explaining what each blocked task is waiting for.
   Also list the tasks that can run in parallel.
5. Add a Risks section (carried over from the design review) and a Definition of Done.
6. Write `docs/impl-plan.md` with the standard header, `Status: Draft`.

## Gate
Ask the human to approve. Setting `Status: Approved` **unlocks edits to `src/` and `tests/`** (enforced by `.claude/hooks/guard.js`).
Commit `plan: dependency-ordered task breakdown`, then suggest `/sdlc-implement`.
