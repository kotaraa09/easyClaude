# Workflow

`docs/STATE.md` is the source of truth across sessions. Read it before starting work; update it when work lands. If it disagrees with your memory of this conversation, it wins.

- **New feature** → write the spec and task list first (`plan-feature`), get a yes, then build.
- **Small change** (bug fix, copy, styling, <30 lines) → just do it. No ceremony.
- **One task per turn**, built as a vertical slice that actually runs.
- **Verify before claiming done.** Run every step in `.claude/verify.json`. Never call work done, working, or complete while any step fails.
- **Skipped work goes under `## Debt`** in STATE.md, specific enough to act on later.
