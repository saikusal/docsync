---
name: sdlc-implement
description: Phase 5 — implement the next unblocked task(s) from docs/impl-plan.md, test-first, with human approval of each diff before it is committed.
argument-hint: "[task id, e.g. T-3 | blank for next unblocked]"
disable-model-invocation: true
---

# Phase 5 — Implementation (human in the loop)

## Precondition
`docs/impl-plan.md` must be `Approved`. The guard hook blocks edits to `src/` and `tests/` otherwise.

## Loop, one task at a time
1. Pick `$ARGUMENTS`, or else the first task whose dependencies are all done. Re-read its requirements and "Done when".
2. Explain in 3–5 bullets what you will change and why. **Wait for the human's go-ahead.**
3. Write the tests first (happy path plus edge cases: missing fields → `Not Found`, API error, missing file, empty repo). Then implement.
4. Run the tests and the linter. Fix until green.
5. Show the diff summary and the test output. **Wait for approval.** On approval, commit `impl(T-n): <summary>`
   (the pre-commit hook re-runs the tests) and tick the task in `docs/impl-plan.md` (`- [x]`).
6. Ask whether to continue with the next task.

## Coding rules
- Follow `docs/architecture.md`. If a task requires deviating from it, stop and ask; record agreed deviations in the architecture's revision history.
- Secrets come only from environment variables; keep `.env.example` up to date (names only).
- Validate all external input. Use self-explanatory names; keep functions small; no duplicated logic.
- Use exact or caret-pinned dependency versions, and run `npm audit` (or the stack's equivalent) after adding any.
