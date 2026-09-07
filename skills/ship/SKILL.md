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

## 8. Automatic mode

`.claude/autoship.json` — written by `/easyclaude:autoship`, absent by default — is standing
authorisation for this project. When it is enabled, run the steps above up to and including
its `through` level without asking again. That file **is** the yes step 7 asks for: the user
armed it deliberately and can revoke it with `/easyclaude:autoship off`.

Stop at the level. `push` means push and stop — do not open a pull request because it seemed
helpful.

At `merge`:

- `gh pr merge <n> --rebase` when the history is linear, `--squash` when the branch has messy
  intermediate commits. Match what the repo already does rather than imposing a preference.
- If the server refuses — branch protection, required reviews, failing checks — report the
  refusal and leave the PR open. Do not work around it. A protection lookup that errors means
  you could not tell, not that there is none: private repos on free plans answer `403`.
- After a merge lands, `git checkout <base> && git pull --ff-only` so the next session doesn't
  start on a stale branch.

**Refuse the automatic path** and hand back, even though the config says yes, when:

- any verify step failed
- the change touched authentication, payments, or a data migration
- `.claude/cheap-session` exists — cheap turns deliberately skip depth, which is the wrong
  input to an unreviewed merge
- step 3 turned up something you did not actually fix
- you are unsure

Say which one stopped you, in one line. A refusal costs the user a turn; a wrong automatic
merge costs them a revert on a branch other people have already pulled.

Report the branch name and the PR URL. Never report a push or a merge you have not confirmed
landed.
