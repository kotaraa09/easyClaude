# Provenance

This mod is **vendored third-party code**, adapted for easyClaude.

| | |
|---|---|
| Source | https://github.com/JohnnyVizz/claude-kit, folder `plugins/savvy-progress` |
| Pinned commit | `272a877f39b6971690e087b16a7cc3951b811e39` (version 1.2.0) |
| Vendored | 2026-10-08 |
| License | MIT - see `LICENSE` |
| Contains | **executable code**: a Claude Code hooks module. It runs no commands and reads no files |

`LICENSE` must ship with this folder. The MIT licence requires its copyright and
permission notice to travel with every copy.

## Changed from upstream

The drawing is upstream's: the pixel bar, the crabs, the helper cards, the price table.
What feeds it changed.

- **The two tools are gone.** Upstream registers `progress` and `step`, tools the model
  calls to report a plan. A tool's description is sent with every message, so both would
  add to the cost of every request. The bar reads the request record that
  `hooks/panels.tsx` already keeps from Claude's own step list (TodoWrite and the Task
  tools) instead, and adds nothing to any request.
- **The bar follows every request**, from the moment it is sent: its first words, the steps
  done out of the steps planned, and on the right the share done, the actions so far, or
  the time it took. Upstream showed it only for its own `savvy-flow` skill. Phases, which
  only that skill reported, were removed with it.
- **The panel is the progress panel.** Upstream listed the tasks its planning tool reported
  as dimmed crabs under the helpers. Here the request comes first: its cost, actions and
  time, then each step of Claude's own step list as a row in that style, or the latest
  actions when Claude keeps no list, then the helpers.
- **The panel opens on the session's first helper**, once; after that, `/easyclaude-helpers`
  or the Details button on the bar opens it. The button is on every request, with `×N` once
  helpers run. Upstream showed only `×N`, opened the panel for `savvy-` helpers only, and
  named the command `/agents-info`.
- **The picture bar is drawn on the desktop only.** Upstream drew it wherever the surface's
  table has `Svg`, which includes the terminal, and a plain terminal showed an empty row with
  only the close button. A terminal now gets upstream's text bar.
- English only. Upstream also spoke Russian, chosen by a `language` setting.
- The `$.state` values belong to easyClaude: `agents`, `agentsPanel` and `agentsNow`.
- `session.start` and `turn.complete` are hooked in `hooks/panels.tsx`, which registers
  `/easyclaude-helpers` and marks a helper done when its turn ends: Claude Code takes one
  hook per event from a plugin.

## Updating

Compare the drawing functions with a newer commit and take their fixes by hand. The feed
is easyClaude's own and stays. Update the commit here.
