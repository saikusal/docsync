# Agentic SDLC Capstone — Automated Documentation Sync

A full software delivery lifecycle (requirements → merged PR) driven by **Claude Code** through skills, subagents and hooks,
with a human approval gate at every phase.

## How to run it

Open this folder in Claude Code, then run the phases in order:

| Phase | Command | Produces |
|-------|---------|----------|
| 1 Requirements | `/sdlc-requirements` | `docs/requirements.md` |
| 2 Architecture | `/sdlc-architecture` | `docs/architecture.md` |
| 3 Design review | `/sdlc-design-review` | `docs/design-review.md` |
| 4 Plan | `/sdlc-plan` | `docs/impl-plan.md` |
| 5 Implement | `/sdlc-implement [T-n]` | `src/`, `tests/` |
| 6 Review | `/sdlc-review` | `docs/code-review.md` |
| 7 Verify | `/sdlc-verify` | `docs/verification.md` |
| 8 PR | `/sdlc-pr` | Pull request + `CHANGELOG.md` |

`/sdlc-status` shows the current phase at any time.

## What makes it agentic

| Claude Code feature | Where | Purpose |
|---------------------|-------|---------|
| Project instructions | `CLAUDE.md` | Pipeline, gates, conventions, rules |
| Skills | `.claude/skills/sdlc-*` | One slash command per SDLC phase, with templates |
| Subagents | `.claude/agents/` | Independent design reviewer, code reviewer and output-doc quality checker |
| Hooks | `.claude/settings.json`, `.claude/hooks/` | Show status at session start, block code before the plan is approved, block secrets, run tests before each commit |

## Prerequisites
- Claude Code, Git and Node.js 18+
- GitHub CLI (`gh`) authenticated, for Phase 8 (optional — without it, the PR description is saved to a file)
