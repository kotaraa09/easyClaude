---
description: Recommend third-party skills that fit this project, scan them, and install the ones picked
argument-hint: (nothing - fits the project) | <a category to browse instead> | status
disable-model-invocation: true
allowed-tools: Read, Bash, Glob
---

Requested: `$ARGUMENTS`

easyClaude ships one skill from outside: slopmonster, the prose linter, which is built in
and always on. It ships no design skill, no marketing skill, and no deep security or
testing skill. That is deliberate. Bundling one picks it for everybody and charges every
session for the pick. This command shows what exists, states what each one costs, scans it,
and installs only what the user asks for.

A project builds fine with none of these. kickoff offers the ones that fit once, at the end of
setup, and otherwise this runs only when the user types it.

For `status`, run step 1 only and stop.

## 1. Say what is already installed

```bash
ls ~/.claude/skills 2>/dev/null; ls .claude/skills 2>/dev/null; ls ~/.claude/plugins 2>/dev/null
```

Report what is there before suggesting anything. Two skills that describe the same job
compete for the same turn, and the wrong one wins some of them. A second design skill on
a machine that already has one is the most common way to cause that.

## 2. Read the catalogue

```bash
cat ${CLAUDE_PLUGIN_ROOT}/reference/skills-catalogue.md
```

It holds every entry, the licence, the skill count, the install command, and the reason
each one is or is not recommended. Do not recommend anything that is not in it, and do not
restate an entry from memory - the counts and licences in that file were checked against
the source and yours were not.

**With nothing after the command, work out the project yourself.** The user should not need to
know the category names. Read `CLAUDE.md` and `docs/PRD.md`, and look for the markers that
say what it is: `project.godot` (a Godot game), `ProjectSettings/` (Unity), `*.uproject`
(Unreal), a game library in `package.json` such as phaser or three, `pubspec.yaml` (a Flutter
app), `index.html` or a web framework (a website or web app). Then say in one line what you
take the project to be, and go straight to the entries that fit it: at most three, best first.

If `$ARGUMENTS` names a category, show that section instead.

Match the category to what the project is, not to what is in the list. Design skills are for
websites and apps. **Never tell the user that a skill made for another kind of project is
enough.** A user building a Godot game was told the design skills covered it; they do not.

## 2b. When no category fits, search, and say it was not checked

A game engine with no entry, a mobile app, a data pipeline, a microcontroller: say plainly that
the catalogue has nothing for it yet. Then offer to search. If they say yes:

```bash
gh api "search/repositories?q=<engine or stack>+claude+skill&sort=stars&per_page=10" --jq '.items[] | "\(.full_name) \(.license.spdx_id) \(.stargazers_count) \(.pushed_at)"'
```

With no `gh`, use a web search for "<engine or stack> Claude Code skill". Show at most three:
an open licence, pushed in the last six months, and the number of skills each one installs.
Mark each one **not in the catalogue, not checked by easyClaude**. Step 5 applies to them as to
anything else.

## 3. State the cost before the choice, not after

Warning: an installed skill is not free. Claude Code loads the name and description of
every installed skill into every turn of every session, used or not. That is roughly 25 to
60 tokens each.

So a marketplace with 50 skills costs somewhere near 1,200 to 3,000 tokens on every turn,
which can be more than this entire framework costs. Say that figure out loud whenever an entry carries
a bold skill count.

Then give the rule that follows from it: **add the marketplace, install the plugins.**
Adding a marketplace costs nothing and lists what is inside. Installing from it is the
part that charges, and almost nobody needs all fifty.

## 4. Ask which one, and wait for the answer

Ask one question naming the real options. Wait for the answer. Do not install anything
before it arrives, and never install a second item because it seemed related.

Nothing is installed in this step. The answer only decides what gets scanned next.

## 5. Scan it before it is installed. This step is not optional.

Nothing from this catalogue gets installed without a scan. NVIDIA measured this ecosystem
and found roughly a quarter of skills carry vulnerabilities and a twentieth look
deliberately hostile. A catalogue with no scanner in front of it is a list of things to
trust because we said so.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/skillscan.mjs <path-or-url>
```

It runs NVIDIA SkillSpector in static mode, so the skill's file contents stay on the
machine and no API key is needed. Read what it prints, out loud, before anything else
happens:

- **SAFE** - install it. Static analysis is a floor and not a guarantee, so say that too.
- **CAUTION** - show the findings and ask again. Do not treat this as a yes.
- **DO NOT INSTALL** - stop. Do not install it, and do not offer the override as a way past
  a real finding. If the user believes the score is wrong, they read the findings and say why.
- **SkillSpector is not installed** (exit 3) - it fails closed on purpose. Show the install
  instructions it printed. `--allow-unscanned` exists for a user who decides otherwise,
  and it prints that the skill was never checked. Never add that flag on your own initiative.

SkillSpector itself is not bundled. It is a 5MB Python program with a Docker image, against
a plugin that ships Node built-ins and nothing else, so it gets called where it lives.

Scan what will actually be installed. For a repository, that means the URL or a local
clone. A marketplace holds many plugins, so scan the plugin the user picked, not the
marketplace, and say plainly when only part of what they are adding got scanned.

## 6. Install what the scan cleared, and nothing else

Warning: every command below downloads and installs third-party code. Show the command,
get a yes, then run it. Never run one to "check" what it does.

Two install shapes appear in the catalogue:

```bash
npx skills@latest add <owner>/<repo>
```

For a marketplace, run Claude Code's own command line, which installs one plugin by name:

```bash
claude plugin marketplace add <owner>/<repo>
claude plugin install <plugin>@<marketplace name>
```

The marketplace name is the `name` field in the repository's `.claude-plugin/marketplace.json`,
which is not always the repository's name. This works in the desktop app as well, where typing
`/plugin` opens a browsing screen and a user who has never seen it does not know what to press.

Only if `claude` does not run in a shell here, hand the user the slash commands to type:
`/plugin marketplace add <owner>/<repo>`, then `/plugin`, and install the named plugin from
the list.

## 7. Watch for the two collisions

`hooks/hooks.json` owns `SessionStart`, `UserPromptSubmit` and `Stop`. If something installs
a hook on any of them, say so plainly and let the user decide which wins. Do not edit their hooks to make room.

If the new skill overlaps one easyClaude already ships - the catalogue names which ones do
- say which is stricter and let both stand, or let the user drop ours. Do not quietly
assume the new one replaces it.

## 8. Close

One line naming what is installed, one line saying it goes live on the next session start,
and stop. Do not start using a newly installed skill in the same turn.

Design references are a separate thing and are not installed here: `/easyclaude:connect`
offers the **inspo** MCP server, which searches real production sites for examples, and
**playwright**, which drives a real browser.
