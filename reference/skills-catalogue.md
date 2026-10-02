# Skill catalogue (read only when `/easyclaude:skills` runs)

<!-- This file does NOT live in rules/ and is NOT a skill. Everything in rules/ loads on
     every turn of every session, and every skill's description does the same. This file
     loads when somebody types the command and never otherwise, which is the only reason
     it can afford to be this long.

     Every entry was checked against the GitHub API on 2026-09-19: the repository exists,
     the licence is the one GitHub reports, and the contents are what the entry claims.
     Star counts and skill counts are from that same day and will drift.

     Two entries are built in and the rest are not. "Already built in" below is shipped
     with this plugin and needs no decision. Everything under it is somebody else's
     repository, recommended rather than carried, so re-read one before installing it. -->

## Already built in

These two arrive with easyClaude. Nobody chooses them and nobody can skip them.

### slopmonster - the prose gate

The prose linter, vendored at a pinned commit into `skills/slopmonster/` and always on.
It scores copy out of 5 across five rule groups - AI vocabulary, AI constructions,
punctuation cadence, rule-of-three rhythm, invented proof - and exits red below 5/5. Say
"does this sound like AI" or "de-slop this" and it fires.

- MIT. **1 skill, 59 tokens per turn**, paid on every session whether there is prose or not.
- It needs Python for the linter, and bash for the optional cleanse step. On Windows the
  command is `python`, not the `python3` its own documentation says.
- The cleanse step sends your draft to a rival model CLI and that call is billed. The
  linter itself makes no network call at all. Both scripts were read in full before they
  were vendored; the notes are in `skills/slopmonster/PROVENANCE.md`.
- It scored this framework's own README at 2 out of 5 until that README was rewritten to
  pass. Note the limit that exposed: the catalogue is English only, so README.th.md scores
  5 out of 5 without the scorer reading a word of it.

### SkillSpector - the install gate

NVIDIA's security scanner for agent skills. It runs before anything in this catalogue is
installed, and it is not optional. NVIDIA's own survey of this ecosystem found roughly a
quarter of skills carry vulnerabilities and a twentieth look deliberately hostile.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/skillscan.mjs <path-or-url>
```

- Apache-2.0. 71 vulnerability patterns. Scores out of 100; above 50 is a refusal.
- It is **not** vendored and will not be. It is a 5MB Python program with a Docker image,
  against a plugin that ships Node built-ins and nothing else, so it is called where it
  lives. `uv tool install git+https://github.com/NVIDIA/skillspector.git` puts it there.
- It runs in static mode, so the scanned files stay on your machine and no API key is
  needed. One network call survives that mode: a CVE lookup against OSV.dev, which sends
  dependency names and versions and never file contents.
- It fails closed. No scanner means no install, unless somebody types `--allow-unscanned`
  and accepts a printed warning that the skill was never checked.

## The part the pitch leaves out

Nothing below this line is bundled, so none of it costs you anything until you install it.
The two above are already paid for.

After you install it, it costs you on every turn. Claude Code loads the name and
description of every installed skill into every turn of every session, whether the turn
needs it or not. The bill is roughly `(name + description) / 4` tokens per skill, which
lands between 25 and 60 tokens for a normal one.

That arithmetic is why some entries below carry a skill count in bold. A marketplace with
50 skills costs somewhere near 1,200 to 3,000 tokens on every turn.
**Installing one 50-skill marketplace can cost more than this
whole framework, forever, on projects that never use it.**

So: install a plugin, not a marketplace, wherever the repository allows it. Adding a
marketplace is free and lists what is inside. Installing from it is the part that charges.

## design

### hallmark - the light pick

Anti-slop design rules for building, auditing and redesigning a UI. Prose only: no
scripts, no binaries, no hooks, nothing that runs on your machine. It carries built-in
themes and refuses the hero-then-three-features shape every model reaches for.

- `npx skills@latest add nutlope/hallmark`
- MIT. **1 skill.** One large file, around 66KB, which loads only when the skill fires.
- Pick this if you mainly want the output to stop looking generic.

### impeccable - the heavy pick

The same design ground, plus a loop hallmark does not have: it drives a real browser,
screenshots what it built, critiques the screenshot, and fixes it.

- `/plugin marketplace add pbakaus/impeccable`, then `/plugin` and install it from the list
- Apache-2.0. **1 skill plus several agents.**
- Warning: it installs hooks and runs an engine binary that downloads itself on first use.
  Upstream's own README warns those hooks run whether or not the session approves the
  command they launch. `hooks/hooks.json` already owns `SessionStart`, `UserPromptSubmit` and `Stop`. Prefer
  the plugin route over `npx impeccable install`, which writes hooks directly.

### emilkowalski/skills - motion and interface craft

Animation and interface taste from the author of Sonner and Vaul. Separate skills for
reviewing animations, finding animation opportunities, picking a UI library, and Apple
design conventions.

- `npx skills@latest add emilkowalski/skills`
- MIT. **13 skills**, so budget roughly 400 to 700 tokens per turn if you take all of them.
- This is the one to add when motion is the weak part, not layout.

### UX/UI pro max - for people who want all of it

hallmark plus impeccable plus emilkowalski/skills, with the `inspo` and `playwright` MCP
servers from `/easyclaude:connect` underneath them.

Say this part out loud before anyone agrees to it. Two design skills with near-identical
descriptions will compete for the same turn, and the wrong one will win some of them.
Three design sources cost roughly 500 to 800 tokens on every turn. The two MCP servers add
their tool schemas on top. On a design-heavy project that is money well spent. On anything
else it is a standing tax on turns that never open a stylesheet.

Recommend it only when the user asks for the maximum and understands the bill.

## security

### trailofbits/skills

Security work from an actual security firm: static analysis, Semgrep rule authoring,
supply-chain risk auditing, insecure-default detection, variant analysis, vulnerability
triage. Split into separate plugins, so you install the two or three you need.

- `/plugin marketplace add trailofbits/skills`, then `/plugin` and pick from the list
- CC-BY-SA-4.0. **44 plugins.** Do not install all of them.
- Worth starting with: `static-analysis`, `insecure-defaults`, `supply-chain-risk-auditor`.
- Overlap to name honestly: easyClaude already ships `/easyclaude:security-check`, which
  is a pre-release sweep. These are audit tools in a different weight class, and several
  want external programs such as Semgrep installed. They do not replace each other.

## testing

### mattpocock/skills

Engineering skills including a TDD skill that refuses to let production code get written
before a failing test. Also code review, bug diagnosis, domain modelling, and merge
conflict resolution.

- `/plugin marketplace add mattpocock/skills`, then `/plugin` and pick from the list
- MIT. **19 engineering skills** plus other groups. Install the ones you want, not the set.
- Overlap to name honestly: easyClaude already ships `write-tests` and `debug`. The TDD
  skill is stricter than `write-tests` and will argue with a build-first habit, which is
  the point of it.

### trailofbits/skills, testing half

The same marketplace as above carries `mutation-testing`, `property-based-testing` and
`testing-handbook-skills`. Reach for these when a suite passes and nobody trusts it.

### anthropics/skills, webapp-testing

Drives a local web application through Playwright to test it. Check whether your Claude
Code already ships this before installing it; several Anthropic skills come built in.

- `/plugin marketplace add anthropics/skills`

## marketing and copy

### coreyhaines31/marketingskills

Fifty marketing skills: copywriting, SEO audit, pricing, CRO, cold email, launch,
positioning, analytics, ads.

- `/plugin marketplace add coreyhaines31/marketingskills`, then `/plugin`
- MIT. **50 skills.** This is the entry the cost warning above was written for. Install the
  three or four that match the work, and leave the other forty-six out.

### AgricIDaniel/claude-seo

SEO only, and deep: technical SEO, schema, content quality, local and international SEO.

- MIT. Large. Install it when SEO is the job, not as general marketing support.

### OpenClaudia/openclaudia-skills

Another open marketing set, 77 skills, MIT. Smaller following than the above and installed
through its own tool rather than a marketplace. Listed for completeness.

## writing, documents and file formats

### anthropics/skills

The official set: document co-authoring, Word, PDF, PowerPoint and Excel handling, brand
guidelines, canvas design, skill authoring, and MCP server authoring.

- `/plugin marketplace add anthropics/skills`, then `/plugin`
- **19 skills.** Check first: Claude Code ships several of these already, and installing a
  second copy gives you two descriptions competing for the same turn.

## game development

Added on 2026-10-02, after a user building a Godot game was told the design skills were
enough. They are not: every design entry above is for websites and apps. Checked against
GitHub on that day: licence, last push, and the skills each plugin installs.

### gamedev-skills/awesome-gamedev-agent-skills - pick your engine only

Engine skills for Godot 4, Unity 6, Unreal 5, Phaser, PixiJS, three.js, Bevy, pygame, LÖVE
and Roblox, plus cross-engine ones: game AI, procedural generation, dialogue, saves, audio.
Split into one plugin per engine, so you install the one you use.

- Add the marketplace `gamedev-skills/awesome-gamedev-agent-skills`, then install one plugin:
  `godot` (**16 skills**), `unity` (**8**), `unreal` (**6**), `web-engines` (**6**) or
  `other-engines` (**10**). `disciplines` (**15**) and `genres` (**9**) are separate.
- Apache-2.0. Around 1,300 stars, pushed 2026-09-27.
- Warning: the `gamedev` plugin in the same marketplace is **all 75 skills**, roughly 2,000 to
  4,500 tokens on every turn. Do not install it.

### jame581/GodotPrompter - the heavy Godot pick

Godot 4 only, in depth: GDScript and C#, scenes, signals, UI, physics, shaders, multiplayer,
export, with checklists for each.

- Add the marketplace `jame581/GodotPrompter`, then install `godot-prompter`.
- MIT. Around 780 stars, pushed 2026-10-01. **56 skills in one plugin**, so roughly 1,400 to
  3,400 tokens on every turn. Take it only if Godot is all you build.

### Randroids-Dojo/skills, the godot plugin - the light Godot pick

One skill for testing, building and exporting a Godot 4 game: GdUnit4 tests, scripted play
tests, web and desktop exports, CI. It fills the gap easyClaude's checks leave on Godot, where
a test runner is the hard part.

- Add the marketplace `Randroids-Dojo/skills`, then install `godot` only. The marketplace holds
  thirteen other unrelated plugins.
- MIT. **1 skill.** Around 50 stars, pushed 2026-09-21: small and young, so scan it first.

## Considered and not recommended

These are good repositories. They are listed here so nobody has to rediscover the reason.

### obra/superpowers

A large, well-made lifecycle framework: brainstorming, planning, worktrees, subagent
execution, TDD, review. It ships a `SessionStart` hook and its own workflow.

It is a peer framework, not a component. `hooks/hooks.json` reserves `SessionStart` for the
opener, which is told to add nothing else. Running both means two frameworks
narrating the same first turn and disagreeing about what happens next. Install it instead
of easyClaude, or alongside it knowingly, but not because a catalogue suggested it.

### rebelytics/one-skill-to-rule-them-all

Same shape of problem, recorded in `skills/registry.json` with the full reasoning.

### Donchitos/Claude-Code-Game-Studios

The most-starred game-development set on GitHub (MIT, around 25,000 stars, checked 2026-10-02):
49 agents and 72 workflow skills that model a whole game studio. Same shape of problem as
superpowers: it is a framework with its own way of running a project, and the 72 skill
descriptions alone cost more per turn than all of easyClaude. For engine knowledge without a
second framework, take one engine plugin from the game development section above.

### alirezarezvani/claude-skills

380 skills in one 22MB repository, spanning engineering, marketing, compliance, finance
and more. Breadth is the problem: descriptions that broad overlap each other, and the
wrong skill grabs the turn. Take a focused set from above instead.
