<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.png">
    <img src="docs/assets/hero-light.png" width="820" alt="A tangled thread passes through a series of gates and leaves as one straight, glowing line.">
  </picture>
</p>

<h1 align="center">easyClaude</h1>

<p align="center">
  A workflow for Claude Code that runs the whole loop: plan, build, verify, ship.
</p>

<p align="center">
  <kbd><b>English</b></kbd>
  <a href="README.th.md"><kbd>ภาษาไทย</kbd></a>
</p>

<p align="center">
  <a href="https://github.com/kotaraa09/easyClaude/actions/workflows/validate.yml"><img src="https://github.com/kotaraa09/easyClaude/actions/workflows/validate.yml/badge.svg" alt="Build status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1F1E1D" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/works%20with-any%20stack-D97757" alt="Works with any stack">
  <img src="https://img.shields.io/badge/costs-~1.5k%20tokens%2Fturn-8C8781" alt="Around 1.5k tokens per turn">
</p>

---

## What is this?

easyClaude is a workflow, not a single feature. It sets up the loop you would otherwise run by hand on every task: write a plan, build one slice, check it works, record what changed, commit.

You describe what you want in ordinary words. Each step runs because the one before it finished, and nothing is called done until the checks pass.

Four things come with it.

**The workflow itself.** Memory that carries across sessions, a verify gate that won't let "done" be claimed while the build is red, dangerous commands blocked at the permission layer, and the git steps (branch, review, commit, PR) automated once you arm them.

**A library check before anything gets hand-rolled.** Writing your own date parser means debugging it forever. It looks up what the ecosystem settled on and runs a supply-chain check before suggesting it.

**Cheap mode.** One command for when credits are short: cheaper model, smallest fix that works, and a list of what it skipped.

**Connections to things Claude can't do alone.** MCP servers configured from a form, and image, audio and 3D generation handed off to providers that can actually produce files.

It won't create a project, pick your tools, or write boilerplate. It runs alongside whatever you already build in, on any stack.

## Is this for me?

It's worth it if you're building something over more than one sitting, and especially if you're newer to programming and want the safety rails.

It's probably not worth it if you mostly use Claude Code for one-off questions and quick snippets. You'd be paying a running cost for something you don't need.

## Install

Open a terminal in any project:

```bash
claude
```

Then type these two lines into Claude Code:

```
/plugin marketplace add kotaraa09/easyClaude
/plugin install easyclaude@easyclaude
```

That's the whole setup. Open a project and start talking to it. If it doesn't recognise the project yet, it will say so and offer to get things ready.

<details>
<summary><b>Prefer to start from a template?</b></summary>

<br>

Fork [`template/`](template/) instead. It already points at the plugin in `.claude/settings.json`, so anyone who clones your repo skips the install entirely. They just approve the trust prompt the first time they run Claude Code.

</details>

## The first time you run it

**It asks you a few questions.** Four at most, in plain language: what you're building, who it's for. It works the rest out from your files, and it won't ask about anything it can detect on its own.

**It writes down what it learned.** A few small files land in `docs/`. The one that matters is `docs/STATE.md`, which tracks what's in progress, what's next, and what's blocked.

**After that, every session opens like this:**

```
Now:     Add password reset to the login form
Next:    Rate-limit the reset endpoint
Blocked: none
Debt:    3 items - reset tokens never expire
```

Three lines, then it waits. No summary of your codebase, no re-reading everything. Say "keep going" and it picks up from there.

The fourth line only shows up when something was deliberately skipped, and it names the one most likely to bite. Skipped work that nobody ever reads again is just a slower way of forgetting it.<!--skill:kickoff-->

## What you get

<table>
<tr>
<td width="33%" valign="top">
<img src="docs/assets/icon-memory.svg" width="44" alt="">
<h3>It remembers</h3>
<p>In progress, next up, blocked, and anything deliberately skipped all live in <code>docs/STATE.md</code>. Closing your laptop doesn't lose any of it. Finished work rolls into a changelog so the file stays short.</p>
</td>
<td width="33%" valign="top">
<img src="docs/assets/icon-verify.svg" width="44" alt="">
<h3>"Done" means checked</h3>
<p>Setup works out which commands have to pass for your project. From then on Claude can't end its turn while any of them fail. It gets sent back to fix them. That check is a script reading exit codes, not Claude marking its own homework.</p>
</td>
<td width="33%" valign="top">
<img src="docs/assets/icon-guardrails.svg" width="44" alt="">
<h3>Dangerous commands are blocked</h3>
<p><code>rm -rf</code>, force pushes, hard resets, piping the internet into your shell, anything touching <code>.env</code>. These are denied at the permission layer, so Claude doesn't get a say in it.</p>
</td>
</tr>
<tr>
<td width="33%" valign="top">
<img src="docs/assets/icon-library.svg" width="44" alt="">
<h3>It looks for a library first</h3>
<p>Writing your own date parser means debugging it forever, and you pay for that. So it goes looking for what everyone else already uses, and security-checks it before suggesting it.</p>
</td>
<td width="33%" valign="top">
<img src="docs/assets/icon-cheap.svg" width="44" alt="">
<h3>Cheap mode</h3>
<p><code>/easyclaude:cheap</code> gets you the smallest fix that works, on a cheaper model, plus a note saying what it skipped. It switches itself off afterwards.</p>
</td>
<td width="33%" valign="top">
<img src="docs/assets/icon-recipes.svg" width="44" alt="">
<h3>It knows your stack</h3>
<p>Ten stacks ship with a recipe covering how to check the build and what usually breaks. For anything else it asks you a few questions and writes one.</p>
</td>
</tr>
</table>

## Just say what you want

There are no commands to learn for the common things. Say what you want in normal words.

| You say | What happens |
|---|---|
| *"add user profiles"* | It writes a plan and a task list, then waits for your yes <!--skill:plan-feature--> |
| *"keep going"* | It builds the next task, then checks it <!--skill:build-task--> |
| *"it's throwing an error"* | Reproduced, fixed, and a test left behind so it can't come back <!--skill:debug--> |
| *"ship it"* | Checks, branches, reviews, commits, opens a pull request <!--skill:ship--> |
| *"where does login happen?"* | It searches before it reads, and says what it found <!--skill:explore-code--> |

Small stuff skips all of that. A one-line bug fix is just a one-line bug fix.

<details>
<summary><b>The commands, if you want them</b></summary>

<br>

Six jobs come up rarely enough that they aren't listening in the background. You call them by name when you need them, and they cost nothing until you do. That is also why they are not in the table above: a skill that costs nothing per turn is one that cannot be listening for a phrase.

```
/easyclaude:write-tests        start a test suite, so the gate checks behaviour
/easyclaude:rescue             undo something, get your work back
/easyclaude:security-check     sweep secrets, git history, endpoints, dependencies
/easyclaude:deploy             prove the build, pick a host, check the live URL
/easyclaude:generate-asset     images, audio, 3D
/easyclaude:pick-library       find a vetted library instead of hand-rolling
```

Seven more control easyClaude itself:

```
/easyclaude:start              run setup by hand, if it did not run on its own
/easyclaude:cheap <task>       one cheap turn, then back to normal
/easyclaude:cheap-session      stay cheap until you say otherwise
/easyclaude:full               back to normal
/easyclaude:connect            hook up other tools (Figma, GitHub, databases)
/easyclaude:autoship           let it commit or ship on its own, off by default
/easyclaude:skills             browse a catalogue of third-party skills, install what you pick
```

</details>

## Generating images, audio and 3D

Claude can't draw, record or model anything, so easyClaude hands that off to a service that can:

```bash
node scripts/gen/generate.mjs --kind image --prompt "..." --out public/hero.webp
node scripts/gen/generate.mjs --list      # what's available, and what's been tested
node scripts/gen/generate.mjs --check     # prove your key works without generating
```

Or ask for `/easyclaude:generate-asset` and let it drive.

Whichever key you already have is the one it uses. Replicate covers every kind of asset with a single key. ElevenLabs does speech and sound effects. OpenAI does images. So do Gemini and Venice. And `--provider local` drives Automatic1111 or ComfyUI on your own machine, which costs nothing per image.

One thing to watch: a subscription is not an API key. ChatGPT Plus, Gemini Advanced, Copilot and NotebookLM don't include API access. That's a separate account and a separate bill.

Every generation gets logged to `docs/asset-log.md`, since it costs real money and otherwise leaves no trace. It asks before spending, and falls back to `--dry-run` when it isn't sure.

Where it's weak: raster models are fine for placeholders, backgrounds, textures and mood, and bad at final logos, where the output only looks like a real mark. Use `--model recraft-ai/recraft-v3-svg` if you need actual vector.

<details>
<summary><b>Why these providers and not others</b></summary>

<br>

A provider has to do something Claude can't already do. That rule rules out Ollama, DeepSeek, Kimi and OpenRouter, which are text-only. Midjourney is out because it has no official API. The reasons are written into `providers.mjs` so the rule outlives the next contributor.

`--list` says which kinds of asset each adapter has actually produced, not just whether the provider works. So far that is Replicate, for images only — its video, audio and 3D paths are written but unproven.

Keys are read inside the script and never reach Claude's context. That's also why this is a plain script and not an MCP server: no tool schemas loaded on every turn, and it runs in CI.

</details>

## Connecting other tools

Optional, and not needed to build anything. It exists because wiring up MCP servers by hand is fiddly and the failure modes aren't obvious.

`/easyclaude:connect` turns it into filling in a form. `.env.example` lists every connector with a one-line description and where to get the key. Fill in the ones you have; blanks stay switched off and there's nothing to uninstall later.

Three need no key at all, and those are the ones worth knowing about. **playwright** drives a real browser, so Claude can click through what it built instead of assuming it works. **inspo** searches 800+ real production sites for design references — useful next to whichever design skill `/easyclaude:skills` installed, since neither of those ships examples. **graft** maps your own codebase.

```bash
node scripts/connect.mjs --list      # what's available
node scripts/connect.mjs --status    # which keys are filled, names only, never values
node scripts/connect.mjs --apply     # wire up everything that has a key
```

Your keys never reach Claude's context. `.env` is blocked for reading and writing, so the script opens it and reports back only which key names it found.

They don't reach the command line either. `claude mcp add` can only take a key through its arguments, where any process running as you can read it, so the script passes a single-use placeholder and writes the real value into the config afterwards.

<details>
<summary><b>Where each connector lands, and why</b></summary>

<br>

| connector | lands in | why |
|---|---|---|
| needs no key | `.mcp.json`, committed | teammates get it, and Claude Code holds it at pending approval until a human accepts |
| needs a key | `~/.claude.json`, outside the repo | a key can't be committed by accident |

Some connectors can't be automated at all. Figma, Notion, Linear, Slack, Atlassian, Sentry and Higgsfield sign in through the browser and have no key to paste, so they need the interactive `/mcp` flow. The script lists them by name so you know to do those by hand.

Higgsfield is the one of those that makes things: image and video, across Sora, Veo, Kling and others. The script prints the exact command to add it, because `/mcp` can sign in to a server but cannot add one. It is kept out of the automatic batch on purpose. Every generation spends credits on your Higgsfield account, so it lands private to you and never in the shared `.mcp.json`.

Jev, from TypeSafe, is in the form as a key and nothing more. It answers typed questions: pick one option, score this, yes or no. TypeSafe has no official MCP server, and the community ones were each a few days old with one maintainer when this was written. Handing your paid key to one of those is the risk this list exists to avoid. So `TYPESAFE_API_KEY` sits in `.env` for your own code to read, Claude still never sees it, and `--apply` wires nothing for it. When TypeSafe ships its own server, it moves up into the list.

`enableAllProjectMcpServers` is left out of every settings file here on purpose. It auto-approves every server in a committed `.mcp.json`, which would mean cloning a repo silently runs whatever a stranger put in it. That approval gate is what makes shipping a committed `.mcp.json` safe in the first place.

</details>

<details>
<summary><b>Graft, and why only half of it is wired</b></summary>

<br>

[Graft](https://github.com/trailhq/Graft) builds a map of your own codebase - what calls what, what lives where - so Claude can look a thing up instead of reading its way to it. It is MIT, actively maintained, and needs no key, so `/easyclaude:connect` offers it like any other keyless connector.

Only the MCP server is wired, and it is off until you ask for it. That is a cost decision, not a doubt about the tool.

Graft's six tool schemas plus its MCP instructions measure ~1,095 tokens per turn, by the same chars/4 rule `scripts/validate.mjs` uses on everything else here. The framework itself measures ~1,481 in a set-up project. Switching Graft on by default would add about three quarters to the standing cost of every turn in every session, including the ones that never touch a graph - and the badge at the top of this page would stop being true.

Worse, the budget check would not notice. It counts `rules/*.md`, skill descriptions and agent descriptions, and MCP tool schemas are none of those. The one number CI guards is blind to the largest thing that could move it. That is the actual reason `.mcp.json` ships empty: the gate cannot defend that ground, so the default has to.

`graft init` is a second, separate step, and it is not run for you. It writes hooks on `SessionStart` and `Stop` - the only two events easyClaude uses. Its SessionStart emits a repo orientation block into the same first turn that `hooks/hooks.json` reserves for the four-line opener, and the opener is told to add nothing else. It also installs a statusline and a `.claude/skills/graft/SKILL.md`. Run it yourself if you want that - knowingly, not by default.

Two things to know before you switch it on:

- Its tools return nothing until a graph exists. Run `npx -y @nanonets/graft@0.16.0 build` once in the project, add `graft/` to `.gitignore`, and build again after a large change. The connector prints this when you add it.
- It sends one anonymous usage ping. Set `DO_NOT_TRACK=1` to switch that off. The base `build` is local tree-sitter and calls no model; only `build --deep` calls an LLM, and that one costs money.

The version is pinned. A connector that tracks `latest` is unreviewed code arriving on your machine, which is the same reason `skills/registry.json` pins every vendored skill to a commit.

</details>

## Shipping on its own

Off until you turn it on. `/easyclaude:autoship` starts by checking whether git is actually usable here: identity set, a remote configured, `gh` installed and authenticated, and whether you have write access at all. Then it offers only the levels that can work.

| level | adds | what you give up |
|---|---|---|
| `commit` | branch, self-review the diff, commit | not much, a bad commit is one revert away |
| `push` | the branch leaves your machine | it's now somewhere other people can see |
| `pr` | opens a pull request | |
| `merge` | merges it and syncs your local base | the last human checkpoint |

It only fires when a whole feature is finished: every check passed, and nothing left under `Now`, `Next` or `Blocked`. A bug found mid-task goes under `## Next`, which on its own is enough to stop the ship. That coupling is intentional, since "I found something" and "this is done" are often the same moment.

It refuses regardless of your settings if checks failed, if the change touched auth, payments or a database migration, or if cheap mode is on. Settings live in `.claude/autoship.json`, which is gitignored. The authorisation is yours, not the repository's.

## Questions people ask

<details>
<summary><b>Do I have to remember any commands?</b></summary>

<br>

No. Everything in the table above triggers on plain English, and you'll be told about the commands when one is actually relevant.

</details>

<details>
<summary><b>What if the safety gate won't let Claude finish?</b></summary>

<br>

It can't trap you. A failing check sends Claude back to fix it, as often as Claude keeps changing files. If Claude changes nothing after a block, because the fix is not its to make, the gate lets the turn end and says the work is not verified. It used to block that too, and Claude repeated the same report eight times before Claude Code's own cap stopped it.

A check that can't run at all, because there's no compiler on this machine, warns instead of blocking. Wedging every session on a missing toolchain isn't a safety feature.

</details>

<details>
<summary><b>My test suite takes four minutes. Will it run that every turn?</b></summary>

<br>

Only if you let it. Steps can be marked `"tier": "full"` in `.claude/verify.json`, which runs them when a task is finished and when shipping rather than at the end of every turn. Everything else stays `fast` and keeps running constantly.

Setup times each command as it runs and only tiers what it actually measured above about 30 seconds, so quick projects stay single-tier — which is the stricter arrangement, and there's no reason to give it up.

Be clear about what tiering costs: on a tiered contract, a broken test no longer blocks the turn that broke it. `ship` becomes the place that catches it, and it refuses to ship red. That's the same trade every team makes between a pre-commit hook and CI, and it's still much better than the alternative it replaces — dropping the slow half of the suite from the contract, where it covered nothing at all.

</details>

<details>
<summary><b>Will it commit or push without asking?</b></summary>

<br>

Only if you turn that on yourself with `/easyclaude:autoship`. When it's on, every session opens with a line telling you so. You should never have to guess whether a session can push on your behalf.

</details>

<details>
<summary><b>Can it actually promise my code works?</b></summary>

<br>

That depends on your stack, and it will tell you which case you're in.

Web, Python, Go, Rust and command-line projects can be checked properly. Unity, Unreal, Android Studio and iOS usually can't be checked without a GUI, so on those it can prove your code compiles but not that it runs correctly. It tells you that instead of implying a guarantee it can't give you.

</details>

<details>
<summary><b>Does it work on a project I've already started?</b></summary>

<br>

Yes. It notices the existing code, skips the setup questions it can answer by reading your files, and only asks about things the code can't tell it, like who the project is for and what you want next.

</details>

<details>
<summary><b>How do I remove it?</b></summary>

<br>

`/plugin uninstall easyclaude@easyclaude`. The files it wrote into `docs/` are ordinary markdown and yours to keep or delete. Nothing is hidden anywhere else.

</details>

## What it costs

easyClaude is not free to run, and a project that argues about token cost shouldn't be vague about its own.

Some of it is sent on every turn of every session, whether you use it or not. Measured with Claude Code itself, in a project kickoff has set up:

<!--measured:1481,841,1,263,376-->**~1,481 tokens per turn**, in four parts, for a project whose plan is in English:

| part | tokens | when |
|---|---|---|
| skills, agent and session opener | ~841 | from install |
| your plan in `docs/STATE.md`, read back by the opener in place of the setup offer | ~1 | after kickoff |
| the `CLAUDE.md` kickoff writes | ~263 | after kickoff |
| the rules kickoff copies into `.claude/rules/` | ~376 | after kickoff |

Skill bodies and stack recipes load only when something uses them, so they are not in that figure. easyClaude works in whatever language you write in, and writes your plan in it. The plan part grows with the plan, and with the language: some languages take more tokens per word. A five-task plan in Thai measured about 150 tokens more than the same plan in English. Everything else stays in English, whatever you write in, because only Claude reads it.

Call it a page and a half of text per turn. If that's more than you want to spend, use `/easyclaude:cheap`.

<details>
<summary><b>How it was measured, and why the old figure was wrong</b></summary>

<br>

`node scripts/measure-cost.mjs` sends "hi" in five projects, each adding one part, and reads the input tokens Claude Code reports. Everything in a turn stays in the context of every later turn, so each difference is what that part costs on every turn. It needs a login and spends about a dollar, so you run it, not CI. `--write` saves the result to `docs/cost.json`. CI fails if this page quotes a different number, and warns when the files that set the cost changed after the last measurement.

Until 0.1.3 this page said ~958 tokens per turn. Measured, a set-up project with a Thai plan cost ~2,190. The old figure was an estimate: it counted four characters as one token, which is optimistic, and it left out the `CLAUDE.md` kickoff writes. Cutting duplicated rules and shortening that `CLAUDE.md` brought it to today's figure.

CI still makes the estimate, because it can do that on every push: <!--cost:704,220,427,57-->**~704 tokens per turn**: ~220 of rules, ~427 of skill descriptions, ~57 of agent descriptions. That covers only the files in this plugin, and it is the number the budget below is checked against.

</details>

<details>
<summary><b>How the budget stays honest</b></summary>

<br>

Skills are split by how often they fire. <!--always-on:7-->Seven stay loaded, so plain English keeps working. Six of them fire constantly: kickoff, plan-feature, build-task, debug, ship, explore-code. The seventh is the vendored slopmonster, at ~59 tokens, and its description is what makes "does this sound like AI" reach it at all. A vendored design skill held that slot until September 2026 and cost ~156 tokens. It went because it picked an aesthetic for every project that installed it, and `/easyclaude:skills` asks instead. Worth knowing you now pay 59 tokens a turn for the slop linter, prose project or not.

The six occasional ones set `disable-model-invocation`, which drops them from the per-turn cost completely, because that's how Claude Code's own cost function treats them. A one-line pointer keeps all six discoverable, plus `/easyclaude:skills`, for about 76 tokens. Loading the six in full would cost roughly 424.

One agent ships, and it costs ~57 tokens a turn for the same reason a skill does: its name and description sit in the tool list whether you dispatch it or not. `easyclaude-diff-reviewer` is the fresh pair of eyes in step 3 of `ship` — it reads a diff it did not write and reports only what breaks. It holds `Read`, `Glob` and `Grep`, and nothing that can write or run a command, because a reviewer that fixes what it finds puts unreviewed code past the gate. The review ran before this, on whichever general helper was to hand; naming it is what buys the read-only grant and a cheaper model.

CI enforces the ceiling. `skills/registry.json` sets it, the validator estimates the figure from the files, and the build fails if it drifts over. About 696 tokens are left. Two changes bought that room, and both are worth copying. `reference/cheap.md` left `rules/` entirely: it applies only while a marker file exists, so 191 tokens per turn were being spent on nearly every session that never used it. And `rules/code-standards.md` declares `paths:`, so Claude Code loads it only when it touches a source file - standards about naming were being paid for on turns that wrote no code.

The ceiling has a blind spot, and it is worth knowing about. It counts `rules/*.md`, skill descriptions and agent descriptions. It does not count MCP tool schemas, which are larger than both - Graft's six measure ~1,095 on their own. That is why `.mcp.json` ships empty rather than merely small: on that ground the default does the work the gate cannot.

Hooks count too, and one of them was the worst offender. A hook can be a prompt, which means a model call. The gate that checks your build used to be one, firing on every turn that touched a file, asking Claude whether Claude's own tests had passed. It is now a script that reads exit codes: no tokens, no model call, and a verdict it cannot argue with.

No MCP servers ship enabled. Their tool schemas are the largest avoidable context cost, often bigger than everything above put together, so `.mcp.json` starts empty and `/easyclaude:connect` adds only what you ask for.

</details>

## Under the hood

<details>
<summary><b>How it adapts to your stack</b></summary>

<br>

Setup spots your stack from marker files and loads a [recipe](recipes/) covering how to check it and what usually goes wrong. Ten ship today: Go, Rust, Python/uv, Node + TypeScript, Next.js, Vite + React, Flutter, Android, Unity, plus plain static sites. For anything else it writes a recipe by asking you, and you can contribute that back.

</details>

<details>
<summary><b>Which third-party skills ship, and why so few</b></summary>

<br>

Third-party skills are vendored sparingly. Every skill's name and description sits in context every session, and overlapping descriptions make the wrong skill grab a turn, so ten good ones beat fifty. [`skills/registry.json`](skills/registry.json) records the bar and CI enforces it: pinned 40-character SHAs, never a branch, a stated reason, attribution files present, and a prose-only claim checked against what's actually on disk.

Vendored: [slopmonster](skills/slopmonster/), and it is the exception that shows where the bar sits. It is not prose-only, it needs Python, and one of its two scripts pipes your draft to a second model provider and bills you for the call. The bar would normally refuse on any of the three. It is here by request, so the reasons live in [`skills/registry.json`](skills/registry.json) and [its provenance file](skills/slopmonster/PROVENANCE.md) rather than getting smoothed over — going around a rule should leave a record. Both of its scripts were read in full first, which is what the bar asks for and the only part of it that was not waived.

What it buys is the one mechanical check here pointed at prose instead of code. Five rule groups, one point each, exits red below 5/5, and every rule can be looked up and argued with. Run it on this README and it passes, 5 out of 5. It scored 2 before, and the em-dash pile-ups had to go first. A rule you can meet is the argument for a falsifiable rule.

`design-taste` held that slot until September 2026 and went for the opposite reason: it picked an aesthetic for every project that installed it, and charged every session for a pick nobody was asked about.

`/easyclaude:skills` asks instead. It reads [`reference/skills-catalogue.md`](reference/skills-catalogue.md), a checked list of third-party skills by category: design, security, testing, marketing, documents. Every entry carries its licence, its skill count, its install command, and the reason it is or is not recommended. Each one was verified against the GitHub API the day it was written, because a catalogue that 404s on first use is worse than no catalogue at all.

Every install the catalogue offers goes through [NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector) first, and that part is not optional. `scripts/skillscan.mjs` scans the target and refuses above a risk score of 50. NVIDIA’s own survey of this ecosystem found roughly a quarter of skills carry vulnerabilities and a twentieth look deliberately hostile, so a catalogue with no scanner in front of it is a list of things to trust because we said so. It fails closed: no scanner means no install, unless you type `--allow-unscanned` and accept that it says so out loud. It runs in static mode, so the files it reads stay on your machine and no API key is needed. SkillSpector itself is not vendored. It is 5MB of Python with a Docker image, against a plugin that ships Node built-ins, so it is called where it lives, the way Graft is.

For design that means [hallmark](https://github.com/Nutlope/hallmark), prose only and MIT, against [impeccable](https://github.com/pbakaus/impeccable), which drives a real browser and critiques its own screenshots but installs hooks and runs a binary it downloads on first use. For security it means [trailofbits/skills](https://github.com/trailofbits/skills), split into 44 plugins so you take the three you need. For testing, [mattpocock/skills](https://github.com/mattpocock/skills). For marketing, [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills). There is a UX/UI maximum stack too, for people who want all of it and can read a bill.

The catalogue says the uncomfortable part out loud, because this is the one document that has to. Nothing is bundled, so none of it costs you anything until you install it — and after you install it, it costs you on every turn, used or not. A 50-skill marketplace lands somewhere near 1,200 to 3,000 tokens per turn, which is more than this entire framework, forever, including on the projects that never open a landing page. So the rule the command repeats is: add the marketplace, install the plugins, leave the other forty-six out.

Recommended but not vendored: [task-observer](https://github.com/rebelytics/one-skill-to-rule-them-all) is good and worth installing alongside, as long as you know what you're taking on. It wants to be invoked before the first tool call of every session and before any plan, which collides with easyClaude's own session setup. Its SKILL.md is 44KB against a framework measured at ~1.5k tokens per turn, and it needs a persistent workspace plus Python scripts. It's a peer framework, not a component.

</details>

<details>
<summary><b>Design assets</b></summary>

<br>

`design/tokens.md` is the file that drives consistent UI. Reference screenshots go in `design/refs/`, each with a one-line description in `INDEX.md`. Images cost around 1.5k tokens to look at, so the text is what gets read and the images get opened only when they're worth it. Use them once to derive tokens, then let the tokens do the work.

</details>

<details>
<summary><b>Repository layout</b></summary>

<br>

```
.claude-plugin/   plugin + marketplace manifests
.mcp.json         starts empty, /easyclaude:connect fills it
hooks/            session orientation, verify gate (runs verify.mjs)
commands/         start, cheap, cheap-session, full, autoship, connect,
                  skills
skills/           always-on: kickoff, plan-feature, build-task, debug, ship,
                  explore-code
                  opt-in:    write-tests, rescue, security-check, deploy,
                             generate-asset, pick-library
                  vendored:  slopmonster (prose linter, always on)
agents/           easyclaude-diff-reviewer: read-only fresh eyes for ship step 3
rules/            copied into your project, ~30 lines, always loaded
reference/        loaded on demand only: cheap contract, skill catalogue
recipes/          per-stack verify contracts and pitfalls
template/         thin front door to fork
scripts/          verify.mjs (the gate), validate.mjs (CI checks),
                  test.mjs (tests both), connect.mjs + connect-core.mjs
                  (MCP + keys), skillscan.mjs (the install gate),
                  gen/ (asset generation)
tests/            mutation tests for the checking machinery
evals/            six trigger cases, written but not yet runnable
docs/assets/      README artwork
```

</details>

## Contributing

```bash
node scripts/validate.mjs   # check the plugin
node scripts/test.mjs       # check the checkers
```

Both run in CI on every push and pull request. Neither has dependencies, only `node:` builtins.

The validator checks that frontmatter parses and uses real keys, that skill names match their directories, that hook shapes are valid, that the manifests agree with each other, that recipes carry a verification-strength field, that docs use the namespaced command form, that a hook shelling out points at a script that actually exists, that the table above only promises phrases for skills that can actually hear them, that a shipped agent is read-only and pins a model, and that the per-turn cost quoted above matches what the validator measures.

Each of those checks is there because that exact thing broke at least once.

The test suite exists because four of them later stopped checking, and passed while they did — the gate reported OK on failing tests, a reworded heading switched off a check with its marker still in place, and a reversed pair of headings left another one reading an empty string. Every one was found by reading the source, which is not a process that scales.

So the suite tests the checkers rather than the plugin. It copies the tree, breaks exactly one thing, and requires the validator to report it; a check that stops checking now fails a test instead of going quiet. It pins the gate's behaviour the same way — a failing step must block the turn, a missing toolchain must only warn, and test output that happens to say "not found" must not be mistaken for a missing toolchain. One case is about the suite itself: every numbered check in the validator must have at least one test, so a new check cannot ship untested and an old one cannot lose its last test unnoticed.

What none of it can check is which skill actually wins a given sentence, since a validator reads frontmatter and not meaning. [`evals/`](evals/) holds six cases for exactly that — four skills that must fire, and two sentences that must leave every skill quiet. They cannot run yet: `claude plugin eval` is still in early access. The validator checks their shape on every push so they cannot rot in the meantime, and `evals/README.md` is explicit about which parts of them are unproven until the first real run.

---

<p align="center">
  MIT · built by <a href="https://github.com/kotaraa09">DegonCore</a>
</p>
