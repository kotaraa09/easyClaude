# Provenance

This skill is **vendored third-party code**, not written for easyClaude.

| | |
|---|---|
| Source | https://github.com/h3nryprod01/design-taste |
| Pinned commit | `c3596bc7a03d7e5867a92908270efb609add0658` |
| Vendored | 2026-09-07 |
| License | MIT (synthesis) — see `LICENSE` |
| Contains | prose only; no scripts, no executables, no binaries |

## Attribution obligations — do not strip these files

`LICENSE`, `NOTICE`, and `LICENSES/Apache-2.0.txt` must ship with this directory.

The synthesis is MIT, but the `reference/` files remain under their **upstream** licenses, and some are Apache-2.0. Section 4 of the Apache License requires the `NOTICE` file to travel with any redistribution — which is what publishing this plugin does.

Upstream sources, per `NOTICE`:

- **emilkowalski/skill** — MIT, Emil Kowalski
- **pbakaus/impeccable** — Apache-2.0, Paul Bakaus; itself derived from Anthropic's `frontend-design` skill (Apache-2.0)
- **leonxlnx/taste-skill** — Leonxlnx

## Why it's here

It's the one thing easyClaude's own design support was missing. `design/tokens.md` fixes *consistency* — one palette, one scale, applied everywhere. It says nothing about whether the result is any **good**. This skill carries specific, falsifiable taste rules (contrast ratios, easing curves, the eight interaction states, concrete anti-patterns) rather than generic advice, and it complements the tokens file instead of duplicating it.

## Updating

Re-vendor from a newer commit, update the SHA above and in `skills/registry.json`, and re-read the diff before accepting it. Never track a branch — a moving upstream is unreviewed code executing on user machines.

## One known friction

This skill bans em dashes in generated UI copy, calling them "the #1 AI tell." easyClaude's own documentation uses them freely. That's not a conflict — the rule governs copy written *into a user's product*, not our prose — but it will look inconsistent if you read both in one sitting.
