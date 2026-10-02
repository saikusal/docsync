# Architecture — Docs Sync (DOCS-101)

> **Status:** Approved
> **Approved by:** saikusal on 2026-10-01; revision 2 (design review) saikusal (delegated) on 2026-10-01; revision 3 (independent review) saikusal on 2026-10-02
> **Inputs:** docs/requirements.md (Approved, incl. 2026-10-01 NFR-7 amendment)

## 1. Context and goals
Docs Sync is a **stateless command-line tool**. It reads a JS/TS repository (a local directory, or GitHub via the REST API),
derives facts from the code and metadata, renders them as Markdown, and either rewrites the managed README blocks (`sync`)
or reports how they differ (`check`). It uses no database, no LLM and no server; the only persistent state is the README in git.

Architectural drivers, from the requirements:
1. **Correctness without guessing**: facts are extracted from syntax trees, and a missing fact is `Not Found` (FR-8–13).
2. **Determinism**: identical input gives byte-identical output, which is what makes `check` possible (FR-14, AC2).
3. **Never touch human-written text**: everything outside the markers is preserved byte for byte (FR-4).
4. **Secrets are never read**: `.env` files are excluded where the files are listed, not filtered from the output afterwards (NFR-1).
5. **Testable offline**: every I/O boundary sits behind an interface (NFR-9).
6. **Easy to extend with a new section** (NFR-10).

## 2. Options considered
| Decision | Option | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Packaging | **Single CLI package**, CI calls `docsync check` | Simplest to build, test and release; meets FR-24 | Other repos copy a workflow snippet rather than `uses:` an action | **Chosen** (human, Phase 2) |
| | CLI + reusable GitHub Action | `uses: saikusal/docsync@v1` for other repos | Bundling, committed `dist/`, release tags; the story marks it as a follow-up | Deferred (follow-up story) |
| Remote reading | **Git Trees API + Blobs API** (pinned to one commit SHA) | Fetches only the in-scope files; matches NFR-6 exactly | About one request per source file; large repos need a token | **Chosen** (human, Phase 2) |
| | Tarball download | One request | Downloads every asset; contradicts NFR-6 | Rejected |
| | Shallow `git clone` | Reuses local mode | Needs git; the token goes into a clone URL (leak risk) | Rejected |
| Code analysis | **Babel parser (syntax tree)** | Handles JS, TS and JSX with one parser; tolerant of errors | Static only (dynamic paths can't be resolved) | **Chosen** |
| | Regex | No dependencies | Misses destructuring and aliases; matches comments | Rejected |
| | TypeScript compiler API | Type information | Heavy (≈ 20 MB), slower; type information isn't needed | Rejected |

## 3. Component diagram
```mermaid
flowchart TD
  CLI["C-1 CLI (commander)"] --> CFG["C-2 Config loader (zod)"]
  CLI --> CMD["C-12 Commands: init · sync · check"]
  CMD --> PIPE["C-11 Pipeline"]
  PIPE --> SRC{{"C-3 RepoSource interface"}}
  SRC --> LOC["C-4 LocalSource (fs)"]
  SRC --> GH["C-5 GitHubSource (Octokit)"]
  LOC -. optional metadata .-> GH
  GH --> GHC["C-6 GitHub client + error mapper"]
  LOC --> SCOPE["C-7 Scan scope filter"]
  GH --> SCOPE
  PIPE --> AN["C-8 Code analyser (Babel, parse once)"]
  PIPE --> SEC["C-9 Section modules ×6 (extract + render)"]
  SEC --> AN
  CMD --> MK["C-10 Marker engine"]
  CMD --> DR["C-13 Drift reporter + job summary"]
  CMD --> FS["C-14 Infra: atomic writer · logger/redactor · errors"]
```

## 4. Components
| ID | Component | Responsibility | Satisfies |
|----|-----------|----------------|-----------|
| C-1 | **CLI** (`src/cli/`) | Parses commands and options with commander, enforces that `--path` and `--repo` aren't both given, maps `DocsyncError.exitCode` to the process exit code, and prints a stack trace only with `--debug`. | FR-1, FR-3, FR-23, exit codes |
| C-2 | **Config loader** (`src/config/`) | Merges defaults ← `docsync.config.json` ← CLI flags. A strict zod schema rejects unknown keys and wrong types, naming the field. | FR-2, FR-3 |
| C-3 | **RepoSource interface** (`src/sources/types.ts`) | `listFiles(): Promise<string[]>` (POSIX relative paths, scope applied) · `readFile(path): Promise<string \| null>` · `getMetadata(): Promise<RepoMetadata \| null>` · `isEmpty(): Promise<boolean>`. Everything downstream depends only on this interface. | NFR-9, FR-17, FR-18 |
| C-4 | **LocalSource** | Walks the file system with `fs.readdir(dir, { withFileTypes: true })` one directory at a time, **pruning** excluded and gitignored directories before descending and skipping symbolic links (IDR-9, CR-1), applies C-7, and reads files as UTF-8. Paths are resolved and checked to stay inside the root. Finds `origin` by reading `.git/config` (no git binary needed); if `GITHUB_TOKEN` is set **and** origin is on github.com, it delegates `getMetadata()` to C-5, otherwise returns `null`. | FR-18, FR-19, NFR-4 |
| C-5 | **GitHubSource** | `GET /repos/{o}/{r}` (metadata, default branch) → resolve `--ref` to a **commit SHA** once (`GET /commits/{ref}`) → `GET /git/trees/{sha}?recursive=1` → applies C-7 to the tree (skipping symlinks `120000`, submodules and in-scope files > 1 MB, each with a warning) → **quota pre-check**: if the requests needed exceed `x-ratelimit-remaining`, fail fast (exit 3) and suggest `GITHUB_TOKEN` → `GET /git/blobs/{sha}` for each in-scope file (at most 8 concurrent). A **truncated tree is an error** (exit 3): "too large for remote mode; use a local clone". Topics come from the metadata, the latest release from `releases/latest`. (DR-3, DR-4, DR-5) | FR-17, NFR-6 |
| C-6 | **GitHub client + error mapper** | Creates Octokit with the throttling and retry plugins and the token from `process.env.GITHUB_TOKEN` only. Maps errors: 401 → invalid token, 404 → repo not found / no access, 403/429 with rate-limit headers → "rate limited until HH:MM", network/timeout, 5xx after retries. Uses only GET endpoints. | FR-21, NFR-2, NFR-3 |
| C-7 | **Scan scope filter** (`src/scope/`) | One pure function shared by both sources. It decides which paths count as **source files** (JS/TS extensions, minus default excludes, minus test files, minus `.gitignore` rules via the `ignore` package, plus config include/exclude) and which are **always-readable manifests** (`package.json`, `package-lock.json`, `.env.example`, `LICENSE*`). `.env` and `.env.*` (apart from `.env.example`) are **never listed**, so they can't be read. `.env.example` is parsed for **key names only** (`^\s*(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=`); the value part is discarded unread (DR-2). | FR-19, NFR-1 |
| C-8 | **Code analyser** (`src/analysis/`) | Parses each source file once with `@babel/parser` (plugins `typescript` and `jsx`, `errorRecovery: true`) and caches the syntax tree for the run. A parse failure produces a warning (file, line, column and parser message only, **never a code frame**) and the file is skipped (DR-2). Literal values from the code (e.g. env fallbacks) are never put into facts. Provides the visitors: **env usage** (`process.env.X`, `process.env['X']`, destructuring from `process.env`, plus whether a fallback such as `\|\|`, `??` or a default value is present) and **Express routes** (see §5.3). | FR-11, FR-12, FR-22 |
| C-9 | **Section modules** (`src/sections/*.ts`) | Each one exports `{ id, extract(ctx): Promise<Facts>, render(facts): string }`. There are six: `overview`, `tech-stack`, `setup`, `env-vars`, `api-endpoints`, `project-structure`. A registry array lists the enabled modules, so adding a section is one file plus one registry line. Renderers sort every row and contain no timestamps. | FR-8–FR-14, NFR-10 |
| C-10 | **Marker engine** (`src/markers/`) | A pure-string engine. `parse(readme)` returns blocks `{section, contentStart, contentEnd, line}` or errors with line numbers (no end marker, nested block, duplicate, unknown section). `replace(readme, Map<section, content>)` splices new content in by offset, so the bytes outside the blocks are never re-serialised. The README is read as bytes: a UTF-8 **BOM** is preserved, and each block uses the EOL of **its own start-marker line**, which handles mixed CRLF/LF files (DR-6). `insertMissing(readme, sections)` supports `init`. | FR-4, FR-5, FR-6 |
| C-11 | **Pipeline** (`src/core/pipeline.ts`) | `render(source, config) → Map<section, markdown>`: checks for an empty repo, lists the files, builds the analysis context, runs the enabled section modules, and returns the rendered blocks. Commands share it. | FR-14, FR-20 |
| C-12 | **Commands** (`src/commands/`) | `init`: insert the missing blocks (or create a minimal README), show a preview, require `--yes` or confirmation. If stdin is not a TTY and `--yes` is absent, exit 2 (DR-12). `sync`: pipeline → marker replace → atomic write (local) or `--out`/stdout (remote); report the changed sections. `check`: pipeline → compare → drift report → exit 1/0; never writes the README. | FR-6, FR-7, FR-15, FR-16 |
| C-13 | **Drift reporter** (`src/report/`) | Per stale section, a unified diff (`diff` package) for the terminal, and Markdown for `$GITHUB_STEP_SUMMARY` when that variable is set, capped at 900 KiB with a truncation note (DR-13). All output goes through the redactor. | FR-16, AC9 |
| C-14 | **Infra** (`src/infra/`) | `DocsyncError` (with `exitCode` 2 or 3); `Logger` (stderr for diagnostics, stdout for results) wrapping a **Redactor** that masks the literal `GITHUB_TOKEN` value and token-shaped strings; `writeFileAtomic` (write a temporary file in the same directory, then rename; on Windows `EPERM`/`EBUSY`, retry up to 5 times with 50→800 ms back-off, then exit 3 and remove the temporary file, never a non-atomic fallback) (DR-7). | NFR-1, NFR-2, NFR-8, FR-23 |
| C-15 | **CI workflow** (`.github/workflows/ci.yml`) | On `pull_request`: matrix {ubuntu, windows} × Node {22, 24}: `npm ci` → lint → typecheck → test (coverage) → `npm audit --audit-level=high`; then a `docs-check` job: build → `node dist/cli.js check` on this repo's README (which gets markers via `docsync init` + `sync` before the job is enabled, DR-8). Permissions: `contents: read`. | FR-24, NFR-7, NFR-12, AC9 |

## 5. Key design details

### 5.1 The facts model and `Not Found`
```ts
export const NOT_FOUND = Symbol('NotFound');
export type Maybe<T> = T | typeof NOT_FOUND;   // every optional fact uses this
```
Extractors return `Maybe<…>` fields and never `undefined` or empty strings. A shared `fmt(value)` helper in the renderers turns
`NOT_FOUND` into the literal text `Not Found`, so the rule lives in one place and can be checked in code review. **An empty list renders a single `Not Found` line** (DR-9).

### 5.2 Determinism
- Rows are sorted with `localeCompare(…, 'en')` (routes by path, then method), and file paths use `/` on every OS.
- No timestamps, absolute paths or machine-specific values appear in the output.
- Rendered content ends with exactly one EOL; the marker engine handles the blank lines around it.

### 5.3 Express route resolution (FR-12)
Two passes over the cached syntax trees:
1. **Collect.** For each file, record:
   - *routers*: identifiers bound to `express()`, `express.Router()` or `Router()`
   - *routes*: `<router>.<method>(path, …)` and `<router>.route(path).<method>(…)`, where the method is one of get/post/put/patch/delete/options/head/all
   - *mounts*: `<router>.use('/prefix', <routerRef>)`
   - *exports and imports* of router identifiers (ESM `import`/`export`, and CommonJS `require`/`module.exports`)
2. **Resolve.** Build a mount graph across files by resolving relative import specifiers (trying `.ts .tsx .js .jsx .mjs .cjs` and `/index.*`).
   Each route's full path is the concatenation of the prefixes along its mount chain from the app root, normalised to remove duplicate `/`.
   - A route on a router that is never mounted is listed with its own path (no prefix).
   - A path that isn't a string literal or a template string without expressions becomes `Not Found (dynamic)`.
   - Cycles in the mount graph are detected and the cycle is broken with a warning.
   - Supported module forms: direct default/named exports, `module.exports =`, `require()`, and **one hop** of re-export (`export { r } from`). Deeper re-export chains produce a warning and the routes are listed unprefixed (DR-15).

### 5.4 Env var "required" rule (FR-11)
For each use, `required = true` unless the `process.env.X` member expression is the left operand of `||` or `??`, the target of
`||=` / `??=`, or a destructured property with a default value (`const { X = 'd' } = process.env`). Conditional tests and guards
(`if (!process.env.X) throw …`) **do not** count as fallbacks, because they signal that the variable is required (DR-1). Dynamic keys (`process.env[name]`)
are skipped with a debug note; `import.meta.env` is out of scope (DR-10).
A variable is **Required = Yes** if *any* use is required. A variable found only in `.env.example` shows "Used in: `Not Found`" and "Required: `Not Found`".

### 5.5 Data flow — `docsync check` (local)
```mermaid
sequenceDiagram
  participant U as User / CI
  participant C as CLI (C-1)
  participant P as Pipeline (C-11)
  participant S as LocalSource (C-4)
  participant X as Sections (C-9) + Analyser (C-8)
  participant M as Marker engine (C-10)
  participant R as Drift reporter (C-13)
  U->>C: docsync check
  C->>M: parse(README)  (exit 2 if malformed / no markers)
  C->>P: render(source, config)
  P->>S: isEmpty / listFiles (scope C-7)
  P->>X: extract + render each enabled section
  X->>S: readFile (manifests, sources)
  P-->>C: Map<section, markdown>
  C->>R: compare current block vs rendered
  R-->>U: diff in terminal (+ $GITHUB_STEP_SUMMARY)
  C-->>U: exit 1 if drift, else 0
```

### 5.6 Data flow — remote mode
```mermaid
sequenceDiagram
  participant G as GitHubSource (C-5)
  participant API as GitHub REST API
  G->>API: GET /repos/{o}/{r}  (metadata, default branch)
  G->>API: GET /repos/{o}/{r}/commits/{ref}  (resolve to SHA once)
  G->>API: GET /repos/{o}/{r}/git/trees/{sha}?recursive=1
  Note over G: truncated → exit 3; apply scope (C-7); skip symlinks/submodules/>1 MB
  Note over G: quota pre-check vs x-ratelimit-remaining → fail fast
  loop in-scope files (max 8 concurrent)
    G->>API: GET /repos/{o}/{r}/git/blobs/{blobSha}
  end
  G->>API: GET /repos/{o}/{r}/releases/latest (404 → Not Found)
```

## 6. Technology choices
| Concern | Choice | Version | Why |
|---------|--------|---------|-----|
| Runtime | Node.js | ≥ 22.12 (CI on 22, 24) | Supported LTS lines only (NFR-7 as amended) |
| Language | TypeScript (strict) | 6.0.x | Typed facts model. TS 7 isn't supported by typescript-eslint yet (it supports < 6.1) |
| Module format | ESM | — | Matches current Octokit and Node conventions |
| CLI | commander | 15.x | Standard, generates `--help` |
| Config validation | zod | 4.x | Strict schemas with readable errors |
| GitHub API | @octokit/rest + plugin-throttling + plugin-retry | 22.x / 11.x / 8.x | Official client; rate-limit and retry handling (FR-21) |
| Parsing | @babel/parser + @babel/traverse | 7.29.x | Babel 8 isn't on the `latest` tag yet; 7.29 is the stable line and supports TS and JSX |
| File walking / ignores | Node `fs` (recursive readdir) + ignore | — / 7.x | No glob dependency needed (DR-14); `ignore` gives `.gitignore` semantics |
| Diffs | diff | 9.x | Unified diffs for the drift report |
| Tests | vitest + @vitest/coverage-v8 | 5.x | TypeScript-native and fast; coverage built in |
| Lint / format | eslint + typescript-eslint, prettier | 10.x / 8.x / 3.x | Code-quality checklist |
| Build | tsup | 8.x | Bundles `src/cli.ts` into `dist/cli.js` with a shebang |

All dependencies are pinned through `package-lock.json`; `package.json` uses caret ranges within the majors above. No runtime dependency is needed beyond those listed.

## 7. External interfaces
| Interface | Details |
|-----------|---------|
| CLI | `docsync <init\|sync\|check> [--path dir \| --repo owner/repo [--ref r]] [--readme f] [--config f] [--sections a,b] [--out f] [--yes] [--debug]` |
| GitHub REST API | GET only: repos, commits/{ref}, git/trees, git/blobs, releases/latest. Authenticated with `GITHUB_TOKEN` when present, otherwise anonymous (60 requests/hour). Throttling plugin: wait and retry once on secondary rate limits; fail with a reset time on the primary limit. |
| GitHub Actions | Reads `GITHUB_STEP_SUMMARY` (a file path) and appends Markdown to it. |
| File system | Reads in-scope files under the target root; writes only the README (`sync`/`init`) or the `--out` file. |

## 8. Configuration and secrets
- `GITHUB_TOKEN` (optional): environment variable only. It is never accepted as a flag, never logged, and the redactor masks it. `.env.example` lists it by name.
- `docsync.config.json` (optional):
  ```json
  { "readme": "README.md", "sections": ["overview","tech-stack","setup","env-vars","api-endpoints","project-structure"],
    "include": ["src/**"], "exclude": ["scripts/**"] }
  ```
- Precedence: CLI flags > config file > defaults.

## 9. Error handling strategy
| Situation | Behaviour | Exit |
|-----------|-----------|------|
| Bad flags, invalid config, malformed or missing markers, missing README | One-line error + the next step (e.g. "run `docsync init`") | 2 |
| Empty repository | "repository is empty" | 3 |
| GitHub 401 / 404 / rate limit / network / 5xx | Specific message from C-6; token redacted | 3 |
| File that can't be parsed | Warning (file + reason); continue | — |
| Missing fact | `Not Found` in the output; not an error | — |
| Unexpected exception | "Unexpected error, re-run with --debug" | 3 |

All errors are `DocsyncError` subclasses, which are caught in a single place (C-1). No `process.exit` calls appear anywhere else.

## 10. Project structure
```
src/
  cli.ts                 entry (C-1)
  config/                C-2
  sources/  types.ts local.ts github.ts githubClient.ts   C-3..C-6
  scope/                 C-7
  analysis/ parse.ts env.ts routes.ts                     C-8
  sections/ index.ts overview.ts techStack.ts setup.ts envVars.ts apiEndpoints.ts projectStructure.ts   C-9
  markers/               C-10
  core/pipeline.ts       C-11
  commands/ init.ts sync.ts check.ts                      C-12
  report/                C-13
  infra/ errors.ts logger.ts redact.ts atomicWrite.ts     C-14
tests/
  unit/  integration/  fixtures/<named-repos>/
.github/workflows/ci.yml C-15
```

## 11. Testing strategy (summary — detailed in the implementation plan)
- **Unit tests:** marker engine, scope filter, env and route visitors, every renderer (snapshot tests), config merging, error mapping, redactor.
- **Integration tests:** whole commands against fixture repositories in `tests/fixtures/` (express-basic, no-license, empty, malformed-markers, with-dotenv) through LocalSource; GitHubSource through a fake `fetch` injected into Octokit (`request.fetch`), so there is **no network access** in tests (NFR-9).
- **Security tests:** a sentinel value in a fixture `.env` must not appear in any output (NFR-1); a token set together with forced API errors must not appear in any output (NFR-2).
- **Performance test:** a generated 500-file fixture syncs in under 10 s (NFR-5).
- **Contract test:** the same fixture rendered through LocalSource and GitHubSource (fake fetch) gives byte-equal output (DR-16).
- **Golden tests:** a README with BOM + CRLF and mixed EOLs survives `sync` byte for byte outside the blocks (DR-6).
- **Secret sentinels:** in `.env`, `.env.example` values and code fallbacks (DR-2).

## 12. Traceability
| Requirement | Component(s) |
|-------------|--------------|
| FR-1 | C-1 |
| FR-2, FR-3 | C-2, C-1 |
| FR-4, FR-5 | C-10 |
| FR-6, FR-7 | C-12, C-10 |
| FR-8 | C-9 (overview), C-5/C-4 metadata |
| FR-9, FR-10 | C-9 (tech-stack, setup) |
| FR-11 | C-8 (env), C-9 (env-vars) |
| FR-12 | C-8 (routes), C-9 (api-endpoints) |
| FR-13 | C-9 (project-structure) |
| FR-14 | C-9, C-11 |
| FR-15, FR-16 | C-12, C-13 |
| FR-17 | C-5, C-6 |
| FR-18 | C-4 |
| FR-19 | C-7 |
| FR-20 | C-11 |
| FR-21 | C-6 |
| FR-22 | C-8 |
| FR-23 | C-1, C-14 |
| FR-24 | C-15 |
| NFR-1 | C-7, C-14 |
| NFR-2, NFR-3 | C-6, C-14 |
| NFR-4 | C-4, C-2 |
| NFR-5 | C-8 (parse once), C-4 |
| NFR-6 | C-5 |
| NFR-7, NFR-12 | C-15 |
| NFR-8 | C-14 |
| NFR-9 | C-3, C-6 |
| NFR-10 | C-9 |
| NFR-11 | C-1, C-14 |

Every FR and NFR maps to at least one component; no gaps.

## 13. Known risks (input to the design review)
- Static route resolution misses routes registered in loops or through helper functions; these are documented as a limitation.
- Lockfile v1 isn't parsed; declared ranges are used with a warning (DR-11).
- **Ambient GitHub metadata (IDR-2):** with `GITHUB_TOKEN` set and a github.com origin, `overview` includes live GitHub facts, which can
  change without a code change (a new release, edited topics). Run `sync` and `check` in the same mode; this repo's docs-check job runs
  without a token on purpose. An explicit opt-in setting is a candidate for a later version.
- **Working tree, not commits (IDR-8):** local mode scans files on disk, so untracked files that are not gitignored are included.
  CI checks a clean checkout. Commit or ignore scratch files before running `sync`.
- **Consumer dependency pinning (IDR-18):** npm users resolve the caret ranges in `package.json` at install time; the lockfile protects
  only this repository's CI. Exact pins or an `npm-shrinkwrap.json` are candidates for a later version.
- **Matcher semantics (IDR-10):** `include`/`exclude` and `.gitignore` all use gitignore pattern rules (the `ignore` package);
  only the root `.gitignore` is read; `exclude` removes files from the listing, `include` only narrows which files are analysed.
- The Git Trees API truncates very large trees (> 100k entries / 7 MB); remote mode then stops with exit 3 and asks for a local clone (DR-5).
- Anonymous remote mode exhausts the 60-requests-per-hour limit on repos with more than about 55 source files, so a token is needed.

## 14. Revision history
| Date | Change | Reason |
|------|--------|--------|
| 2026-10-01 | Initial version | Phase 2 |
| 2026-10-01 | Revision 3 (independent review): stale text in §2, §7 and §13 corrected; C-7 regex restored; known risks added for ambient metadata, working-tree scanning, consumer pinning and matcher semantics. Code changes for IDR-4/12/16 and ICR-1…8/14/17 are listed in docs/independent-review.md | IDR-2, IDR-8, IDR-10, IDR-13, IDR-14, IDR-18 |
| 2026-10-01 | Revision 2: env "required" rule fixed; `.env.example` names-only; no code frames or literals; remote reads blobs by commit SHA, quota pre-check, truncation = error, skip symlinks/submodules/>1 MB; BOM + per-block EOL; Windows rename retry; init non-TTY guard; summary cap; empty list = Not Found; one-hop re-exports; drop fast-glob; contract/golden/sentinel tests | DR-1 … DR-16 (docs/design-review.md) |
