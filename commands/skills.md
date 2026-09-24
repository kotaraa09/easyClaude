---
description: Advanced - browse a catalogue of third-party skills by category and install the ones picked
argument-hint: (nothing) | design | security | testing | marketing | writing | status
disable-model-invocation: true
allowed-tools: Read, Bash, Glob
---

Requested: `$ARGUMENTS`

easyClaude ships one skill from outside: slopmonster, the prose linter, which is built in
and always on. It ships no design skill, no marketing skill, and no deep security or
testing skill. That is deliberate. Bundling one picks it for everybody and charges every
session for the pick. This command shows what exists, states what each one costs, scans it,
and installs only what the user asks for.

**Never run this during kickoff and never offer it unprompted.** A project builds fine
with none of these. The user came here on purpose.

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

If `$ARGUMENTS` names a category, show that section only. If it names nothing, list the
category names with one line each and ask which one.

## 3. State the cost before the choice, not after

Warning: an installed skill is not free. Claude Code loads the name and description of
every installed skill into every turn of every session, used or not. That is roughly 25 to
60 tokens each.

So a marketplace with 50 skills costs somewhere near 1,200 to 3,000 tokens on every turn,
against 901 for this entire framework. Say that figure out loud whenever an entry carries
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

For a marketplace, hand the user this to type - it is a slash command, so you cannot run
it yourself:

```
/plugin marketplace add <owner>/<repo>
```

Then `/plugin`, and install the named plugins from the list.

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
