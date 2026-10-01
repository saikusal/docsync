# Changelog

All notable changes to this project are documented here (Keep a Changelog format).

## [Unreleased]

## [0.1.2] - 2026-10-01

Fixes from the independent agent review (docs/independent-review.md).

### Security
- `--readme` (or config `readme`) can no longer point at a `.env` file, and a README that resolves outside the repository root is refused (ICR-1).
- Inline secrets in npm scripts and URLs (`API_KEY=...`, Bearer and Basic headers, `_authToken`, `user:password@`) are masked in every generated section (IDR-4).
- The GitHub job summary is redacted like all other output (ICR-3).

### Fixed
- One invalid source file (e.g. a duplicate declaration) no longer aborts the run; it is skipped with a warning (ICR-2, FR-22).
- A job summary that cannot be written no longer hides the drift exit code (ICR-4).
- Clear usage errors for a README path that is a directory and for a missing `--config` file, which now exits 2 (ICR-5, ICR-6).
- File names starting with two dots are accepted as README paths (ICR-7).
- Markers indented by four or more spaces (Markdown code) are ignored (ICR-8).
- Remote mode always reads manifests such as a large `package-lock.json`, so its output matches local mode (IDR-12).
- Sorting no longer depends on the locale or Node.js version (IDR-16).
- GitHub metadata is fetched only when the overview section needs it (ICR-14).
- CI: docs-check runs after the tests (ICR-17).

### Documentation
- Independent review and capstone report added; architecture revision 3; FR-8 and FR-11 clarified.

## [0.1.1] - 2026-10-01

### Changed
- Published to npm as `@saikusal/docsync` (the name `docsync` is too close to the existing `doc-sync` package).
  The command is still `docsync`.
- README install instructions use the npm package: `npx @saikusal/docsync`, `npm install --global @saikusal/docsync`,
  or `npm install --save-dev @saikusal/docsync`.
- `npm publish` runs lint, typecheck and the full test suite first (`prepublishOnly`).

## [0.1.0] - 2026-10-01

### Added
- `docsync` CLI (Node.js >= 22.12, TypeScript) with three commands (DOCS-101):
  - `init`: adds section markers to the README, or creates one; asks first, `--yes` for scripts.
  - `sync`: rewrites only the marked sections from facts in the code; idempotent and byte-for-byte safe outside the markers (BOM, CRLF).
  - `check`: writes nothing; prints a diff per stale section, exit code 1 on drift, and a GitHub Actions job summary.
- Six generated sections: `overview`, `tech-stack`, `setup`, `env-vars` (with a "required" flag), `api-endpoints` (Express, including
  mount prefixes across files) and `project-structure`. Anything that can't be determined is written as `Not Found`.
- Local mode (`--path`) and remote mode (`--repo owner/repo --ref …`) through the GitHub REST API, read-only, pinned to one commit SHA,
  with a rate-limit pre-check and specific error messages for 401/403/404/409/422/429/5xx and network failures.
- Optional `docsync.config.json` (README path, sections, include/exclude); CLI flags take precedence.
- Secret safety: `.env` files are never listed or read, `.env.example` is parsed for names only, and `GITHUB_TOKEN` is read only from
  the environment and masked in all output.
- CI workflow: lint, typecheck, tests with coverage and `npm audit` on Ubuntu and Windows with Node 22 and 24, plus a `docs-check`
  job that runs `docsync check` on this repository's own README.
- Agentic SDLC artifacts in `docs/` (requirements, architecture, design review, implementation plan, code review, verification).

### Changed
- README rewritten as full user documentation: the problem, usage in other projects, configuration, why GitHub Actions, other CI
  systems and git hooks, architecture, technical details, security model, limitations and roadmap.
- CI jobs have time limits (15 minutes for tests, 10 for docs-check), so a hung runner fails instead of running for hours.
- The pipeline status hook reports "Pipeline complete" once all artifacts are approved and the work is on main.

### Fixed
- Claude Code pipeline hooks renamed to `.cjs` so they run in a `"type": "module"` package (V-2).

[Unreleased]: https://github.com/saikusal/docsync/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/saikusal/docsync/releases/tag/v0.1.2
[0.1.1]: https://github.com/saikusal/docsync/releases/tag/v0.1.1
[0.1.0]: https://github.com/saikusal/docsync/releases/tag/v0.1.0
