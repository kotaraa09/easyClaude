# Stack recipes

Recipes are **data, not scaffolding**. easyClaude doesn't ship project templates — it adapts to whatever stack it lands in. A recipe tells `kickoff` three things: how to recognise the stack, how to verify it, and what usually goes wrong.

## Writing a new one

Copy this shape into `recipes/<stack>.md`. Keep it under a page.

```markdown
# <Stack>
**Detect:** <marker files that identify this stack — primary marker first, in `backticks`>
**Verify steps:** <a `| name | cmd | tier |` table; each command exits non-zero on failure>
**Verification strength:** strong | partial | compile-only | none — and why
**Pitfalls:** <3-6 things Claude gets wrong on this stack>
**Setup:** <commands for a greenfield project>
```

## Detect — name the primary marker first

The **first** file in `backticks` on the `Detect:` line is the one kickoff looks for, and CI
checks that it appears in kickoff's marker list. Everything after it narrows the match and is
not used to find the recipe — including a marker that must be *absent*, the way `static-site`
reads "`index.html` at the root with no `package.json`". Put the identifying file first, then
add the marker to `skills/kickoff/SKILL.md`. A recipe kickoff cannot detect is a recipe nobody
ever opens.

## Tier — which steps the per-turn gate can afford

Every step is `fast` or `full`, and the column is mandatory so the call gets made rather than
defaulted into. `fast` steps run at the end of every turn, at the Stop hook. `full` steps run
when a task is finished and when shipping.

The recipes here start every step at `fast` and reserve `full` for the ones that are slow on
any machine — an Android `assembleDebug`, a Unity batch-mode boot, a production bundle. That
is a starting point, not a measurement: kickoff times each command on the actual project and
re-tiers anything over ~30 seconds, because a gate people wait on is a gate people delete.

Err toward `fast`. A single-tier contract is the stricter arrangement, and tiering exists to
keep slow suites *in* the contract rather than to thin it out — the failure it replaced was
dropping the slow half altogether. Note also that a contract where *every* step is `full` has
no per-turn gate at all; `verify.mjs` says so when it sees one.

## Verification strength — be honest here

This field sets user expectations and it is the field most worth getting right.

- **strong** — a real test suite runs headlessly and fast. The gate genuinely catches broken work.
- **partial** — some layers verify (logic, units) while others cannot (UI, device, rendering). Say which half is covered.
- **compile-only** — it builds, but nothing proves it behaves. Common for GUI-centric and game stacks.
- **none** — needs a device, an emulator, a GUI, or has no toolchain at all. Say so out loud; don't fake a gate.

An honest `compile-only` is worth more than an aspirational `strong` that never runs. A verify contract that always passes is worse than no contract, because it teaches everyone to ignore the gate.

## Shipped recipes

| recipe | strength |
|---|---|
| `go`, `rust`, `python-uv`, `node-typescript`, `nextjs`, `vite-react`, `flutter` | strong |
| `gradle-android` | partial |
| `unity` | compile-only, often none |
| `static-site` | none |

Contributions welcome — one recipe per PR.
