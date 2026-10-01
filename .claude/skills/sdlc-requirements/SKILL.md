---
name: sdlc-requirements
description: Phase 1 — read a user story (Word doc, Markdown, pasted text, or JIRA/Confluence via a connector), clarify it with the human, and produce docs/requirements.md.
argument-hint: "[path to user story | JIRA key | blank for user-story/]"
disable-model-invocation: true
---

# Phase 1 — Requirements

## 1. Load the user story
Source, in priority order:
- `$ARGUMENTS` if given: a file path (`.md`, `.txt`, `.docx`), or a JIRA/Confluence key if a connector for it is available.
- Otherwise every file in `user-story/` except `README.md`.
- If nothing is found, ask the human to paste the story or drop a file into `user-story/`, then stop.

For `.docx`, extract the text (e.g. unzip `word/document.xml` and strip the tags with Node or PowerShell).

## 2. Analyse and clarify — do not skip
Restate the story in 2–3 sentences. Then list **numbered clarifying questions** covering anything ambiguous or missing:
actors, inputs/outputs, data sources and auth, output format and location, triggers (manual/CI/scheduled),
behaviour when data is missing ("Not Found"), error cases, scale/performance, security, and what is out of scope.

Ask the questions with the AskUserQuestion tool when they have discrete options, otherwise in chat.
**Wait for the answers.** Ask follow-ups until no blocking ambiguity remains. Never invent an answer.

## 3. Write `docs/requirements.md`
Use [template.md](template.md). Each requirement gets a stable ID (`FR-n`, `NFR-n`) and at least one testable acceptance criterion
in Given/When/Then form. Record every question and the human's answer in the Clarifications log.
Set `Status: Draft`.

## 4. Gate
Show a short summary and ask the human to approve or request changes. Iterate until they approve.
On approval: set `Status: Approved`, fill in Approved by, and commit:
`git add docs/requirements.md user-story && git commit -m "requirements: capture FR/NFR for <story>"`.
Then suggest `/sdlc-architecture`.
