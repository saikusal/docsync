# Changelog

All notable changes to this project are documented here (Keep a Changelog format).

## [Unreleased]

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

[Unreleased]: https://github.com/saikusal/docsync/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/saikusal/docsync/releases/tag/v0.1.1
[0.1.0]: https://github.com/saikusal/docsync/releases/tag/v0.1.0
