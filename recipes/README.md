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
- **compile-only** — it builds, but nothing proves it behaves. Common for GUI-centric and game stacks.
- **none** — needs a device, an emulator, a GUI, or a paid service. Say so out loud; don't fake a gate.

An honest `compile-only` is worth more than an aspirational `strong` that never runs.

Contributions welcome — one recipe per PR.
