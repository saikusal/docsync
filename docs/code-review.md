# Code Review — Docs Sync (DOCS-101)

> **Status:** Approved
> **Approved by:** saikusal (delegated) on 2026-10-01
> **Inputs:** src/, tests/, package.json, package-lock.json at commit be0aa90; docs/requirements.md; docs/architecture.md (rev 2)

## Method
The review was planned for the independent `code-reviewer` subagent (`.claude/agents/code-reviewer.md`). Subagent launches were
blocked in this session, so the main agent ran the review itself against the capstone checklist. To make up for the lack of
independence, every suspected defect was **reproduced before it was accepted** (by running the built CLI or a test), and every fix has
a regression test that was shown to **fail on the pre-fix code** (`git stash` of `src/`, 4 of 4 failed) and pass afterwards.

Automated checks run as part of the review: a scan for `console.*`, `any` casts, `eval`/`child_process`, `process.exit`, and non-GET GitHub calls
(none found); `npm audit`; the test suite with coverage.

## Checklist verdicts

| Area | Question | Verdict | Notes |
|------|----------|---------|-------|
| Correctness | Does each component behave as specified in requirements.md? | **Pass after fixes** | CR-3 (array mount paths) and CR-4 (`--out` without changes) were wrong; fixed. AC1–AC8 are covered by `tests/integration/acceptance.test.ts`. |
| Security | Are secrets excluded from output? Is user input validated? | **Pass after fix** | `.env*` is never listed; `.env.example` is parsed for names only; code fallback literals never reach the facts; the token comes from the environment only and is redacted from all output; `--repo`, `--readme`, config and paths are validated. CR-1: `LocalSource.readFile` accepted unlisted paths (e.g. symlinks outside the root); fixed. |
| Error handling | Are API failures, missing files and empty repos handled gracefully? | **Pass after fix** | 401/403/404/409/429/5xx/network all map to specific messages; empty repo → exit 3; missing README/markers → exit 2 with a hint. CR-2: an optional metadata lookup could abort local mode; it now degrades to a warning. |
| Test coverage | Do tests cover the happy path AND the Not Found / missing-field cases? | **Pass** | 223 tests; 95% of lines and 84% of branches covered. Not Found is tested for license, engines, package.json, empty lists, env vars only in `.env.example`, dynamic routes and unknown folders. Gap: the interactive `[y/N]` prompt on a real TTY (CR-9). |
| Code clarity | Are function names self-explanatory? Is logic easy to follow without comments? | **Pass** | Small modules, one responsibility each; comments explain *why* (DR/CR references), not *what*. CR-10 noted. |
| DRY | Is there duplicated logic to refactor into a shared function? | **Pass after fixes** | CR-6: static-string helpers duplicated in env.ts and routes.ts → `src/analysis/ast.ts`. CR-7: license file names duplicated → `LICENSE_FILES` in scope.ts. |
| Dependency safety | Are any package versions known to be vulnerable? | **Pass (1 waived)** | `npm audit`: 0 critical, 0 high, 0 moderate, **1 low** (CR-8). All runtime dependencies are current majors, pinned by the lockfile. |

## Findings

| ID | Severity | Area | Location | Finding | Fix | Status |
|----|----------|------|----------|---------|-----|--------|
| CR-1 | Major | Security (NFR-4) | `src/sources/local.ts` `readFile` | Any path allowed by the scope rules could be read, even when it isn't in the listing. The walk skips symlinks, but `readFile('package.json')` would still follow a symlinked `package.json` to a file outside the repository. | Serve only files present in the listing (cached `Set`). | Fixed · regression test (runs on Linux CI; skipped on Windows without symlink privilege) |
| CR-2 | Major | Error handling (FR-18) | `src/commands/target.ts` | In local mode with `GITHUB_TOKEN` set, a failing metadata lookup (bad token, private repo without access, network) aborted `sync`/`check` with exit 3, although the metadata is optional. Reproduced with a fake token: `exit 3`. | Wrap the provider: warn once and fall back to `Not Found` for GitHub-only fields. | Fixed · regression test |
| CR-3 | Minor | Correctness (FR-12) | `src/analysis/routes.ts` mount collection | `app.use(['/a','/b'], router)` was treated as having no prefix, so routes showed `/x` instead of `/a/x` and `/b/x`. Reproduced with the built CLI. | Array prefixes create one mount per element; a non-static element becomes `Not Found (dynamic)`. | Fixed · regression test |
| CR-4 | Minor | Correctness (FR-15) | `src/commands/commands.ts` `syncCommand` | `sync --out file` wrote nothing when the README was already up to date, so scripts that read the file failed. Reproduced. | Always write to `--out` (and stdout in remote mode). | Fixed · regression test |
| CR-5 | Minor | Usability (FR-5) | `src/markers/markers.ts` `insertMissingBlocks` | `init` reported malformed markers as `README:<line>` regardless of the actual file (`--readme docs/INDEX.md`). | Pass the README path through. | Fixed · regression test |
| CR-6 | Minor | DRY | `src/analysis/env.ts`, `routes.ts` | Two near-identical "static string from AST node" helpers. | Shared `staticString` / `staticKey` in `src/analysis/ast.ts`. | Fixed (covered by existing analyser tests) |
| CR-7 | Minor | DRY | `src/scope/scope.ts`, `src/sections/overview.ts` | The license file-name list was defined twice and could drift apart. | Single exported `LICENSE_FILES`. | Fixed |
| CR-8 | Minor | Dependency safety | `esbuild` 0.27.x (dev, via tsup/vite) | GHSA-g7r4-m6w7-qqqr (low): arbitrary file read through esbuild's **development server** on Windows. docsync never runs that server; esbuild is build-time only and not in the published package. No fixed version is reachable within tsup 8 / vitest 5. | — | **Waived** (NFR-12 threshold is high/critical); recheck when tsup/vitest bump esbuild |
| CR-9 | Minor | Test coverage | `src/cli/run.ts` `askOnStdin` | The real-TTY confirmation prompt isn't exercised (the logic around it is, via an injected `confirm`). | — | Accepted: thin wrapper over `readline`; covered manually in verification |
| CR-10 | Minor | Clarity | `src/sections/index.ts` | The registry needs a `Section<never>` cast because each section has its own facts type. | — | No change: documented inline; the alternative (an existential type helper) would be harder to read |

## Outcome
- Blocker: none. Major: 2, both fixed. Minor: 8, of which 5 were fixed, 1 waived (CR-8) and 2 accepted (CR-9, CR-10).
- After the fixes: lint, typecheck and **223 tests** pass (1 skipped on Windows only); `README.md` is still in sync (`docsync check` → exit 0).
