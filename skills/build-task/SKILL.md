---
name: build-task
description: Implement the next task from docs/STATE.md as one vertical slice, then verify it. Use when the user says continue, keep going, build it, next, or asks to implement something already planned in STATE.md.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# Build the next task

## 1. Pick what the user asked for

Read `docs/STATE.md`. If the user said which work they mean — "the rest of what I asked yesterday", "the discount one" — take those tasks, wherever they sit in the list. A task ending in `(asked <date>)` is one the user asked for on that date. Otherwise take the first unchecked task under `## Now`, or promote the first from `## Next`. Move it to `## Now` before starting.

**One task at a time.** Build it, verify it, tick it off, and only then start the next. When the user asked for one task, stop after it: three tasks in one pass is a change nobody can review. When they asked you to finish several, go on to the next in the same turn, and stop at the first one that fails. In the outcome benchmark a beginner said "finish the rest of what I asked for yesterday", and got one unrelated task from the top of the list.

## 2. Build it as a slice

- Make it run end to end, however thinly. A task is not done if it needs a later task to be observable.
- Follow the existing code's conventions over your own preferences — naming, file layout, error handling, comment density.
- Reuse what's there. Search before you write: a duplicate implementation is worse than an ugly reused one.
- If this task is a solved problem - a calendar, a map, charts, dates, money, parsing - do not hand-roll it. Read `skills/pick-library/SKILL.md` under `${CLAUDE_PLUGIN_ROOT}` and run its checks on a free, open-source library before you install it. That skill only starts when the user types it, so you read it instead. No new dependency without asking first.

## 3. Verify

Run the contract:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs
```

One line per step, non-zero exit if any failed. **Run it with no flags** — that is the whole contract, both tiers. Finishing a task is exactly the boundary the slow steps exist for, and it is the last point before the work is called done.

If a step fails, fix it — **do not report success on red, and do not describe the work as done, working, or complete while any step fails.**

The Stop hook runs only the fast tier on every turn, so on a tiered contract it will not catch a failing test for you. That is the one place where finishing a task depends on you running the command above rather than on the gate catching you.

If this session has no tool that runs commands, do not go looking for one or send a helper to run it: say the checks were not run, and name the command above for the user. In testing, that search cost as much as the task itself.

If a failure is not obvious, switch to the `debug` skill rather than trying edits until something sticks.

If you cannot make it pass after a genuine attempt, stop and say exactly what's failing and what you tried. A clear failure is more useful than a confident lie.

## 4. Update state

- Move the task to `## Done` with a one-line note of what changed.
- **Keep `## Done` to the ten most recent.** If your entry pushes older ones out, append them to `docs/CHANGELOG.md` — newest first, create it if it doesn't exist. Move them, never delete them. STATE.md is read at the start of every session and again by every skill that touches state, so an unbounded `## Done` is a tax on every session after this one.
- Anything you skipped, hardcoded, or stubbed goes under `## Debt`, specifically enough to act on later.
- Write every entry in the user's language, as the rest of `docs/STATE.md` is. The opener reads `## Debt` back to them, so lead with the effect they would notice, and put file names after it.
- **If `## Debt` passes ten entries, say so once in your report.** The fix is to promote a few into `## Next` or drop them deliberately, not to keep appending — a list nobody triages is a slower way of forgetting. Don't start paying it down uninvited.
- Any decision that will confuse someone in a month goes in `docs/DECISIONS.md` with its reason.

## 5. Ship it, but only if nothing is left

Skip this entirely unless `.claude/autoship.json` exists, is enabled, and is not tracked by git (`git ls-files --error-unmatch .claude/autoship.json` fails). A tracked copy came with the repository, not from this user.

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
