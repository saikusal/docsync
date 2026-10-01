---
name: sdlc-pr
description: Phase 8 — create the pull request with the required description sections, a CHANGELOG entry and a reviewer checklist, completing the agentic SDLC cycle.
disable-model-invocation: true
---

# Phase 8 — Pull request

## Precondition
All artifacts are `Approved` (check with `node .claude/hooks/status.cjs`), and the working tree is clean apart from this phase's changes.

## Steps
1. Make sure the work is on a feature branch (e.g. `feature/doc-sync`), not `main`. Create one if needed.
2. Add a `CHANGELOG.md` entry under `## [Unreleased]` in Keep a Changelog format (Added / Changed / Fixed). Commit `docs: changelog entry`.
3. Draft the PR description from [.github/pull_request_template.md](../../../.github/pull_request_template.md), filling **every** section:
   - **Summary**: 2–3 sentences on what was built and why (cite the user story).
   - **Changes Made**: every file added or modified (`git diff --stat main...HEAD`) and the reason for each.
   - **Test Evidence**: paste the test run output from `docs/verification.md`, or a CI link.
   - **Known Limitations**: everything marked `Not Found`, deferred findings (DR/CR), and out-of-scope items.
   - **Reviewer Checklist**: a tick-list derived from the requirements and the review checklist.
   - **SDLC Traceability**: links to each docs/ artifact.
4. Show the human the full description. **Wait for approval** before pushing.
5. Push and open the PR: `gh pr create --base main --title "<title>" --body-file <file>`.
   If `gh` is not installed or authenticated, save the description to `docs/pr-description.md` and give the human the compare URL instead.

Never merge the PR yourself; merging is the human's final gate.
