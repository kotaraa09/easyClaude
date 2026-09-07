---
description: Turn automatic commit/push/PR/merge on or off, after checking git is actually set up for it
argument-hint: on | off | status  (default: status)
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash
---

Requested: `$ARGUMENTS` — treat an empty value as `status`.

Automatic shipping is **off until the user turns it on here**. Never enable it because a
turn went well, and never enable a tier the preflight below says can't work.

## 1. Preflight — check, don't assume

Run all of these and build a table. Each is one command; none of them change anything.

| Need | Command | Failure means |
|---|---|---|
| A repo | `git rev-parse --is-inside-work-tree` | not a git repo — offer `git init` |
| An identity | `git config user.name` / `git config user.email` | exit 1 = unset; commits will fail |
| A remote | `git remote` | empty = nothing to push to |
| GitHub CLI | `gh --version` | not installed — commit and push still work, PR and merge don't |
| Authenticated | `gh auth status` | exit 1 = not logged in; `gh auth login` fixes it |
| Write access | `gh repo view --json viewerPermission` | `READ` means you cannot merge |
| Base branch | `gh repo view --json defaultBranchRef` | this is what PRs target |

Report each as pass or fail in one line. Never report a check you didn't run.

## 2. Offer only the tiers that can actually work

The levels are cumulative — each includes the ones above it:

| Level | Does | Needs |
|---|---|---|
| `commit` | branch, review the diff, commit | identity |
| `push` | + push the branch | remote + credentials |
| `pr` | + open a pull request | `gh` + auth |
| `merge` | + merge it and sync local | write access |

**Ask which level they want, and say what each one gives up.** The honest framing:

- `commit` and `push` are recoverable. A bad commit is one `git revert` away.
- `pr` is where other people start seeing the work.
- `merge` removes the last human checkpoint. Nothing reviews the change before it lands
  on the base branch. Recommend it only for solo projects, and say so out loud.

If the preflight ruled a level out, don't offer it — say which check failed and what
would fix it.

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

`through` is one of `commit`, `push`, `pr`, `merge`. `base` comes from the preflight, not
from a guess.

Add `.claude/autoship.json` to `.gitignore` if it isn't there. It is per-person
authorisation to push on their behalf — committing it would hand that to everyone who
clones the repo without them ever agreeing to it.

For `off`: set `"enabled": false` — keep the file so `status` can still show what the
last choice was. Confirm in one line.

For `status`: print the current level and re-run the preflight, since a token can expire
or access can be revoked long after this was armed.

## 4. Tell them how it fires

Close with exactly this shape, filled in:

```
Autoship is ON through <level>. It fires only when all of these are true:

  · every verify step passed
  · docs/STATE.md has nothing left under Now, Next, or Blocked
  · the change didn't touch auth, payments, or a migration

Anything else and it stays quiet and hands back to you.
Turn it off with /easyclaude:autoship off
```

Then stop. Do not ship anything in the same turn you armed it.
