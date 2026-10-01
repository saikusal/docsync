---
name: sdlc-review
description: Phase 6 — structured peer code review of the implementation against the capstone checklist (correctness, security, error handling, coverage, clarity, DRY, dependency safety); writes docs/code-review.md and drives fixes.
disable-model-invocation: true
---

# Phase 6 — Code review

## Precondition
Every task in `docs/impl-plan.md` is ticked.

## Steps
1. Delegate to the **code-reviewer** subagent (`subagent_type: code-reviewer`) for an independent review of `src/`, `tests/`
   and the dependency manifest against `docs/requirements.md`.
2. Write `docs/code-review.md` with one section per checklist area, each with a verdict (Pass / Needs work) and findings
   (`CR-n | Severity | file:line | Finding | Fix`):

   | Area | Question |
   |------|----------|
   | Correctness | Does each component behave as specified in requirements.md? |
   | Security | Are secrets excluded from output? Is user input validated? |
   | Error handling | Are API failures, missing files and empty repos handled gracefully? |
   | Test coverage | Do tests cover the happy path AND the 'Not Found' / missing-field cases? |
   | Code clarity | Are names self-explanatory? Is the logic easy to follow without comments? |
   | DRY | Is there duplicated logic to refactor into a shared function? |
   | Dependency safety | Are any package versions known to be vulnerable? (include `npm audit` output) |

3. Present the findings. With the human's approval, fix them (each fix is a commit `review(CR-n): …`) and update each finding's status.

## Gate
All Blocker and Major findings are fixed or explicitly waived by the human. Set `Status: Approved`, commit, then suggest `/sdlc-verify`.
