---
name: sdlc-status
description: Show where the Agentic SDLC pipeline stands — which phase artifacts exist, which are approved, and what to run next.
---

1. Run `node .claude/hooks/status.cjs` and show the output.
2. For the current phase, list any open questions or unresolved findings recorded in its artifact.
3. Tell the human the exact next skill to run (e.g. `/sdlc-architecture`).
