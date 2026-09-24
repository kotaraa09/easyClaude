---
description: Cheapest working solution for this one request (this turn only)
argument-hint: <what you want done> — or leave empty to continue the previous cheap task
effort: low
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
---

Budget mode, **this turn only**. The user is low on credits and wants a working result now, not a good one.

<!-- This command does not switch model. It used to set "model: sonnet", but a cache
     belongs to one model, so a one-turn switch made the new model re-read the whole
     conversation at the cache-write price - and Sonnet 5 is half the price of Opus 5.5 per
     token, not a fifth. Measured on one task, staying on the session's model with these
     rules saved about a third, run after run. For a longer stretch, /easyclaude:cheap-session
     suggests /model sonnet once, and the saving then holds. The largest saving of all is a
     short conversation: scripts/prompt-check.mjs holds this command back when the
     conversation is long, until the user types /clear or /compact. -->

## The request

$ARGUMENTS

If the above is empty, continue the previous `/easyclaude:cheap` task under this same contract.

## Contract

- Ship the **narrowest thing that works**. Happy path only. No abstractions, no config surface, no defensive layers.
- Prefer editing one existing file over creating new ones. **No new dependencies.**
- No refactors. No doc updates. No writes to `docs/STATE.md`.
- The verify gate still runs when the turn ends. It costs wall-clock, not tokens, and a cheap fix that doesn't compile is not a fix.
- **Every step re-reads the whole conversation, so steps are the cost, not words.** Aim for three: one step that reads everything you need, one that makes every edit, one that reports.
- Read in one batch: locate with `grep`/`glob`, then read every file you will change in parallel, in the same step. Never read a file that is already in this conversation.
- Edit each file once, with all of its changes. Make independent edits in parallel.
- **Do not run the checks yourself.** The gate runs them when you stop, and sends you back if one fails. Running them first adds a step that the gate repeats.
- No screenshots.
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

Then one line saying that cheap mode applied to this turn only, and that `/easyclaude:cheap` starts it again. Write both lines in the language the user writes in; keep the command as written. A beginner who writes in Thai was given both lines in English, word for word, because this section asked for them "exactly".
