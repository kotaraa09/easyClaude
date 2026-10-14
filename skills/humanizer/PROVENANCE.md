# Provenance

This skill is **vendored third-party prose**, not written for Mellu.mate.

| | |
|---|---|
| Source | https://github.com/blader/humanizer |
| Pinned commit | `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8` (skill version 3.1.0) |
| Vendored | 2026-10-11 |
| License | MIT - see `LICENSE` |
| Author | Siqi Chen |
| Contains | **no executable code.** One Markdown file of instructions |

## Attribution obligations - do not strip these files

`LICENSE` must ship with this directory. The MIT licence requires the copyright notice and
permission notice to travel with any redistribution, which is what publishing this plugin
does. The skill credits its own source, Wikipedia's "Signs of AI writing", inside `SKILL.md`.

## What was vendored, and what was left behind

Taken: `SKILL.md` and `LICENSE`, both stored with LF line endings, as `.gitattributes` asks.
`LICENSE` matches upstream (git blob `625297fb`) apart from that. `SKILL.md` matched too
(`19fc6342`) before one change: its frontmatter is folded
to plain `key: value` lines, because `scripts/validate.mjs` reads no other form. The
description keeps every word; the `license: MIT` line and the `metadata: version: "3.1.0"`
block are dropped (the licence is in `LICENSE`), and the
version is recorded above instead. The body is unchanged.

Left behind: `README.md`, `CHANGELOG.md`, `AGENTS.md`, `agents/`, `scripts/`, `.github/`, and
the `.claude-plugin/` and `.cursor-plugin/` manifests. The skill refers to none of them.

## Why it replaced slopmonster

slopmonster sat here from 2026-09-19 to 2026-10-11, kept by request against the registry bar:
it needed Python, which nothing else in Mellu.mate uses, and its cleanse step sent the draft
to a second model provider and billed for it. humanizer does the same job, rewriting text so
it does not read as AI-written, as instructions alone. It needs no runtime, sends nothing
anywhere, and passes the bar on every line. The owner asked for the swap.

What is lost: slopmonster's linter gave a score out of 5 that a person could check. humanizer
has no score; Claude judges the text against its numbered patterns.

## Updating it

Re-vendor from a new commit only after reading the diff. Update the pinned commit here and in
`skills/registry.json`, and run the two trigger cases in `evals/` that name it.
