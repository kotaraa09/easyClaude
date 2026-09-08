---
name: build-task
description: Implement the next task from docs/STATE.md as one vertical slice, then verify it. Use when the user says continue, keep going, build it, next, or asks to implement something already planned in STATE.md.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# Build the next task

## 1. Pick exactly one

Read `docs/STATE.md`. Take the first unchecked task under `## Now`, or promote the first from `## Next`. Move it to `## Now` before starting.

**One task per turn.** Finishing three tasks in one pass produces a change nobody can review and a session that can't be resumed cleanly if it goes wrong.

## 2. Build it as a slice

- Make it run end to end, however thinly. A task is not done if it needs a later task to be observable.
- Follow the existing code's conventions over your own preferences — naming, file layout, error handling, comment density.
- Reuse what's there. Search before you write: a duplicate implementation is worse than an ugly reused one.
- If this task is a solved problem, do not hand-roll it — `/easyclaude:pick-library` finds and vets an existing one. No new dependency without asking first.

## 3. Verify

Run the contract:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs
```

One line per step, non-zero exit if any failed. If a step fails, fix it — **do not report success on red, and do not describe the work as done, working, or complete while any step fails.** The Stop hook runs the same command when you try to end the turn, so a failure you talk past just blocks you a moment later.

If a failure is not obvious, switch to the `debug` skill rather than trying edits until something sticks.

If you cannot make it pass after a genuine attempt, stop and say exactly what's failing and what you tried. A clear failure is more useful than a confident lie.

## 4. Update state

- Move the task to `## Done` with a one-line note of what changed.
- **Keep `## Done` to the ten most recent.** If your entry pushes older ones out, append them to `docs/CHANGELOG.md` — newest first, create it if it doesn't exist. Move them, never delete them. STATE.md is read at the start of every session and again by every skill that touches state, so an unbounded `## Done` is a tax on every session after this one.
- Anything you skipped, hardcoded, or stubbed goes under `## Debt`, specifically enough to act on later.
- **If `## Debt` passes ten entries, say so once in your report.** The fix is to promote a few into `## Next` or drop them deliberately, not to keep appending — a list nobody triages is a slower way of forgetting. Don't start paying it down uninvited.
- Any decision that will confuse someone in a month goes in `docs/DECISIONS.md` with its reason.

## 5. Ship it, but only if nothing is left

Skip this entirely unless `.claude/autoship.json` exists and is enabled.

Re-read `docs/STATE.md` after your update and check all four:

- `## Now` — no unchecked task
- `## Next` — no unchecked `- [ ]`
- `## Blocked` — reads `none`
- nothing you found this turn is still unrecorded

A bug you spotted, a half-finished slice, or a follow-up you were about to suggest **is** a
subsequent task. Write it under `## Next` — which by itself fails this check and ships
nothing. That is the point: autoship fires at the end of a *feature*, not the end of a
*task*.

If all four hold, invoke the `ship` skill and let it work to the level in the config. If
any fail, say nothing about shipping and carry on.

## 6. Report

Three lines: what now works, what verify said, what's next. No summary of your process.
