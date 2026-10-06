# Contributing

Thank you for helping. easyClaude is for people who do not write code, so every change is
judged by one question: does it make Claude better for them, at a cost they can see?

## Before you start

- For a bug, open an issue with the steps to make it happen.
- For a new feature, open an issue first. [ROADMAP.md](ROADMAP.md) says what comes next and
  why, and a feature outside it may not fit.
- For a security problem, do not open an issue. See [SECURITY.md](SECURITY.md).

## Run the checks

You need Node.js 22. There are no dependencies to install.

```bash
node scripts/validate.mjs   # the plugin's structure and its stated costs
node scripts/test.mjs       # the checking machinery, about 25 seconds to 5 minutes
```

Both must pass. CI runs them on Linux and Windows for every pull request.

The panels in `hooks/panels.tsx` are a Claude Code hooks module, and need Claude Code itself
(2.1.288 or later). CI cannot run these, so run them yourself when you change the panels:

```bash
claude plugin validate .claude-plugin/plugin.json
claude plugin test .
```

The first time Claude Code loads the plugin, it writes the API's types to
`.claude-plugin/types/` (ignored by git), and `tsc -p .` then type-checks the panels.

**Look at the panels before you release a change to them.** The tests read what a panel
contains, not how it looks, and two releases went out with faults anyone would see on
screen. In a Claude Code session, load the `plugin-authoring` skill (it names a dev-mods
folder for the session), then run `node scripts/preview-panels.mjs <that folder>`. A copy
called `easyclaude-preview` loads beside your installed easyClaude once you allow hot
reloading; check it in the desktop app and in a terminal.

## Rules for a change

- **Keep the per-turn cost down.** Every rule, skill description and agent description is
  paid on every turn. `skills/registry.json` sets a ceiling, and the build fails above it.
  If the README quotes a cost, update it with your change.
- **Measure behaviour, do not assume it.** An instruction in a skill does not always change
  what Claude does. A change to behaviour needs a case in [`evals/`](evals/README.md).
- **Write for beginners.** Text a user sees uses short sentences and plain words.
  Change [README.th.md](README.th.md) when you change [README.md](README.md), or say in the
  pull request that it still needs a translation.
- **No new dependencies.** Scripts use only Node's built-ins.
- **Third-party skills** need a `PROVENANCE.md` and their licence. See
  [`skills/slopmonster/`](skills/slopmonster/) for an example.

## Pull requests

Keep one change in one pull request, based on `main`. Say what changed for the user,
and how you checked it.

By sending a pull request, you agree that your change is released under the
[MIT licence](LICENSE).
