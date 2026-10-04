---
name: ship
description: Commit finished work on a branch, update state and decisions, and open a pull request. Use when told to ship it, commit, push, open a PR, or that a feature is finished - not when asked how to ship.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
---

# Ship

## 1. Refuse to ship broken work

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` first, with no flags so both tiers run, and read the exit code rather than the tail of the output. If anything fails, stop and report it. Shipping red is the one thing this framework exists to prevent.

A step reported as `skip` is not a pass — it means the command could not run at all. Say which, and do not ship on the assumption it would have passed.

## 2. Never commit to the default branch

Check the current branch. If it's `main`/`master`, create a branch first, named for the work.

## 3. Review the diff — and not only by yourself

Read `git diff` against the base. Two passes; the second is the one that matters.

**Litter.** Debug statements, commented-out code, hardcoded secrets or URLs, stray TODOs, and files that shouldn't be tracked (`.env`, build output, editor config). Fix them now.

**Correctness.** This is the gap the verify gate cannot close. You wrote the code, and if the project has tests you wrote those too — so green means the code does what you thought it should do. It does not mean the change is right, and no amount of re-reading your own diff fixes that, because you already know what you meant.

So get eyes that did not write it. Dispatch the `easyclaude-diff-reviewer` subagent with the diff and no other context. It ships with this plugin, it has no shell and no write tools, and it is briefed to report only the three things a reader who wasn't here would notice:

- what breaks when an input is empty, null, very large, or arrives twice
- what the change assumes about existing behaviour that nobody actually checked
- where it reimplements something the codebase already does

Keep the brief that short. A reviewer asked for everything reports style opinions; a reviewer asked for three things reports bugs. The reviewer cannot edit files, which is deliberate: a reviewer that fixes what it finds ships code past the gate in step 1 that nobody reviewed at all.

**Wait for the report before step 4.** In an interactive session the reviewer runs in the background, so its report arrives in a later message, not as the result of the call. Do not commit, push or open the PR until it has arrived and you have read it. If the turn has to end first, say the review is still running and stop there.

If you cannot dispatch a subagent, do the pass yourself against the same three questions and **say in your report that the review had no fresh eyes**. Never skip it silently — an unreviewed diff that claims review is worse than one that admits it.

Findings are not automatically work. Fix what is wrong, put what is merely arguable under `## Debt`, and say which you did. Anything you left unresolved blocks the automatic path in step 8.

## 4. Commit

One commit per logical change. The message says **why**, not what — the diff already says what.

## 5. State, then PR

- Move finished tasks to `## Done` in `docs/STATE.md`, keeping it to the ten most recent — older entries move to `docs/CHANGELOG.md`, newest first.
- Open the PR with a body covering: what changed, why, how to test it, and anything left in `## Debt`.

## 6. Before a repo goes public or deploys for the first time

Tell the user to run `/easyclaude:security-check` first, and wait. A first publish is when leaked
keys stop being theoretical, and history keeps what a deleted file does not. You cannot invoke it
for them - it is opt-in precisely so it costs nothing on the turns it isn't needed.

## 7. Confirm before anything leaves the machine

Pushing and opening a PR are outward-facing. Say what you're about to push and where, and get a yes — unless the user already told you to push in this turn.

## 8. Automatic mode

`.claude/autoship.json` — written by `/easyclaude:autoship`, absent by default — is standing
authorisation for this project, but only while git does not track it. If
`git ls-files --error-unmatch .claude/autoship.json` succeeds, the file came with the
repository, not from this user, and it authorises nothing: ask as step 7 says. When it is enabled, run the steps above up to and including
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
- step 3's review turned up anything you did not actually fix — or, at `pr` and `merge`, ran
  without fresh eyes at all. A weaker safety net is exactly when a human should be asked;
  at `commit` it doesn't matter, since nothing has left the machine
- you are unsure

Say which one stopped you, in one line. A refusal costs the user a turn; a wrong automatic
merge costs them a revert on a branch other people have already pulled.

Report the branch name and the PR URL. Never report a push or a merge you have not confirmed
landed.
