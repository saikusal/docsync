---
name: sdlc-verify
description: Phase 7 — generate and run the full verification suite (unit + integration tests, coverage) and quality-check the generated documentation output; writes docs/verification.md.
disable-model-invocation: true
---

# Phase 7 — Verify

## Precondition
`docs/code-review.md` must be `Approved`.

## 1. Verify the code
1. Build a requirement → test map: every FR/NFR acceptance criterion must have at least one test. Write any missing unit or
   integration tests (integration tests use recorded fixtures or a mock server; never real tokens).
2. Run the whole suite with coverage. Capture the exact command and its output.

## 2. Verify the output document
1. Run the tool end-to-end against a fixture or sample repository and save the generated document under `tests/output/`.
2. Delegate a content-quality check to the **doc-quality-checker** subagent: structure, completeness against the requirements,
   that `Not Found` is used instead of fabricated values, no secrets, valid Markdown and links, and that it is in sync with the source.

## 3. Write `docs/verification.md`
Sections: Summary (pass/fail), Test run (command + output), Coverage, Requirement → test traceability, Output quality check results,
Known limitations. Set `Status: Draft`.

## Gate
Everything passes, or the human accepts each failure as a Known limitation. Set `Approved`, commit `verify: test + output evidence`,
then suggest `/sdlc-pr`.
