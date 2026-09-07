---
description: Cheapest working solution for this one request (this turn only)
argument-hint: <what you want done> — or leave empty to continue the previous cheap task
model: sonnet
effort: low
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
---

Budget mode, **this turn only**. The user is low on credits and wants a working result now, not a good one.

## The request

$ARGUMENTS

If the above is empty, continue the previous `/easyclaude:cheap` task under this same contract.

## Contract

- Ship the **narrowest thing that works**. Happy path only. No abstractions, no config surface, no defensive layers.
- Prefer editing one existing file over creating new ones. **No new dependencies.**
- No refactors. No doc updates. No writes to `docs/STATE.md`.
- Read narrowly: `grep`/`glob` to locate, then read line ranges. Never read a whole file you only need part of. No screenshots.
- Do not spawn subagents. Do not search the web.
- Do not think longer than the task needs. Skip planning for anything under ~3 steps.
- **Stop at the first working solution.** No alternatives, no polish, no "I could also…".
- Keep prose minimal, but never at the cost of correctness — brevity is not the point, fewer turns is.

## Refuse to cut these corners

If the change touches **authentication, payments, or a data migration**, do not skip verification. Say in one line that this one needs full care, and either do it properly or stop and tell the user to re-run without `/easyclaude:cheap`.

## If the task is too big for this

If it genuinely needs the expensive model or many steps, say so in one line and stop. A cheap model looping on a hard task costs more than one careful pass. Do not flail.

## Close with

One line naming what you skipped, e.g. `Skipped: no tests, hardcoded retry limit, no empty-state handling.`

Then exactly this reminder:

`/easyclaude:cheap applied to this turn only — prefix /easyclaude:cheap again to continue.`
