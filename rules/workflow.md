# Workflow

`docs/STATE.md` is the source of truth across sessions. Read it before starting work; update it when work lands. If it disagrees with your memory of this conversation, it wins.

- **New feature** → write the spec and task list first (`plan-feature`), get a yes, then build.
- **Small change** (bug fix, copy, styling, <30 lines) → just do it. No ceremony.
- **Something is broken** → reproduce it before changing anything, and leave a regression test behind.
- **One task per turn**, built as a vertical slice that actually runs.
- **Verify before claiming done.** `verify.mjs` runs both tiers; the Stop hook runs only the fast ones each turn.
- **Skipped work goes under `## Debt`** in STATE.md, specific enough to act on later.

**Run on request:** `/easyclaude:` + `write-tests` (no suite yet) · `rescue` (undo something) · `security-check` (before going public) · `deploy` (put it online) · `generate-asset` (images, audio, 3D) · `pick-library` (before hand-rolling).
