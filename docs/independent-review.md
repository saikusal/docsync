# Independent Agent Review

> **Status:** Approved
> **Approved by:** saikusal on 2026-10-02 (explicit human approval of all dispositions; closes IDR-22)
> **Inputs:** docs/requirements.md, docs/architecture.md, src/, tests/, tests/output/express-app.README.md, README.md at release v0.1.1 (commit 74b00b5)

## Why this review exists
In the main delivery session, the reviewer subagents in `.claude/agents/` could not be launched, so the design review (Phase 3),
code review (Phase 6) and output check (Phase 7) were done by the authoring agent itself. That was recorded in each document as a
weakness. After the release, the three agents were run as **independent subagents** with fresh context. Each one formed its own
findings first and only then compared them with the earlier reviews.

| Agent | Definition | Scope | Result |
|-------|------------|-------|--------|
| design-reviewer | `.claude/agents/design-reviewer.md` | requirements.md, architecture.md, user story | 0 Blocker, 12 Major, 10 Minor. 1 mostly and 4 partly covered by the earlier review; the rest new |
| code-reviewer | `.claude/agents/code-reviewer.md` | src/, tests/, dependencies; ran tests, lint, typecheck, audit and the CLI on fixture copies | 0 Blocker, 2 Major, 16 Minor; all but 1 new |
| doc-quality-checker | `.claude/agents/doc-quality-checker.md` | the generated fixture README and this repository's README | Both documents **pass** all 7 checks; 17 facts checked and all correct; 3 low-severity notes |

The independent reviews found real defects that the authoring agent's reviews missed. The most serious was ICR-1: `--readme .env`
made docsync read a `.env` file, which breaks NFR-1. That is the value of an independent reviewer, and it confirms the weakness
that was recorded.

## How the findings were handled
Every Major code finding was **reproduced against the built CLI** before it was fixed. Every fix has a regression test in
`tests/unit/independent-review.test.ts`. **12 of those tests fail on the pre-fix code** (checked by stashing `src/`) and pass after
the fix; the other tests guard behaviour that must not change. After the fixes, the suite has 248 tests: 246 passed, and 2 are skipped
on Windows because creating symbolic links there needs extra privileges (both run on Linux CI).

## Code review findings (ICR)

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| ICR-1 | Major | `--readme .env` (or `"readme": ".env"` in config) read and rewrote the `.env` file, and a README symlinked outside the root was followed | **Fixed.** README paths that are `.env` files are rejected (exit 2), and the local README is read only when its real path is inside the root |
| ICR-2 | Major | A file Babel recovers from (`let y; let y;`) crashed the whole run with exit 3, breaking FR-22 | **Fixed.** Recovered parse errors count as parse failures, and env and route analysis catch errors per file. The file is skipped with a warning |
| ICR-3 | Minor | The GitHub job summary bypassed the redactor | **Fixed.** The summary goes through the same redactor as stdout and stderr |
| ICR-4 | Minor | A summary file that could not be written turned exit 1 (drift) into exit 3 | **Fixed.** A warning is shown and the drift exit code is kept |
| ICR-5 | Minor | `--readme src` gave "unexpected error: EISDIR" | **Fixed.** "README path "src" is a directory, not a file" (exit 2) |
| ICR-6 | Minor | A missing `--config` file exited 3; configuration errors are exit 2 | **Fixed** |
| ICR-7 | Minor | Two different path validators; `..notes.md` was wrongly rejected | **Fixed.** One shared `toSafeRelative` in `src/infra/paths.ts` |
| ICR-8 | Minor | Markers indented by 4+ spaces (a Markdown code block) were treated as live markers | **Fixed.** At most 3 spaces of indentation, as in CommonMark |
| ICR-9 | Minor | The project name ignored GitHub metadata, although FR-8 lists GitHub first | **Requirement clarified.** The name comes from `package.json` by design, so the local and remote output stay identical. FR-8 now says so |
| ICR-10 | Minor | The empty-repository check exists in two places | Accepted. `renderSections` keeps its guard for callers that use the pipeline directly |
| ICR-11 | Minor | BOM handling duplicated | **Partly fixed:** `--out` now uses `encodeReadme`. The remote strip remains (one line) |
| ICR-12 | Minor | The "missing file returns null" pattern is repeated | Deferred (cosmetic) |
| ICR-13 | Minor | The remote config is resolved through a callback and a getter | Deferred. It works and is tested by "honours the repository's own docsync.config.json" |
| ICR-14 | Minor | GitHub metadata was fetched even when `overview` was not requested | **Fixed.** Fetched on first use only |
| ICR-15 | Minor | Low `esbuild` advisory (dev only) | Already CR-8, waiver confirmed. The runtime audit is clean |
| ICR-16 | Minor | npm consumers get caret ranges, not the lockfile | Known limitation (same as IDR-18) |
| ICR-17 | Minor | docs-check did not wait for the tests, although FR-24 orders lint, then test, then check | **Fixed.** `needs: test` |
| ICR-18 | Minor | Untested branches | **Partly fixed:** ICR-1 to ICR-8 now have tests. The other rare I/O error branches are deferred |

## Design review findings (IDR)

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| IDR-1 | Major | Remote mode as written could not read the README, the config or `.gitignore` | **Already handled in the implementation** (T-8, T-15: `.gitignore` and config read first, README via `alsoRead`). Tested |
| IDR-2 | Major | `overview` depends on an ambient token and live GitHub data, so check can drift without a code change | **Known limitation, documented** (architecture §13, README §7). The docs-check job runs without a token. An opt-in setting is planned |
| IDR-3 | Major | Behaviour on a metadata failure in local mode was unspecified | **Decided differently from the recommendation:** warn and show `Not Found` (CR-2), so a stale token never breaks offline work. Tested |
| IDR-4 | Major | npm scripts and URLs may contain inline secrets that would be copied into the README | **Fixed.** Every rendered block passes through `maskInlineSecrets` (`NAME=value` for secret-like names, Bearer and Basic headers, `_authToken`, URL credentials, token shapes). Tested |
| IDR-5 | Major | Local symlinks could bypass the `.env` exclusion | **Already fixed** (CR-1: the walk skips symlinks and only listed files are read), and the README path too (ICR-1) |
| IDR-6 | Major | The empty-repository check ran after the README check, which conflicts with AC7 | **Already fixed** during T-15. All three commands report "repository is empty" (exit 3), including `init` |
| IDR-7 | Major | Missing error mappings: 409, unknown ref, 403 without rate-limit headers, timeouts | **Already handled:** 409 "is empty", ref (V-1), 403 "may lack read access", 30-second request timeout. Tested |
| IDR-8 | Major | Local mode scans the working tree, including untracked files | **Known limitation, documented** |
| IDR-9 | Major | A recursive readdir cannot prune `node_modules` | **Already handled:** the implementation walks one directory at a time and prunes. The architecture text has been corrected |
| IDR-10 | Major | Include/exclude matcher semantics unspecified | **Documented:** gitignore rules everywhere, root `.gitignore` only |
| IDR-11 | Major | License detection from file text could be guessing | Accepted. Only the standard opening lines of well-known license texts are matched; anything else is `Not Found`. Tested with a proprietary text |
| IDR-12 | Major | Remote mode skipped `package-lock.json` over 1 MB, so its output differed from local mode | **Fixed.** Manifests are exempt from the size cap. Tested |
| IDR-13 | Minor | Stale architecture text in §2, §7 and §13, and §5.4 vs FR-11 | **Fixed** (architecture revision 3, FR-11 clarified) |
| IDR-14 | Minor | The `.env.example` regex in C-7 had lost its backslashes | **Fixed.** The code was always correct and is tested |
| IDR-15 | Minor | Some inputs unvalidated (`--ref`, `--out`), and disabled-section blocks unspecified | Already partly handled: `--ref` without `--repo` is exit 2, and disabled-section blocks are left untouched. The rest is deferred |
| IDR-16 | Minor | `localeCompare` depends on ICU and Node.js version | **Fixed.** Sorting by UTF-16 code unit. Tested |
| IDR-17 | Minor | Invalid `package.json`, non-npm lockfiles | **Already handled:** a warning plus `Not Found`, and pnpm, yarn and bun are detected |
| IDR-18 | Major | npm consumers do not get pinned dependencies | **Known limitation, documented.** Exact pins or a shrinkwrap file are a candidate for the next version |
| IDR-19 | Minor | tsup maintenance status; Babel 8 migration later | Noted as technology risk; deferred |
| IDR-20 | Minor | Hidden globals (clock, TZ) | Mostly injected already (env, TTY, fetch, confirm). The clock is deferred |
| IDR-21 | Minor | Interplay of the throttling and retry plugins | **Already handled:** the primary rate limit fails fast (`onRateLimit` returns false), and a T-7 bug fix removed an extra retry |
| IDR-22 | Minor | Phase 3 to 7 approvals were delegated, and no human re-approved the changes after review | **Closed.** On 2026-10-02 saikusal reviewed this document and explicitly approved every disposition above, which also re-approves architecture revision 3 |

## Output document findings (IDQ)

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| IDQ-1 | Low | `init` appends new blocks at the end, after a trailing "License" heading | Accepted as designed (FR-6 forbids reordering). The README tells users they can move blocks |
| IDQ-2 | Low | FR-11 did not define "Required" for variables listed only in `.env.example` | **Fixed** in the requirements (`Not Found`, as implemented) |
| IDQ-3 | Low | The example markers in this README rely on code-fence detection | Already tested ("ignores markers inside fenced code"). ICR-8 also covers indented code |

## Result
All Major findings have been fixed in code (ICR-1, ICR-2, IDR-4, IDR-12), were already handled by the implementation (IDR-1, 5, 6, 7, 9),
or are documented known limitations (IDR-2, 8, 18). IDR-22 is closed: the human approved all dispositions on 2026-10-02.
