# Design Review — Docs Sync (DOCS-101)

> **Status:** Approved
> **Approved by:** saikusal (delegated) on 2026-10-01
> **Inputs:** docs/requirements.md, docs/architecture.md (version of 2026-10-01, commit 0e4f08e)

## Method
The review was planned to run in the independent `design-reviewer` subagent (`.claude/agents/design-reviewer.md`). The subagent launch
was blocked in this session, so the human chose to have the main agent run the review itself, using the subagent's checklist:
coverage, security, failure modes, simplicity, testability, operability and technology risk. Every AC (AC1–AC9) and every FR/NFR was
checked against the architecture, and every finding was traced to a section or component ID.

## Findings
| ID | Severity | Area | Finding | Recommendation |
|----|----------|------|---------|----------------|
| DR-1 | **Blocker** | Correctness (FR-11) | §5.4 treats `process.env.X` in the *test of a conditional* as "has a fallback". The most common guard is `if (!process.env.X) throw new Error(...)`, which is the strongest sign that X **is** required, so the rule would report it as Required = No. | Only `\|\|`, `??`, `\|\|=`/`??=` and destructuring defaults count as fallbacks. Conditional tests, `if` guards and function arguments don't change the result. |
| DR-2 | **Blocker** | Security (NFR-1, AC5) | `.env.example` is parsed, but the design doesn't say how. Teams often commit real values to it by mistake. Fallback literals in code (`process.env.KEY \|\| 'sk-live-…'`) are another route for values to leak, and so are parser warnings that might quote source lines. | `.env.example` is parsed **for key names only** (`^\s*(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=`); the value part is discarded unread. Renderers never output literal values taken from code. Parse warnings contain only file, line, column and the parser's message, never a code frame. A test with a sentinel value in `.env.example` and in a code fallback is required. |
| DR-3 | Major | Remote (C-5, NFR-6) | The Contents API returns content only for files up to 1 MB, and each call resolves `ref` separately, so a push mid-run could mix two commits. Symlinks (mode `120000`) and submodules (`type: commit`) in the tree aren't handled. | Resolve `ref` to a **commit SHA** once. Read files with `GET /git/blobs/{sha}` using the SHAs from the tree (consistent and up to 100 MB). Skip in-scope files over 1 MB (generated or minified) with a warning. Skip symlinks and submodules. |
| DR-4 | Major | Remote (C-5, FR-21) | Anonymous mode (60 requests/hour) fails part-way through on repos with more than about 55 source files, which wastes the quota and gives a confusing error. | After the tree call, compare *requests needed* with `x-ratelimit-remaining`. If there aren't enough, fail fast (exit 3) with the number needed and a suggestion to set `GITHUB_TOKEN`. |
| DR-5 | Major | Correctness (C-5) | A truncated tree is only a warning, so `check` could report false drift, or worse, a false "in sync". | A truncated tree is an **error** (exit 3): "repository too large for remote mode; run against a local clone". |
| DR-6 | Major | Correctness (C-10, FR-4) | The marker engine doesn't mention a UTF-8 **BOM** or mixed line endings. Writing back without the BOM, or with a different EOL, breaks byte-for-byte preservation (AC1). | Read the README as bytes and keep the BOM if present. The EOL for each block is the EOL of its own start-marker line, which handles mixed files. Add a golden test with BOM + CRLF. |
| DR-7 | Major | Portability (NFR-8) | On Windows, `rename` over a file that an editor or antivirus has open fails with `EPERM`/`EBUSY`. | Retry the rename up to 5 times with back-off (50 ms → 800 ms). Then fail with exit 3 and a clear message, and remove the temporary file. Never fall back to a non-atomic write. |
| DR-8 | Major | Operability (C-15, FR-24) | The `docs-check` CI job runs on this repo's own README, which currently has **no markers**, so CI would fail with exit 2 from day one. This repo also has no Express routes. | Add a task to run `docsync init` on this repo's README, followed by `sync`, before the CI job is enabled. Commit the result. |
| DR-9 | Major | Requirements gap (FR-8–13) | It isn't specified what a section renders when a list is **empty** (no routes, no env vars, no dependencies). | An empty list renders a single `Not Found` line, the same rule as for missing facts (one consistent convention). |
| DR-10 | Minor | Correctness (FR-11) | Dynamic keys `process.env[name]` and the `import.meta.env` / `Deno.env` forms aren't covered. | Dynamic keys are skipped with a debug-level note. `import.meta.env` is out of scope for v1 and listed as a Known Limitation. |
| DR-11 | Minor | Correctness (FR-9) | Lockfile formats differ: v1 uses `dependencies`; v2/v3 use `packages["node_modules/x"]`. | Support lockfile v2/v3. For v1 (or a missing or invalid lockfile), fall back to the declared ranges and a warning. |
| DR-12 | Minor | Usability (FR-6) | `init` without `--yes` in a non-interactive shell (CI) would hang waiting for confirmation. | When stdin isn't a TTY and `--yes` is absent, exit 2 with "re-run with --yes". |
| DR-13 | Minor | Operability (FR-16) | `$GITHUB_STEP_SUMMARY` has a 1 MiB limit; a large diff would be cut off by GitHub. | Cap the summary at 900 KiB and append "… report truncated, see the job log". |
| DR-14 | Minor | Simplicity (§6) | `fast-glob` is unnecessary: Node ≥ 20 has `fs.readdir(dir, { recursive: true })`, and `ignore` already handles the patterns. | Drop `fast-glob`; walk the directory recursively with `fs` and filter with C-7. One less dependency. |
| DR-15 | Minor | Simplicity (§5.3) | Cross-file route resolution is justified (AC3 needs mounted routers), but re-export chains and barrel files make it more complicated. | v1 supports direct default and named exports and `require` of router modules. Re-export chains (`export { r } from`) are resolved one hop only; deeper chains get a warning and the routes are listed unprefixed. |
| DR-16 | Minor | Testability (§11) | There is no test proving that LocalSource and GitHubSource produce **identical** output for the same repo. | Add a contract test: render the same fixture through both sources (GitHub via the fake fetch) and assert byte-equal output. |
| DR-17 | Minor | Operability (C-15) | The CI matrix leaves macOS out. | Optional; it isn't required by NFR-7 (which says "macOS optional"). |

## Design decisions
| ID | Finding | Decision | Rationale |
|----|---------|----------|-----------|
| DD-1 | DR-1 | **Accept** | It's a correctness bug in the most common pattern. |
| DD-2 | DR-2 | **Accept** | Secrets are a hard constraint (NFR-1); "names only" parsing makes leaks impossible by construction. |
| DD-3 | DR-3 | **Accept** | Blob reads by SHA are consistent and cost the same number of requests. |
| DD-4 | DR-4 | **Accept** | Failing fast saves quota and gives a clear message. |
| DD-5 | DR-5 | **Accept** | A false "in sync" is worse than an error. |
| DD-6 | DR-6 | **Accept** | Required for AC1 on Windows-authored READMEs. |
| DD-7 | DR-7 | **Accept** | Common on Windows. |
| DD-8 | DR-8 | **Accept** | Becomes task(s) in the implementation plan. |
| DD-9 | DR-9 | **Accept** | One convention is simpler for readers and for the code. |
| DD-10 | DR-10 | **Accept** | Documented as a Known Limitation. |
| DD-11 | DR-11 | **Accept** | |
| DD-12 | DR-12 | **Accept** | |
| DD-13 | DR-13 | **Accept** | |
| DD-14 | DR-14 | **Accept** | Fewer dependencies (NFR-12). |
| DD-15 | DR-15 | **Accept** | Keeps v1 manageable. |
| DD-16 | DR-16 | **Accept** | Also partly covers NFR-9. |
| DD-17 | DR-17 | **Defer** | Not required; can be added after the first green CI run. |

## Outcome
- **No Blockers remain open:** DR-1 and DR-2 are resolved in the architecture.
- `docs/architecture.md` has been updated for DR-1 to DR-16 (see its Revision history) and re-approved (delegated).
- Remaining risks carried into planning: static route analysis can't see routes registered in loops or factory helpers (Known Limitation).

## Verdict
The architecture is sound and proportionate: one package, pure core, I/O behind interfaces. It needed sharpening in three places.
First, the env-var "required" rule was wrong for the most common guard pattern. Second, secret handling relied on file exclusion
alone, without defining how `.env.example` and code literals are treated. Third, remote mode had consistency and quota gaps
(per-file ref resolution, the 1 MB limit, truncation as a warning). With DD-1 to DD-16 applied, nothing blocks implementation planning.
