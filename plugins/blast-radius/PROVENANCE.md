# Provenance

This mod is **vendored third-party code**, adapted for easyClaude.

| | |
|---|---|
| Source | https://github.com/anthropics/claude-code-playground, folder `claude-code/mods/blast-radius` |
| Pinned commit | `569c5283d9a0a7ee7938df85bb32e4f48cbb8c86` (version 0.1.0) |
| Vendored | 2026-10-08 |
| License | Apache-2.0 - see `LICENSE` |
| Contains | **executable code**: a Claude Code hooks module that runs `git` and migration tools in dry-run form |

`LICENSE` must ship with this folder, and the copyright header at the top of
`blast-radius.mjs` must stay. Apache-2.0 section 4 also asks that a changed file says it
was changed: the header comment does, and the list below says how.

## What it does

When Claude is about to run a risky command - `rm -rf`, `git reset --hard`, `git clean`,
`git checkout -- .`, a force push, a database migration - it holds the command, works out
what it would delete or change, and asks the user to press Proceed or Cancel. Cancel
refuses the command and tells Claude not to retry it.

## Changed from upstream

- **It works on Windows.** Upstream waits with `sleep` and measures with `bash`. Windows
  has no `sleep`, and its `bash` can be WSL's, which sees other paths, so upstream refused
  every risky command there with an error. The wait is now a short Node process, and the
  folders are measured through Claude Code's own file calls (`$.fs`). Git Bash paths such
  as `/c/Users` are read as `C:/Users`.
- **It holds PowerShell commands too:** `Remove-Item` and its aliases (`rm`, `del`, `rd`,
  `ri`, `erase`, `rmdir`) with `-Recurse` or `-Force`, however shortened, and the same git
  commands as in Bash.
- **Nothing is held when nobody is at the screen** (a `-p` run or the SDK). Upstream would
  wait ten minutes and then refuse. Claude Code's own permission rules still apply there.
- **A very large folder is counted to 20,000 files**, then the report says "at least".

## Why it is a plugin of its own

Claude Code loads one hooks module per plugin and takes one hook per event from it, and
easyClaude hooks `tool.call` itself. As a plugin of its own, Blast Radius keeps its own
hooks. easyClaude lists it under `dependencies`, so it installs and updates with easyClaude.

`hooks/blast-radius.test.ts` is easyClaude's: it checks the Windows, PowerShell and no-hold
changes with `claude plugin test plugins/blast-radius`.

## Updating

Compare `classify`, the git measures and the drawing with a newer commit and take their
fixes by hand. Keep the four changes above. Update the commit here.
