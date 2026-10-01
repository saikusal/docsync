# Capstone Report: Agentic SDLC with Claude Code

**Project:** docsync, which keeps a repository's README in sync with its code (user story DOCS-101)
**Repository:** https://github.com/saikusal/docsync
**Releases:** v0.1.0 (first release), v0.1.1 (npm packaging), v0.1.2 (independent review fixes)
**Author:** saikusal, with Claude Code as the agent

This report maps every step of the capstone brief (`copilot-claude-cursor-capstone-project.docx`) to the evidence in the repository,
and states honestly where the process differed from the brief. An evaluator can start here.

## 1. Summary
The brief asks for an Agentic SDLC pipeline, from requirements to a merged pull request, driven by an AI agent through agents,
prompts, instructions, skills and hooks, with a human in the loop. All eight steps were completed with **Claude Code**. Each step
produced a committed artifact. The product works: it is tested on Windows and Linux with Node.js 22 and 24, it dogfoods itself
(this repository's README is generated and checked by docsync), and it is released on GitHub.

## 2. Step by step

| # | Brief | Done | Evidence |
|---|-------|------|----------|
| 1 | Read a user story; the AI asks clarifying questions and the human answers; capture `requirements.md` and commit it | Yes | `user-story/DOCS-101-docs-sync.md`; 12 questions asked with the question tool and answered by the human (log in `docs/requirements.md` §6); 24 FR, 12 NFR; commit `c23c39c` |
| 2 | Architecture: components, technology choices, data flow, in `architecture.md` | Yes | `docs/architecture.md`: 2 approaches offered and the human chose; 15 components; 3 Mermaid diagrams; traceability matrix. Version check against npm found Node 20 end of life, and the human approved Node 22.12 |
| 3 | Design review: risks and gaps in `design-review.md`; update the architecture | Yes | `docs/design-review.md` (17 findings, 16 applied as architecture revision 2) **plus** `docs/independent-review.md` (22 findings by the independent design-reviewer agent, architecture revision 3) |
| 4 | Implementation plan, ordered by dependency, with blocked tasks | Yes | `docs/impl-plan.md`: 18 tasks, a dependency graph, a blocked-task table and the tasks that can run in parallel |
| 5 | Implementation approved by the human in the loop | Yes | 18 `impl(T-n)` commits, each tested before commit; notes on the problems found during implementation in `docs/impl-plan.md` |
| 6 | Code review against the 7-point checklist | Yes | `docs/code-review.md` (all 7 areas, 10 findings, 4 bugs fixed with failing-first tests) **plus** `docs/independent-review.md` (code-reviewer agent: 18 findings, 2 Major fixed) |
| 7 | Verify the code (unit and integration) and the output document | Yes | `docs/verification.md`: test run, coverage, requirement to test matrix, a real GitHub API smoke test, and a 7-point quality check of `tests/output/express-app.README.md`; confirmed by the doc-quality-checker agent (17 facts checked, all correct) |
| 8 | PR through agent mode with description, changelog and reviewer checklist (5 required sections) | Yes | [PR #1](https://github.com/saikusal/docsync/pull/1) with Summary, Changes Made, Test Evidence, Known Limitations and Reviewer Checklist; `CHANGELOG.md`; all CI checks green; merged. Follow-up PRs #2, #3 and #4 |

## 3. How the agentic features were used

| Brief asks for | Claude Code feature | Where | How it was used |
|----------------|---------------------|-------|-----------------|
| Instructions | Project instructions | `CLAUDE.md` | Pipeline, approval gates, artifact header format, branching and commit rules, delegated-approval rule |
| Prompts / Skills | Skills (slash commands) | `.claude/skills/sdlc-*` (9 skills, 2 with templates) | One skill per phase. The human typed `/sdlc-requirements`; later phases followed their skill files after the human said "go ahead" |
| Agents | Subagents | `.claude/agents/` (design-reviewer, code-reviewer, doc-quality-checker) | Run as independent reviewers with fresh context and read-only tools (section 5) |
| Hooks | Hooks | `.claude/settings.json`, `.claude/hooks/*.cjs` | SessionStart prints the pipeline status; PreToolUse blocks `src/` and `tests/` edits until the plan is approved, blocks `.env` files and token-shaped content, and runs the test suite before every `git commit` |
| Human in the loop | Question tool and approval gates | Every artifact header | Clarifying questions, the architecture choices, the Node.js version change and the approvals |

## 4. Quality results

| Measure | Result |
|---------|--------|
| Automated tests | 248 (246 pass; 2 symlink tests skip on Windows only and run on Linux CI) |
| Coverage | about 95 percent of lines, 84 percent of branches |
| CI | Ubuntu and Windows with Node.js 22 and 24, lint, typecheck, tests, `npm audit`, and a docs-check of this README; all green on every merged PR |
| Performance | 500-file repository in about 1.6 seconds (requirement: under 10) |
| Security | No secret value from `.env`, `.env.example`, code fallbacks or npm scripts appears in any output (sentinel tests); token masked everywhere |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities; 1 low dev-only advisory waived (CR-8) |

**Defects found by the process, and where:**

| Found in | Defects | Examples |
|----------|---------|----------|
| Design review (Phase 3) | 2 Blockers before any code | Wrong "required" rule for `if (!process.env.X) throw`; `.env.example` parsing undefined |
| Implementation (Phase 5) | 3 | Rate-limit retry wasting quota; AC7 ordering; duplicate `.gitignore` download |
| Code review (Phase 6) | 4 bugs | Symlink read outside the root; optional metadata aborting the run; array mount paths; `--out` |
| Verification (Phase 7) | 2 | Unclear error for an unknown branch; **the project's own hooks were not running** |
| Independent agent review | 12 code fixes | `--readme .env` read the secrets file; one invalid file aborted the run; unredacted job summary; secrets in npm scripts; large lockfile skipped in remote mode |

## 5. Where the process differed from the brief

1. **Claude Code instead of GitHub Copilot.** The brief's text is written for Copilot; its file name names Copilot, Claude and Cursor.
   The human chose Claude Code. Every Copilot concept has a direct counterpart (section 3). No Copilot-specific files exist.
2. **Reviewer agents ran late.** In the main session the subagent launches were blocked, so Phases 3, 6 and 7 were first reviewed by
   the authoring agent, which is recorded in each document. After the release, the three agents ran independently
   (`docs/independent-review.md`). They found defects the authoring agent had missed, including a Major security issue. All of them
   are fixed or documented in release v0.1.2.
3. **Hooks were inactive during implementation.** Setting `"type": "module"` in T-1 made the CommonJS hook scripts crash, and a crashing
   hook does not block. This was discovered in Phase 7 (V-2) and fixed by renaming them to `.cjs`. Lint, typecheck and tests were run
   by hand before every commit, so no untested code was committed.
4. **Delegated approvals.** For Phases 3 to 7 the human said "go ahead with your recommendations". Each artifact records this as
   `saikusal (delegated)`. The human approved Phases 1 and 2, the requirement change, and all pushes, merges and releases.
5. **Skills mostly followed rather than invoked.** The phase skills are set to run only when the human types them. After Phase 1 the
   human asked the agent to continue, so the agent followed each skill file directly.
6. **The user story was drafted by the agent.** The brief contains no story and none existed in JIRA, Confluence or Word, so the agent
   drafted DOCS-101 and the human approved it before Phase 1.

## 6. Open items

| Item | Owner | Notes |
|------|-------|-------|
| Re-approve the architecture after the independent review (IDR-22) | Human | Read `docs/independent-review.md` and confirm the dispositions |
| Publish to npm | Human | `npm publish` needs two-factor authentication on the npm account; the package `@saikusal/docsync` is ready |
| Deferred minor findings | Backlog | Listed as Deferred in `docs/independent-review.md` |

## 7. Lessons learned
- **Independent review is worth its cost.** The author reviewed its own work three times and still missed a secret-file read that a
  fresh agent found in minutes.
- **Test the guardrails, not only the product.** The hooks looked configured but did nothing for half of the project. A one-line check
  in the session-start status would have caught it on day one.
- **Verify against reality.** The real GitHub API produced a 422 that no fake had modelled, and the npm registry required two-factor
  authentication. Both were found only by trying.
- **Dogfooding finds design gaps.** Running docsync on its own README exposed env-var detection through an injected object and pulled
  Claude tooling into the facts, which led to the environment allowlist and the `include` setting.
