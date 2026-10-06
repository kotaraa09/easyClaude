---
description: Choose how far Claude may ship without asking - off, commit, push, pr or merge - after checking git is set up for it
argument-hint: off | commit | push | pr | merge | status  (default: status)
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash
---

Requested: `$ARGUMENTS` — treat an empty value as `status`, `full` as `merge`, and `on` as
a request to choose: show the five levels below, recommend one, and stop.

Automatic shipping is **off until the user picks a level here**. Never pick one for them
because a turn went well, and never set a level the preflight below says can't work.

The levels build on each other. Each one is a question Claude stops asking:

| Level | Claude does this without asking | Needs |
|---|---|---|
| `off` | nothing: it asks before each step | - |
| `commit` | commits finished work on a work branch | git, with a name and email |
| `push` | + pushes the branch | a remote you can push to |
| `pr` | + opens a pull request, once per branch | `gh`, logged in |
| `merge` | + merges it once its checks pass | write access |

## 1. No git, no autoship

Run `git rev-parse --is-inside-work-tree` first. If it fails, this folder is not a git
repository and autoship cannot work here at all. Say so in one plain line, write nothing,
and stop. If a `.claude/autoship.json` exists anyway, it does nothing: easyClaude ignores it
outside a git repository.

## 2. Preflight — check, don't assume

For any level except `off`, run the checks that level needs, and only those. Each is one
command; none of them change anything.

| Need | Command | Failure means |
|---|---|---|
| An identity | `git config user.name` / `git config user.email` | exit 1 = unset; commits will fail |
| A remote | `git remote` | empty = nothing to push to |
| GitHub CLI | `gh --version` | not installed — commit and push still work, PR and merge don't |
| Authenticated | `gh auth status` | exit 1 = not logged in; `gh auth login` fixes it |
| Write access | `gh repo view --json viewerPermission` | `READ` means you cannot merge |
| Base branch | `gh repo view --json defaultBranchRef`, else `git symbolic-ref --short refs/remotes/origin/HEAD` | this is what PRs target |

Report each as pass or fail in one line. Never report a check you didn't run.

If a check rules out the level asked for, do not set it. Say which check failed and what
would fix it, name the highest level that does work, and ask whether to set that one.

At `merge`, say once, plainly: nothing reviews the change after Claude's own review before
it lands on the base branch. It suits a project you work on alone.

## 3. Write the config

`.claude/autoship.json`:

```json
{
  "enabled": true,
  "through": "pr",
  "base": "main",
  "armed_on": "<today>"
}
```

`through` is the level. `base` comes from the preflight, not from a guess.

Add `.claude/autoship.json` to `.gitignore` if it isn't there. If git already tracks it,
run `git rm --cached .claude/autoship.json` too: easyClaude ignores a tracked copy, because
it came with the code and not from this user. It is one person's permission to push on
their behalf — committing it would hand that to everyone who clones the repo.

For `off`: set `"enabled": false` — keep the file so `status` can still show the last level.
Confirm in one line.

For `status`: say the current level (`off` if the file is missing or disabled) and re-run
the preflight for it, since a token can expire or access can be revoked long after it was
set. If git tracks the file (`git ls-files --error-unmatch .claude/autoship.json` succeeds),
say autoship is OFF: a tracked copy came with the code, and easyClaude ignores it.

## 4. Tell them what changes

Close with exactly this shape, filled in for the level:

```
Autoship is set to <level>. From your next message, when Claude finishes what you asked
and the checks pass, it will <the steps for this level> without asking you.

It still stops and asks when:
  · a check fails
  · the change touches sign-in, payments, or a database migration
  · you tell it to wait

Change it any time with /easyclaude:autoship off | commit | push | pr | merge
```

Then stop. Do not ship anything in the same turn you set it.

For the rest of this session, act on the level from the user's next message: do each step
it covers when a request is finished and the checks pass, and do not ask about those steps.
Never commit on the base branch itself. At `pr` and `merge`, have the
`easyclaude-diff-reviewer` subagent read the branch diff once before the pull request opens
or the merge, and fix what it finds. After `off`, ask before each step again. Later sessions
get the same rule from the session opener.
