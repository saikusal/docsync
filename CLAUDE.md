# Agentic SDLC Capstone — Automated Documentation Sync

This repo is delivered end-to-end by Claude Code acting through **skills, subagents and hooks**.
Every SDLC phase produces a committed artifact in `docs/`, and every phase ends at a
**human approval gate**. Never skip a gate or approve on the human's behalf.

## Pipeline

| # | Phase | Skill | Artifact | Gate |
|---|-------|-------|----------|------|
| 1 | Requirements | `/sdlc-requirements` | `docs/requirements.md` | Human answers clarifying questions, then approves |
| 2 | Architecture | `/sdlc-architecture` | `docs/architecture.md` | Human approves |
| 3 | Design review | `/sdlc-design-review` | `docs/design-review.md` (+ updated architecture) | Human accepts decisions |
| 4 | Implementation plan | `/sdlc-plan` | `docs/impl-plan.md` | Human approves — **unlocks `src/` and `tests/`** |
| 5 | Implementation | `/sdlc-implement` | code in `src/`, `tests/` | Human approves each task's diff |
| 6 | Code review | `/sdlc-review` | `docs/code-review.md` | All blocking findings fixed |
| 7 | Verify | `/sdlc-verify` | `docs/verification.md` | Tests green + output doc passes quality check |
| 8 | Pull request | `/sdlc-pr` | PR + `CHANGELOG.md` entry | Human merges |

Run `/sdlc-status` at any time to see where the pipeline stands.

## Artifact conventions

Every `docs/*.md` artifact starts with this header block, kept up to date:

```
> **Status:** Draft | Approved
> **Approved by:** <name> on <YYYY-MM-DD>   (blank while Draft)
> **Inputs:** <files this artifact was derived from>
```

- A phase may only start when the previous phase's artifact is `Approved`.
- Only set `Status: Approved` after the human explicitly says so in chat.
- Downstream artifacts reference upstream IDs (requirement `FR-1`, `NFR-2`, component `C-3`, task `T-4`, finding `DR-5`) so everything is traceable back to the user story.

## Rules

- **Ask, don't assume.** When the user story or an upstream artifact is ambiguous, ask the human. Record answers in the artifact; never invent requirements.
- **"Not Found" over guessing.** If the generated documentation lacks a value, the tool must write `Not Found` rather than fabricate content.
- **No secrets** in code, logs, test fixtures or generated docs. Tokens come from environment variables only (see `.env.example`). The hook in `.claude/hooks/guard.cjs` blocks obvious secret patterns.
- **Branching:** all phase work (1–7) is committed on `feature/docs-sync`, never on `main`. Phase 8 opens the PR `feature/docs-sync → main`. If the current branch is `main`, switch to (or create) `feature/docs-sync` before committing.
- **Small commits per phase / task**, message format: `<phase>: <summary>` e.g. `requirements: capture FR/NFR for doc sync`, `impl(T-3): add GitHub client`.
- Do not push or open a PR without the human's go-ahead.

## Hooks (enforced automatically — see `.claude/settings.json`)

- `SessionStart` → prints pipeline status so each session knows the current phase.
- `PreToolUse` on Write/Edit → blocks edits to `src/` or `tests/` until `docs/impl-plan.md` is Approved; blocks writing likely secrets and `.env` files.
- `PreToolUse` on Bash → before any `git commit`, runs the test suite if one exists; a failing suite blocks the commit.

## Repository

GitHub: `saikusal/docsync` (public, MIT). Default branch `main`.

## Tech stack

Node.js >= 22.12 (CI: 22, 24) · TypeScript 6.0 (strict, ESM) · commander 15 · zod 4 · @octokit/rest 22 (+throttling, retry) ·
@babel/parser + traverse 7.29 · fast-glob · ignore · diff · vitest 5 · eslint 10 + typescript-eslint · prettier · tsup.
Details and rationale: `docs/architecture.md` §6.

## Delegated approvals

On 2026-10-01 saikusal delegated the gates for phases 3–7 ("go ahead with your recommendations"). Record those approvals as
`saikusal (delegated) on <date>` and list each decision taken in the artifact. Phase 8 (push / PR) still needs an explicit go-ahead.
