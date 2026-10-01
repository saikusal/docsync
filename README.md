# docsync

**Keep your README in sync with your code, automatically.**

READMEs go stale almost as soon as they're written: someone adds an environment variable, renames an npm script or adds an
API route, and the docs still describe last quarter's project. `docsync` reads the facts straight from your JavaScript or
TypeScript code (`package.json`, `.env.example`, `process.env.*` references, Express routes, GitHub metadata) and keeps the
matching README sections up to date. In CI, `docsync check` fails the build when a change makes the docs wrong.

- **Never touches your own writing.** Only the content between `docsync` markers is managed.
- **Never guesses.** Anything it can't determine is written as `Not Found`.
- **Never leaks secrets.** `.env` files are never opened; only variable *names* are documented.
- **No LLM, no database, no server.** It's a deterministic CLI: the same code always produces the same README.

## Quick start

```sh
# 1. Add the section markers to your README (shows what it will add, then asks)
npx github:saikusal/docsync init

# 2. Fill them in from your code
npx github:saikusal/docsync sync

# 3. In CI: fail when the README is out of date
npx github:saikusal/docsync check
```

Or install it from source:

```sh
git clone https://github.com/saikusal/docsync.git
cd docsync
npm ci
npm link        # makes the `docsync` command available everywhere
```

## How it works

You mark the parts of your README that docsync owns:

```md
## Environment variables

<!-- docsync:start env-vars -->
<!-- docsync:end env-vars -->
```

`docsync sync` replaces only what is between the markers; everything else in the file stays byte for byte the same,
including line endings and a BOM if there is one. `docsync init` adds the markers for you.

### Sections

| Section | What it documents | Source of truth |
| --- | --- | --- |
| `overview` | Name, description, version, license, default branch, topics, latest release | GitHub API (if available) → `package.json` → `LICENSE` |
| `tech-stack` | Node.js version, language, dependencies with versions | `package.json`, `package-lock.json` |
| `setup` | Prerequisites, install command, every npm script | `package.json`, lockfile type |
| `env-vars` | Every environment variable: whether it's required and where it's used | `process.env.*` in your code, `.env.example` (names only) |
| `api-endpoints` | Express routes, including prefixes from mounted routers | `app.get(…)`, `router.post(…)`, `app.use('/api', router)` |
| `project-structure` | Top-level folders and their purpose | File tree |

An environment variable is **required** when at least one use has no fallback. `process.env.PORT || 3000` and
`const { PORT = '3000' } = process.env` are optional; `process.env.DATABASE_URL` or `if (!process.env.API_KEY) throw …` are required.

### Commands

| Command | What it does |
| --- | --- |
| `docsync init` | Adds markers for missing sections (or creates a README). Needs `--yes` when not run interactively. |
| `docsync sync` | Rewrites the stale sections. With `--repo`, prints the updated README (or writes `--out`), and never writes to GitHub. |
| `docsync check` | Changes nothing; prints a diff of every stale section. Exit code 1 means the docs have drifted. |

Common options: `--path <dir>` (default `.`) or `--repo <owner/repo>` with `--ref <branch|tag|sha>`, `--readme <file>`,
`--sections <list>`, `--config <file>`, `--debug`. Run `docsync <command> --help` for details.

**Exit codes:** `0` ok · `1` README out of date · `2` usage, config or marker problem · `3` repository or GitHub problem.

### Configuration (optional)

`docsync.config.json` in the repository root:

```json
{
  "readme": "README.md",
  "sections": ["overview", "setup", "env-vars", "api-endpoints"],
  "include": ["src/**"],
  "exclude": ["scripts/legacy/"]
}
```

CLI flags take precedence over the file. Test files, `node_modules`, build output and anything in `.gitignore` are never scanned.

### Use in GitHub Actions

```yaml
name: docs
on: pull_request
permissions:
  contents: read
jobs:
  docs-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx --yes github:saikusal/docsync check
```

On drift the job fails, and the diff appears in the log and in the job summary.

### GitHub token

Nothing is required for local use. Set `GITHUB_TOKEN` (read-only, `contents:read`) to read private repositories with `--repo`,
to get a higher API rate limit, and to include GitHub-only facts (description, topics, latest release) in local mode. The token
is read only from the environment and masked in all output. Keep `sync` and `check` in the same mode (with or without a token),
or the GitHub-only fields will differ.

## Known limitations (v0.1)

- JavaScript/TypeScript only; routes are detected for **Express** only (Fastify, Next.js and Koa are planned).
- Routes registered in loops or through helper functions, and `process.env[name]` with a computed name, can't be seen statically.
  Environment variables read through an alias (`const env = process.env; env.X`) aren't detected.
- Monorepos: only the root `package.json` is used. `package-lock.json` v1 shows declared ranges instead of resolved versions.
- Remote mode needs roughly one API request per source file; very large repositories should be checked out locally.

## About this project

docsync was built end to end as an **agentic SDLC capstone** with Claude Code, from user story to pull request, with a human
approval gate at every phase. Each phase left an artifact you can read:

| Phase | Artifact |
| --- | --- |
| User story | [user-story/DOCS-101-docs-sync.md](user-story/DOCS-101-docs-sync.md) |
| Requirements | [docs/requirements.md](docs/requirements.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Design review | [docs/design-review.md](docs/design-review.md) |
| Implementation plan | [docs/impl-plan.md](docs/impl-plan.md) |
| Code review | [docs/code-review.md](docs/code-review.md) |
| Verification | [docs/verification.md](docs/verification.md) |

The pipeline itself (skills, subagents and hooks) lives in [`.claude/`](.claude) and is described in [CLAUDE.md](CLAUDE.md).

## Project facts

*The sections below are generated by docsync from this repository, and checked in CI.*

## Overview

<!-- docsync:start overview -->
| Field | Value |
| --- | --- |
| Name | `docsync` |
| Description | Keeps a repository's README in sync with its code: env vars, API routes, setup, tech stack and more. |
| Version | `0.1.0` |
| License | MIT |
| Default branch | Not Found |
| Topics | Not Found |
| Latest release | Not Found |
<!-- docsync:end overview -->

## Tech stack

<!-- docsync:start tech-stack -->
- **Runtime:** Node.js `>=22.12`
- **Language:** TypeScript

| Package | Version | Type |
| --- | --- | --- |
| `@babel/parser` | `7.29.9` | runtime |
| `@babel/traverse` | `7.29.8` | runtime |
| `@babel/types` | `7.29.8` | runtime |
| `@octokit/plugin-retry` | `8.1.1` | runtime |
| `@octokit/plugin-throttling` | `11.0.5` | runtime |
| `@octokit/rest` | `22.0.1` | runtime |
| `commander` | `15.0.0` | runtime |
| `diff` | `9.0.0` | runtime |
| `ignore` | `7.0.11` | runtime |
| `zod` | `4.6.5` | runtime |
| `@types/babel__traverse` | `7.28.0` | dev |
| `@types/node` | `22.20.4` | dev |
| `@vitest/coverage-v8` | `5.0.3` | dev |
| `eslint` | `10.11.0` | dev |
| `prettier` | `3.9.9` | dev |
| `tsup` | `8.5.1` | dev |
| `typescript` | `6.0.3` | dev |
| `typescript-eslint` | `8.71.0` | dev |
| `vitest` | `5.0.3` | dev |
<!-- docsync:end tech-stack -->

## Setup

<!-- docsync:start setup -->
**Prerequisites**

- Node.js: `>=22.12`
- Package manager: npm

**Install**

```sh
npm ci
```

**Scripts**

| Script | Run with | Command |
| --- | --- | --- |
| `build` | `npm run build` | `tsup` |
| `docsync` | `npm run docsync` | `node dist/cli.js` |
| `format` | `npm run format` | `prettier --write .` |
| `lint` | `npm run lint` | `eslint . && prettier --check .` |
| `prepare` | `npm run prepare` | `npm run build` |
| `test` | `npm run test` | `vitest run` |
| `test:coverage` | `npm run test:coverage` | `vitest run --coverage` |
| `typecheck` | `npm run typecheck` | `tsc --noEmit` |
<!-- docsync:end setup -->

## Environment variables

<!-- docsync:start env-vars -->
| Variable | Required | Used in |
| --- | --- | --- |
| `GITHUB_STEP_SUMMARY` | No | `src/cli/run.ts` |
| `GITHUB_TOKEN` | No | `src/cli/run.ts` |
<!-- docsync:end env-vars -->

## Project structure

<!-- docsync:start project-structure -->
| Folder | Purpose |
| --- | --- |
| `.claude/` | Claude Code configuration (skills, agents, hooks) |
| `.github/` | GitHub workflows and templates |
| `docs/` | Documentation |
| `src/` | Source code |
| `tests/` | Tests |
| `user-story/` | Not Found |
<!-- docsync:end project-structure -->

## License

[MIT](LICENSE) © 2026 saikusal
