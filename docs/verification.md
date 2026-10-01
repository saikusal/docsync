# Verification — Docs Sync (DOCS-101)

> **Status:** Approved
> **Approved by:** saikusal (delegated) on 2026-10-01
> **Inputs:** docs/requirements.md, docs/code-review.md (Approved), src/ and tests/ at the Phase 7 commit

## 1. Summary
**Pass.** Every acceptance criterion (AC1–AC9) and every FR/NFR is covered by at least one automated test or an explicit check
below. All CI steps pass locally on Windows with Node 24. The generated output document passes the 7-point quality check.
Verification found one more defect (V-1, an unhelpful message for an unknown `--ref`), which is fixed and has a regression test.

| Check | Result |
|-------|--------|
| Lint (`eslint` + `prettier --check`) | ✅ pass |
| Typecheck (`tsc --noEmit`, strict) | ✅ pass |
| Tests | ✅ **224 passed**, 1 skipped (symlink test needs privileges on Windows; runs on Linux CI) |
| Coverage | ✅ 95.3% lines · 84.2% branches · 96.9% functions · 94.0% statements |
| `npm audit --audit-level=high` | ✅ exit 0 (1 low advisory, waived in CR-8) |
| `docsync check` on this repo's README (dogfooding, FR-24) | ✅ exit 0, "README.md is in sync." |
| Real GitHub API smoke test (unauthenticated) | ✅ 4 of 4 scenarios behave as specified (§4) |
| Output document quality check | ✅ 7 of 7 checks pass (§5) |

## 2. Test run
Command: `npm run test:coverage` (Vitest 5.0.3, Node 24.19.0, Windows 11)

```
 Test Files  16 passed (16)
      Tests  224 passed | 1 skipped (225)
   Duration  15.58s
Statements   : 93.96% ( 1028/1094 )
Branches     : 84.18% ( 660/784 )
Functions    : 96.93% ( 253/261 )
Lines        : 95.29% ( 892/936 )
```

| Test file | Tests | Focus |
|-----------|------:|-------|
| tests/integration/acceptance.test.ts | 15 | AC1–AC8 end to end through the CLI; local/remote contract; secrets; BOM/CRLF; 500-file performance |
| tests/unit/cli.test.ts | 17 | Commands, options, exit codes, init confirmation, job summary, `--debug` |
| tests/unit/markers.test.ts | 23 | Marker parsing and errors, byte-for-byte replacement, EOL, BOM, init insertion |
| tests/unit/config.test.ts | 21 | Target and config validation, precedence |
| tests/unit/scope.test.ts | 21 | Scan scope, `.env` exclusion, `.env.example` names only |
| tests/unit/env.test.ts | 20 | Env access forms, the "required" rule, parse errors |
| tests/unit/sections-basic.test.ts | 19 | Overview, tech stack, setup, project structure, Not Found cases |
| tests/unit/localSource.test.ts | 18 | Listing, path safety, origin detection |
| tests/unit/routes.test.ts | 16 | Express routes, mounts across files, re-exports, cycles |
| tests/unit/githubSource.test.ts | 14 | Remote listing, blob reads, skip rules, quota, truncation, empty repo, unknown ref |
| tests/unit/githubClient.test.ts | 9 | Auth header, error mapping, retries, rate-limit message |
| tests/unit/infra.test.ts | 9 | Errors, redactor, logger, atomic write and Windows retry |
| tests/unit/report.test.ts | 9 | Pipeline determinism, drift detection, reports, summary cap |
| tests/unit/sections-code.test.ts | 8 | env-vars and api-endpoints sections, registry |
| tests/unit/review-regressions.test.ts | 5 | CR-1 … CR-5 (shown to fail on the pre-fix code) |
| tests/unit/version.test.ts | 1 | Version export |

## 3. Requirement → test traceability
| Requirement | Verified by |
|-------------|-------------|
| **AC1** sync updates the env-vars block only | acceptance › AC1; markers › replaceBlocks "byte for byte" |
| **AC2** idempotent | acceptance › AC2; markers › "is idempotent"; report › renderSections deterministic |
| **AC3** check detects a new route | acceptance › AC3 (exit 1, section + route named); routes › across files |
| **AC4** Not Found for license/engines | acceptance › AC4; sections-basic › overview / setup Not Found |
| **AC5** no secrets | acceptance › AC5 (three sentinels + token in README/stdout/stderr); scope › names only; env-vars › no fallback literal |
| **AC6** missing README / markers | cli › "fails without a README or markers"; markers › malformed |
| **AC7** empty repository | cli › init/sync/check exit 3; githubSource › 409 empty |
| **AC8** GitHub API failures | acceptance › AC8 (404, rate limit, network); githubClient › 401/5xx; githubSource › unknown ref |
| **AC9** CI usage | cli › job summary; `.github/workflows/ci.yml` docs-check job (runs `docsync check` on this repo; proven on the PR) |
| FR-1 CLI commands/options | cli › help, version, options, conflicts |
| FR-2 config file | config › precedence/validation; cli › bad config; acceptance › remote honours repo config |
| FR-3 input validation | config › `--repo`, sections, README path |
| FR-4 / FR-5 markers | markers (23 tests); review-regressions › CR-5 |
| FR-6 / FR-7 init and missing markers | cli › init (4 tests), sync/check without markers |
| FR-8 – FR-13 sections | sections-basic, sections-code |
| FR-14 determinism | report › renderSections; acceptance › AC2 |
| FR-15 sync (incl. `--out`, remote) | cli › `--out`; acceptance › remote contract; review-regressions › CR-4 |
| FR-16 check + job summary | cli › drift cycle and summary; report › cap |
| FR-17 remote mode | githubSource (14 tests); acceptance › remote end to end; §4 real API |
| FR-18 local metadata | localSource › metadata provider; review-regressions › CR-2 |
| FR-19 scan scope | scope (21 tests); localSource listing |
| FR-20 empty repo | cli › AC7; report › empty |
| FR-21 API errors | githubClient, githubSource, acceptance › AC8 |
| FR-22 unparseable files | sections-code › "skips unparseable files"; env › parse error |
| FR-23 `--debug` | cli › "hides stack traces unless --debug" |
| FR-24 CI workflow | `.github/workflows/ci.yml`; all its steps run locally (§1) |
| NFR-1 / NFR-2 secrets and token | acceptance › AC5 (sentinels, token under API errors); infra › redactor |
| NFR-3 read-only API | githubSource › "uses only GET"; acceptance › remote contract; code scan (code-review) |
| NFR-4 path safety | localSource › escaping paths; config › README path; review-regressions › CR-1 |
| NFR-5 performance | acceptance › 500 files: **1.6 s** (limit 10 s) |
| NFR-6 API economy | githubSource › blob count, quota pre-check |
| NFR-7 portability | CI matrix ubuntu/windows × Node 22/24; verified locally on Windows + Node 24 |
| NFR-8 atomic writes | infra › writeFileAtomic (+ Windows retry) |
| NFR-9 offline tests | all GitHub tests use a fake fetch; acceptance › "works with the network disabled" |
| NFR-10 extensibility | sections-code › registry |
| NFR-11 usability | cli › help lists all options; error message tests throughout |
| NFR-12 dependency safety | `npm audit --audit-level=high` exit 0 |

## 4. Real GitHub API smoke test
Run without a token against the public repository `saikusal/docsync` (whose `main` branch has no markers yet) using the built CLI:

| Scenario | Command | Result |
|----------|---------|--------|
| README without markers | `docsync check --repo saikusal/docsync` | exit 2, "README.md has no docsync markers; run `docsync init` …" ✅ |
| Repository doesn't exist | `docsync check --repo saikusal/does-not-exist-xyz-123` | exit 3, "… was not found, or the token has no access to it (404)" ✅ |
| Remote init to a file | `docsync init --repo saikusal/docsync --yes --out <tmp>` | exit 0, file has 6 marker blocks ✅ |
| Unknown ref | `docsync check --repo saikusal/docsync --ref no-such-branch-xyz` | First run: exit 3 "GitHub request … failed (422)", which isn't actionable → **V-1**. After the fix: "ref "no-such-branch-xyz" was not found in saikusal/docsync; check the branch, tag or commit name" ✅ |

**V-1 (Minor, FR-21):** GitHub answers 422 for an unknown ref; the generic mapper didn't recognise it. Fixed in `GitHubSource.create`
(404/422 on ref resolution → a message naming the ref), with regression tests for both statuses.

## 5. Output document quality check
The generated document for the fixture repository is committed as evidence:
[tests/output/express-app.README.md](../tests/output/express-app.README.md) (input: `tests/fixtures/express-app` plus a `.env` containing a sentinel value).
The independent `doc-quality-checker` subagent couldn't be launched in this session, so its checklist was applied by the main agent:

| Check | Result | Evidence |
|-------|--------|----------|
| 1. Structure | ✅ Pass | All 6 managed sections are present; hand-written intro and "License" sections are unchanged; each block sits under its heading. |
| 2. Accuracy (spot-check of 6 facts against the source) | ✅ Pass | `DATABASE_URL` required (guard `if (!process.env.DATABASE_URL) throw`); `PORT` optional (`Number(process.env.PORT) \|\| 3000`); `API_KEY` optional (`?? 'sk-live-…'`); `GET /api/orders/:id` (router mounted at `/api` *after* `requireAuth` middleware); script `build` = `tsc -p .`; `pg` `^8.13.0` runtime dependency. All match the fixture code. |
| 3. No fabrication | ✅ Pass | `Not Found` appears exactly where the fact is absent: license (no LICENSE file, no `license` field), default branch/topics/release (no GitHub access), `LOG_LEVEL` usage (only in `.env.example`). No invented descriptions. |
| 4. No secrets | ✅ Pass | `grep` for `SENTINEL`, `sk-live`, `postgres://`: 0 matches. Only variable names appear. |
| 5. Markdown validity | ✅ Pass | Every table row has a consistent column count (2-column tables: 14 rows, 3-column: 22 rows); code fence closed; inline code backticks balanced; pipes inside cells escaped. |
| 6. In sync | ✅ Pass | `docsync check` on the fixture with this document: exit 0, "README.md is in sync." |
| 7. Readability | ✅ Pass | Short tables, sorted rows, runtime dependencies before dev ones, commands shown as copy-pastable code. |

## 6. Manual checks
| Check | Result |
|-------|--------|
| `docsync --help` / `sync --help` list every command and option | ✅ |
| End-to-end on a fresh Express app (init → check exit 1 → sync → sync "no changes" → check exit 0 → new route → check exit 1 with diff) | ✅ |
| `init` without `--yes` in a non-interactive shell exits 2 instead of hanging | ✅ |
| Interactive `[y/N]` prompt on a real terminal (CR-9) | ⚠️ Not run: the tool sandbox has no TTY. The prompt logic is tested through an injected `confirm`; the thin `readline` wrapper is not. |
| GitHub Actions workflow on GitHub's runners | ⏳ Proven on the Phase 8 pull request (every step passes locally) |

## 7. Known limitations (for the PR)
- Express is the only framework whose routes are detected; routes created in loops or helpers, `process.env[computed]` and aliased `process.env` aren't seen (DR-10, DR-15).
- Monorepos: only the root `package.json`; `package-lock.json` v1 shows declared ranges (DR-11).
- GitHub-only overview fields depend on `GITHUB_TOKEN`; `sync` and `check` must run in the same mode (docs-check in CI runs without a token on purpose).
- Remote mode needs about one API request per source file; very large repositories must be checked out locally (DR-4, DR-5).
- `npm audit`: 1 low advisory in dev-only `esbuild` (CR-8, waived). macOS isn't in the CI matrix (DD-17, deferred).
