---
name: sdlc-architecture
description: Phase 2 — propose a high-level architecture (components, tech choices, data flow, diagrams) from the approved docs/requirements.md and write docs/architecture.md.
disable-model-invocation: true
---

# Phase 2 — Architecture

## Precondition
`docs/requirements.md` must be `Status: Approved`. If it isn't, stop and point to `/sdlc-requirements`.

## Steps
1. Read `docs/requirements.md` fully.
2. Propose **2 candidate approaches** briefly (e.g. CLI script vs. GitHub Action vs. service), with trade-offs against the NFRs,
   and **recommend one**. Let the human choose before writing anything detailed.
3. Write `docs/architecture.md` using [template.md](template.md):
   - Components with IDs (`C-n`), single responsibility each, and the FR/NFR IDs each one satisfies.
   - Technology choices with a one-line justification and pinned major versions.
   - Data flow and component diagrams as **Mermaid** code blocks.
   - External interfaces (APIs, auth, rate limits), configuration and secrets handling, error-handling strategy.
   - A traceability matrix: every FR/NFR maps to at least one component. Flag any requirement that isn't covered.
4. Set `Status: Draft` and summarise it for the human.

## Gate
Ask the human to approve or request changes. On approval: set `Status: Approved`, fill in the Tech stack section of `CLAUDE.md`,
and commit `architecture: propose <approach>`. Then suggest `/sdlc-design-review`.
