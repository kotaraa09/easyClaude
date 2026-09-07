---
name: ship
description: Commit finished work on a branch, update state and decisions, and open a pull request. Use when the user says ship it, commit, push, open a PR, or that a feature is finished.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Ship

## 1. Refuse to ship broken work

Run `.claude/verify.json` first. If anything fails, stop and report it. Shipping red is the one thing this framework exists to prevent.

## 2. Never commit to the default branch

Check the current branch. If it's `main`/`master`, create a branch first, named for the work.

## 3. Review your own diff before committing

Read `git diff`. Look specifically for: debug statements, commented-out code, hardcoded secrets or URLs, stray TODOs, and files that shouldn't be tracked (`.env`, build output, editor config). Fix them now.

## 4. Commit

One commit per logical change. The message says **why**, not what — the diff already says what.

## 5. State, then PR

- Move finished tasks to `## Done` in `docs/STATE.md`.
- Open the PR with a body covering: what changed, why, how to test it, and anything left in `## Debt`.

## 6. Before a repo goes public or deploys for the first time

Tell the user to run `/easyclaude:security-check` first, and wait. A first publish is when leaked
keys stop being theoretical, and history keeps what a deleted file does not. You cannot invoke it
for them - it is opt-in precisely so it costs nothing on the turns it isn't needed.

## 7. Confirm before anything leaves the machine

Pushing and opening a PR are outward-facing. Say what you're about to push and where, and get a yes — unless the user already told you to push in this turn.
