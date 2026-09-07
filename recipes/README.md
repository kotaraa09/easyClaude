# Stack recipes

Recipes are **data, not scaffolding**. easyClaude doesn't ship project templates — it adapts to whatever stack it lands in. A recipe tells `kickoff` three things: how to recognise the stack, how to verify it, and what usually goes wrong.

## Writing a new one

Copy this shape into `recipes/<stack>.md`. Keep it under a page.

```markdown
# <Stack>
**Detect:** <marker files that identify this stack>
**Verify steps:** <name + command, each exiting non-zero on failure>
**Verification strength:** strong | compile-only | none — and why
**Pitfalls:** <3-6 things Claude gets wrong on this stack>
**Setup:** <commands for a greenfield project>
```

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
