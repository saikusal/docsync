# DOCS-101 — Docs Sync: keep a repository's README in sync with its code

**Epic:** Developer Experience: Self-maintaining documentation
**Type:** User Story  |  **Priority:** High  |  **Reporter:** Engineering Productivity team

## Problem
README files go stale almost as soon as they're written. A developer adds an environment variable, renames an npm script,
adds an API route or upgrades a framework, and the README still describes last quarter's project. New joiners follow the
wrong setup steps, reviewers can't tell from a PR that the docs are now wrong, and nobody owns fixing it.

Most of the facts a README states are already in the code: `package.json`, `.env.example`, `process.env.X` references,
route definitions, the license file and GitHub metadata. They're just never copied over automatically.

## User story
> **As a** developer maintaining a GitHub repository,
> **I want** a tool that extracts the facts about my project from its source code and GitHub metadata and keeps the matching README sections up to date,
> **so that** my documentation is always accurate without manual effort, and stale docs are caught in CI before they're merged.

## Personas
- **Maintainer (primary):** runs the tool locally or in CI and wants accurate docs with no busywork.
- **New contributor:** reads the README to set up the project and needs the setup steps and environment variables to be correct.
- **PR reviewer:** wants a clear signal when a code change has made the docs out of date.

## How it should work
1. The maintainer adds **marker comments** to the README around the sections the tool owns, e.g.
   `<!-- docsync:start env-vars -->` … `<!-- docsync:end env-vars -->`.
   Anything outside the markers is human-written and is **never touched**.
2. The tool reads the repository, from a local path or from GitHub using `owner/repo`, and extracts:

   | Section | Source of truth |
   |---|---|
   | `overview` | Repo name, description, topics, license, default branch, latest release (GitHub API / `package.json`) |
   | `tech-stack` | Runtime and key dependencies with versions (`package.json`, lockfile) |
   | `setup` | Prerequisites (`engines`), install command, and the available npm scripts with what each does |
   | `env-vars` | Every environment variable the code uses (`.env.example` + `process.env.*` references): **name, where it's used, whether it's required** — never the value |
   | `api-endpoints` | HTTP routes declared in the code (e.g. Express `app.get('/x')`, `router.post(...)`): method, path, source file |
   | `project-structure` | Top-level folders and what they're for |

3. **Sync mode** (`docsync sync`) rewrites only the content inside the markers. If nothing changed, it changes nothing
   (running it again gives the same result).
4. **Check mode** (`docsync check`) changes nothing. It prints a drift report of which sections are stale and what differs,
   and **exits non-zero when the docs have drifted**, so it can fail a CI job.
5. When a fact can't be determined, the tool writes **`Not Found`** and never guesses.

## Acceptance criteria
- **AC1, sync:** *Given* a README with an `env-vars` marker block and code that uses `DATABASE_URL` and `JWT_SECRET`, *when* I run `docsync sync`, *then* the block lists both variables with the file where each is used, and nothing outside the markers changes.
- **AC2, idempotent:** *Given* an in-sync README, *when* I run `docsync sync` twice, *then* the second run reports "no changes" and the file is byte-identical.
- **AC3, drift check:** *Given* code that adds a new route `POST /api/orders` that the README doesn't list, *when* I run `docsync check`, *then* it exits with code 1 and the report names the `api-endpoints` section and the missing route.
- **AC4, Not Found:** *Given* a repo with no license and no `engines` field, *when* I sync, *then* the license and prerequisites show `Not Found`.
- **AC5, no secrets:** *Given* a `.env` file containing real values, *when* I sync or check, *then* no value from it appears in the README, the report or the logs. Only variable names do.
- **AC6, missing README / markers:** *Given* no README, or a README without markers, *when* I run sync, *then* the tool explains clearly how to add markers and exits non-zero, without creating or overwriting anything unless asked to.
- **AC7, empty repo:** *Given* an empty repository, *when* I run either command, *then* it exits cleanly with a clear "repository is empty" message.
- **AC8, GitHub API failures:** *Given* an invalid token, a missing repo, a hit rate limit or a network error, *when* I run against `owner/repo`, *then* I get a specific, actionable error (e.g. "rate limit resets at 14:32"), no stack trace, and the token is never printed.
- **AC9, CI usage:** *Given* the repository's CI workflow, *when* a PR changes code but not the docs, *then* the docs check fails with the drift report in the job log.

## Non-functional expectations
- **Security:** the token is read only from the `GITHUB_TOKEN` environment variable and needs read-only access; values are never written anywhere.
- **Performance:** a repo with about 500 files syncs in under 10 seconds locally.
- **Portability:** runs on Windows, macOS and Linux with Node 18+.
- **Testability:** all GitHub calls can be mocked; the core logic is tested without network access.
- **Maintainability:** each section's extractor is a pluggable module, so a new section is one new file.

## Out of scope (for this story)
- Writing prose with an LLM. Everything comes from the source code and metadata.
- Languages other than JavaScript/TypeScript for route and env-var detection.
- Docs sites (Docusaurus, Wiki) and files other than `README.md`.
- Opening PRs automatically with the updated docs (possible follow-up story DOCS-102).

## Open questions for refinement
1. Should `check` also run on a schedule, or only on PRs?
2. When the README has no markers, should there be an `init` command that adds them?
3. Should `env-vars` treat a variable as "required" when it has no default in the code, or only when it's marked in `.env.example`?
4. Should detected routes include middleware and auth requirements, or just method and path?
5. Should the drift report also be posted as a PR comment, or stay in the CI log only?
6. Does a monorepo (several `package.json` files) need to be supported now?

## Definition of Done
All acceptance criteria are covered by automated tests, the tool runs in this repo's own CI on its own README,
the docs/ SDLC artifacts are approved, and the PR has been merged.
