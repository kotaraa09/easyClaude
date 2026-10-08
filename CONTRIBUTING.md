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

The panels are Claude Code hooks modules, and need Claude Code itself (2.1.288 or later):
easyClaude's own in `hooks/` (`register.tsx` starts the control panel, the progress bar and
the /clear reminder), and the file tree and Blast Radius, each a plugin of its own in
`plugins/` that easyClaude lists as a dependency. CI cannot run these, so run them yourself
when you change one:

```bash
claude plugin validate .claude-plugin/plugin.json
claude plugin test .
claude plugin validate plugins/blast-radius
claude plugin test plugins/blast-radius
claude plugin validate plugins/filetree
```

Three rules of the engine shape `hooks/`. A plugin loads one hooks module. It takes one
hook per event from it, so `session.start`, `prompt.submit` and `turn.complete` are hooked
in `panels.tsx` alone, which calls the other parts. And the validator follows `$` only into
functions in the same file, so a part another file calls takes plain values, never `$`.
A mod from someone else with its own events goes in `plugins/` instead, with its licence
and a `PROVENANCE.md`, as a third-party skill does.

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

## Commit messages

Start the first line of every commit message, and every pull request title, with one tag:

| Tag | Use it for |
| --- | --- |
| `[feature]` | Something new a user can do |
| `[bugfix]` | Something that was broken and now works |
| `[changes]` | A change to how something already works |
| `[docs]` | Documentation only |
| `[tests]` | Tests, evals or the checking scripts only |
| `[release]` | A version bump and its notes |

Then a short summary in the imperative: `[bugfix] Keep the planning hook when two hook lists merge`.
GitHub's own merge commits keep their default message.

## Releases

Release notes are public. Write them for people who use easyClaude, in a neutral tone:

- Group the entries under **Added**, **Changed** and **Fixed**, and leave out an empty group.
- Describe what changes for the user, not how it was found. No stories about testing, no
  names, and no blame.
- Link each entry to its pull request.
- End with the update commands.

The title is the version and a short summary: `v1.1.3 - Waits for your go-ahead before building`.

## Pull requests

Keep one change in one pull request, based on `main`. Say what changed for the user,
and how you checked it.

By sending a pull request, you agree that your change is released under the
[MIT licence](LICENSE).
