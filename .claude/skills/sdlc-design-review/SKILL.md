---
name: sdlc-design-review
description: Phase 3 — independent senior design review of docs/architecture.md against the requirements; records findings and decisions in docs/design-review.md and updates the architecture.
disable-model-invocation: true
---

# Phase 3 — Design review

## Precondition
`docs/architecture.md` must be `Status: Approved`.

## Steps
1. Delegate the review to the **design-reviewer** subagent (Agent tool, `subagent_type: design-reviewer`) so it works with a fresh,
   independent context. Give it the paths `docs/requirements.md` and `docs/architecture.md` and ask for findings.
2. Write `docs/design-review.md`:
   - Findings table: `DR-n | Severity (Blocker/Major/Minor) | Area | Finding | Recommendation`.
   - Areas to cover: requirement coverage gaps, security (secrets, input validation, least-privilege tokens), failure modes
     (API errors, rate limits, missing files, empty repos), scalability, testability, operability, over-engineering.
3. Present the findings to the human. For each one, the human chooses **Accept / Reject / Defer**. Record the decision and rationale
   in a "Design decisions" section (`DD-n`).
4. Apply every accepted change to `docs/architecture.md`, adding a Revision history row that cites the `DR-n`.
   An architecture changed this way goes back to `Draft` until the human re-approves it.

## Gate
No Blocker may remain open. On the human's approval, set both docs to `Approved` and commit
`design-review: record findings and decisions`. Then suggest `/sdlc-plan`.
