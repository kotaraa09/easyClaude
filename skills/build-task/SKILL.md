---
name: build-task
description: Implement the next task from docs/STATE.md as one vertical slice, then verify it. Use when the user says continue, keep going, build it, next, or asks to implement something already planned in STATE.md.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Build the next task

## 1. Pick exactly one

Read `docs/STATE.md`. Take the first unchecked task under `## Now`, or promote the first from `## Next`. Move it to `## Now` before starting.

**One task per turn.** Finishing three tasks in one pass produces a change nobody can review and a session that can't be resumed cleanly if it goes wrong.

## 2. Build it as a slice

- Make it run end to end, however thinly. A task is not done if it needs a later task to be observable.
- Follow the existing code's conventions over your own preferences — naming, file layout, error handling, comment density.
- Reuse what's there. Search before you write: a duplicate implementation is worse than an ugly reused one.
- No new dependency without asking first.

## 3. Verify

Run every step in `.claude/verify.json`. If a step fails, fix it — **do not report success on red, and do not describe the work as done, working, or complete while any step fails.**

If you cannot make it pass after a genuine attempt, stop and say exactly what's failing and what you tried. A clear failure is more useful than a confident lie.

## 4. Update state

- Move the task to `## Done` with a one-line note of what changed.
- Anything you skipped, hardcoded, or stubbed goes under `## Debt`, specifically enough to act on later.
- Any decision that will confuse someone in a month goes in `docs/DECISIONS.md` with its reason.

## 5. Report

Three lines: what now works, what verify said, what's next. No summary of your process.
