---
name: debug
description: Track down why something is broken, then fix it and lock the fix in with a regression test. Use when the user reports a crash, an error message, a stack trace, a failing test, or behaviour that is wrong, unexpected, intermittent, or "worked yesterday".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Debug

The discipline is refusing to guess. Every step below narrows the search; changing things hopefully does not.

## 1. Reproduce it first

**Do not fix what you cannot reproduce.** Without a repro there's no way to know the fix worked — only that the symptom didn't appear this time.

Get the smallest reliable trigger: exact input, exact steps, exact command. If it's intermittent, find what makes it more likely — a specific order, an empty state, a slow network, a second run.

If you genuinely cannot reproduce it, say so and ask for what's missing. That's a real answer.

## 2. Read the actual error

Read the **whole** stack trace, not the last line. The top frame is usually where it surfaced; the cause is usually further down, in the first frame that belongs to this project rather than a library.

Then read the failing code. Not the code you assume is failing — open the file and the line the trace names.

## 3. Ask what changed

Most breakage is recent.

```bash
git log --oneline -15
git diff HEAD~1
```

If it worked before and doesn't now, the diff between those points contains the cause. For an unclear window, `git bisect` finds it in a handful of steps and is worth the setup on anything older than a few commits.

## 4. Narrow it down

Binary search the path between "input is correct" and "output is wrong". Find the midpoint, check the value there, and discard half the search space.

**Verify assumptions instead of trusting them.** Print or log the actual value at each boundary — is it the shape you think, at the moment you think? Most bugs live in a gap between what the code assumes and what it receives: a null, an empty array, a string where a number was expected, a race that only loses sometimes.

Change **one thing at a time**, and undo it if it didn't help. Three simultaneous changes and a working system teaches you nothing about which mattered.

## 5. Fix the cause

- Fix why the value is wrong, not the place it finally blew up.
- **Never silence an error to make it go away.** A `try/catch` that swallows an exception, an `?? {}` masking a null, a disabled assertion — that converts a loud bug into a silent one, which is strictly worse.
- **Never delete or skip the failing test** to get green. If the test is genuinely wrong, say why out loud and fix the test deliberately.

## 6. Lock it in with a regression test

This is the step that compounds, and the reason this skill exists rather than just fixing things ad hoc.

Write a test that **fails before your fix and passes after**. Verify that ordering — stash the fix and watch it fail, or write the test first. A regression test that passes against the broken code protects nothing.

Every bug fixed this way permanently strengthens the verify contract. Over a project's life this is what turns the Stop gate from a formality into something that genuinely catches breakage.

If the project has no test suite yet, this is the moment to start one: a single test for the bug you just fixed is a better beginning than a testing plan.

## 7. Record it

- If you patched around the cause rather than fixing it, that goes under `## Debt` in `docs/STATE.md`, with what the real fix would be.
- If the cause was a surprising design decision, add it to `docs/DECISIONS.md` so the next person doesn't re-break it.

## When to stop

After two or three genuine attempts with no progress, **stop and report**. Say what you tried, what you ruled out, and what you now suspect. Continued thrashing burns tokens, makes larger changes, and is how a small bug becomes a broken branch.

Ask for what would unblock you: the full log, the exact input, the environment it fails in, or the ability to run the thing yourself.
