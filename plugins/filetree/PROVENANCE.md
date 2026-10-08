# Provenance

This plugin is **vendored third-party code**, not written for easyClaude.

| | |
|---|---|
| Source | https://github.com/data-goblin/claude-code-filetree |
| Pinned commit | `da1da65724c54541f4a0ec5ddd26641b1a0d672a` (version 0.2.24) |
| Vendored | 2026-10-08 |
| License | MIT - see `LICENSE` |
| Contains | **executable code**: a Claude Code hooks module that runs `git`, `gh`, `du` and the system's open command |

`LICENSE` must ship with this folder. The MIT licence requires its copyright and
permission notice to travel with every copy.

## Why it is a plugin of its own

Claude Code loads one hooks module per plugin and takes one hook per event from it. The file
tree hooks events easyClaude hooks too (`session.start`, `tool.call`, `prompt.submit`), so
it cannot live inside easyClaude's module without being rewritten. As a plugin of its own
it runs as its author wrote it. easyClaude lists it under `dependencies`, so it installs
and updates with easyClaude.

## What was vendored, and what was left behind

Taken, unchanged: `.claude-plugin/plugin.json`, `hooks/` (six source files and
`hooks.json`), `types/index.d.ts` and `LICENSE`. Only the line endings changed, to LF.

Left behind: `README.md`, `media/` (6.5MB of GIFs), `tests/`, `scripts/`, `.githooks/`,
the CI workflow and the marketplace file.

## What it does on a machine

It lists the project folder through Claude Code's own file calls, runs `git status`,
`git diff --numstat` and similar read-only git commands to colour the tree, and works out
folder sizes with `du` (or a listing on Windows). When the user double-clicks a file, it
opens it with the system's default app. When a file is selected in the tree, it adds one
line naming that file to the user's next message, so "this" in the message points at it.
That line is the only text it adds to any request.

It shows in the sidebar, which in a terminal needs the fullscreen layout (`/tui fullscreen`)
and at least 110 columns.

## Updating

Copy the same files from a newer commit, update the commit here, and read the diff of every
file before accepting it. Never track a branch.
