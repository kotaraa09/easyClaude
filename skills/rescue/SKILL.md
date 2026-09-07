---
name: rescue
description: Recover from a change that went wrong — undo edits, restore deleted files, get back lost commits, or escape a broken merge or rebase. Use when the user says to undo it, revert, go back, start over, or that something was lost, deleted, overwritten or messed up.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Rescue

Someone is anxious and wants it fixed now. The job is to be calm, find out what actually happened, and choose the reversible option.

**Almost nothing is truly lost.** Git keeps unreachable commits in the reflog for around 90 days. Most "I destroyed everything" turns out to be one command away.

## 1. Stop before doing anything

Say this first: **stop making changes.** Every extra command is another thing to undo, and panic-typed commands are what turn a recoverable mess into a real one.

## 2. Find out where things actually stand

Look before you touch. Run all of these and read them properly:

```bash
git status
git log --oneline -10
git stash list
git reflog -20
```

`git reflog` is the important one — it records every position HEAD has held, including commits no branch points at any more. That's where "lost" work usually is.

## 3. Snapshot before recovering

Recovery can go wrong too. Take a free, throwaway safety net first:

```bash
git stash -u          # if there are uncommitted changes worth keeping
git branch backup-$(date +%Y%m%d-%H%M)   # pins the current position
```

Then say what you are about to run, what it will change, and **what it will destroy** — and get a yes before running it.

## 4. Pick the fix for the actual situation

| Situation | Fix |
|---|---|
| Unwanted edits, not yet committed | `git restore <file>` — per file, so the rest survives |
| Want them back later, just not now | `git stash -u` — fully reversible |
| Bad commit, already committed | `git revert <sha>` — makes a new commit that undoes it |
| Bad commit, already pushed | `git revert` then push. **Never force-push a shared branch** |
| Commits seem to have vanished | `git reflog`, find the sha, then `git branch rescue-work <sha>` |
| Deleted a file | `git restore <path>`, or `git checkout <sha> -- <path>` if older |
| Merge or rebase went wrong | `git merge --abort` / `git rebase --abort`; afterwards, `git reset --keep ORIG_HEAD` |
| On the wrong branch with good work | `git stash`, switch, `git stash pop` |

**Always prefer the additive option.** `git revert` adds a commit; `git reset --hard` deletes work with no undo. easyClaude denies `reset --hard`, `clean -fdx` and force-push in `permissions.deny` for exactly this reason — they are the commands that turn a recoverable situation into a permanent loss. If one is genuinely the only route, explain precisely what will be destroyed and let the user run it themselves.

## 5. When it isn't in git at all

The hard case. In rough order of odds:

- **Editor local history.** VS Code keeps its own: `File > Open Recent`, or the Timeline view on a file. This recovers more work than anything else here.
- **The file is still open** in an editor tab — undo may still reach back before the deletion. Do not close that tab.
- **OS-level:** Windows File History or a previous version of the folder; macOS Time Machine.
- **The build output.** `dist/`, `.next/`, a running dev server's memory, or a browser tab may still hold a compiled copy of code that no longer exists on disk.

Then, immediately: `git init` and commit. Say plainly that this was recoverable only by luck.

## 6. Afterwards

- Confirm the recovery worked — run the verify contract, don't just look at `git log`.
- Reconcile `docs/STATE.md` with reality if tasks moved backwards.
- If work was genuinely lost, say so plainly and help rebuild it. Do not imply a recovery was complete when it wasn't.

## Prevention, said once and briefly

Commit before anything risky. A commit takes seconds and makes every situation in the table above trivial. `/easyclaude:ship` branches automatically; the danger is long stretches of uncommitted work on `main`.

Say this once, after the rescue. Nobody wants a lecture mid-panic.
