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
  <img src="https://img.shields.io/badge/costs-~1.2k%20tokens%2Fturn-8C8781" alt="Around 1.2k tokens per turn">
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

Four more control easyClaude itself:

```
/easyclaude:cheap <task>       one cheap turn, then back to normal
/easyclaude:cheap-session      stay cheap until you say otherwise
/easyclaude:full               back to normal
/easyclaude:connect            hook up other tools (Figma, GitHub, databases)
/easyclaude:autoship           let it commit or ship on its own, off by default
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

Whichever key you already have is the one it uses. Replicate covers every kind of asset with a single key. ElevenLabs does speech and sound effects. OpenAI, Gemini and Venice do images. And `--provider local` drives Automatic1111 or ComfyUI on your own machine, which costs nothing per image.

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

Some connectors can't be automated at all. Figma, Notion, Linear, Slack and Sentry sign in through the browser and have no key to paste, so they need the interactive `/mcp` flow. The script lists them by name so you know to do those by hand.

`enableAllProjectMcpServers` is left out of every settings file here on purpose. It auto-approves every server in a committed `.mcp.json`, which would mean cloning a repo silently runs whatever a stranger put in it. That approval gate is what makes shipping a committed `.mcp.json` safe in the first place.

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

It can't trap you. Claude Code counts how many times in a row a turn has been blocked and overrides the gate after a few, so a check that can never pass gives up before it can lock up your session. Set `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` higher if you want it stricter.

A check that can't run at all — no compiler on this machine — warns instead of blocking, because wedging every session on a missing toolchain isn't a safety feature.

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

Every skill's name and description gets sent on every turn of every session, whether you use it or not:

<!--cost:1172,697,475-->**~1,172 tokens per turn**: ~697 of rules, ~475 of skill descriptions. Skill bodies and stack recipes are another ~3.4k on top, but those only load when something actually uses them.

Call it a page of text per turn. If that's more than you want to spend, use `/easyclaude:cheap`.

<details>
<summary><b>How the budget stays honest</b></summary>

<br>

Skills are split by how often they fire. <!--always-on:6-->Six stay always-on so plain English keeps working: the five that trigger constantly (kickoff, plan-feature, build-task, debug, ship), plus the vendored design-taste — which is the single most expensive line in this budget at ~156 tokens, more than kickoff and plan-feature together. It stays because its description is what makes "make this look less generic" reach it at all, and because editing vendored frontmatter would break the pinned-SHA guarantee that makes vendoring safe. Worth knowing you're paying for it on every turn, UI project or not.

The six occasional ones set `disable-model-invocation`, which drops them from the per-turn cost completely, because that's how Claude Code's own cost function treats them. A one-line pointer keeps all six discoverable for about 60 tokens, against roughly 424 if they were loaded in full.

CI enforces the ceiling. `skills/registry.json` sets it, the validator measures the real figure using the same formula the binary uses, and the build fails if it drifts over. Adding another always-on skill therefore means dropping one.

Hooks count too, and one of them was the worst offender. A hook can be a prompt, which means a model call. The gate that checks your build used to be one, firing on every turn that touched a file, asking Claude whether Claude's own tests had passed. It is now a script that reads exit codes: no tokens, no model call, and a verdict it cannot argue with.

No MCP servers ship enabled. Their tool schemas are the largest avoidable context cost, often bigger than everything above put together, so `.mcp.json` starts empty and `/easyclaude:connect` adds only what you ask for.

</details>

## Under the hood

<details>
<summary><b>How it adapts to your stack</b></summary>

<br>

Setup spots your stack from marker files and loads a [recipe](recipes/) covering how to check it and what usually goes wrong. Ten ship today: Go, Rust, Python/uv, Node + TypeScript, Next.js, Vite + React, Flutter, Android, Unity, and plain static sites. For anything else it writes a recipe by asking you, and you can contribute that back.

</details>

<details>
<summary><b>Curated skills, and why there aren't more</b></summary>

<br>

Third-party skills are vendored sparingly. Every skill's name and description sits in context every session, and overlapping descriptions make the wrong skill grab a turn, so ten good ones beat fifty. [`skills/registry.json`](skills/registry.json) records the bar and CI enforces it: pinned 40-character SHAs, never a branch, a stated reason, attribution files present, and a prose-only claim checked against what's actually on disk.

Vendored: [design-taste](skills/design-taste/). `design/tokens.md` enforces consistency but says nothing about whether the result is any good. This one carries specific, falsifiable rules: contrast ratios, easing curves, the eight interaction states, named anti-patterns. MIT, with upstream Apache-2.0 attribution preserved.

Recommended but not vendored: [task-observer](https://github.com/rebelytics/one-skill-to-rule-them-all) is good and worth installing alongside, as long as you know what you're taking on. It wants to be invoked before the first tool call of every session and before any plan, which collides with easyClaude's own session setup. Its SKILL.md is 44KB against a framework measured at ~1.2k tokens per turn, and it needs a persistent workspace plus Python scripts. It's a peer framework, not a component.

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
commands/         cheap, cheap-session, full, autoship, connect
skills/           always-on: kickoff, plan-feature, build-task, debug, ship
                  opt-in:    write-tests, rescue, security-check, deploy,
                             generate-asset, pick-library
                  vendored:  design-taste
rules/            copied into your project, ~30 lines, always loaded
recipes/          per-stack verify contracts and pitfalls
template/         thin front door to fork
scripts/          verify.mjs (the gate), validate.mjs (CI checks),
                  connect.mjs (MCP + keys), gen/ (asset generation)
evals/            why there is no behavioural test suite yet
docs/assets/      README artwork
```

</details>

## Contributing

```bash
node scripts/validate.mjs
```

This runs in CI on every push and pull request. It has no dependencies, only `node:` builtins. It checks that frontmatter parses and uses real keys, that skill names match their directories, that hook shapes are valid, that the manifests agree with each other, that recipes carry a verification-strength field, that docs use the namespaced command form, that a hook shelling out points at a script that actually exists, that the table above only promises phrases for skills that can actually hear them, and that the per-turn cost quoted above matches what the validator measures.

Each of those checks is there because that exact thing broke at least once.

CI also runs the gate itself, both ways: the real contract has to pass, and a deliberately failing one has to block. A gate that never blocks is the failure nobody notices.

What none of it can check is which skill actually wins a given sentence, since a validator reads frontmatter and not meaning. [`evals/`](evals/) records why that suite isn't written yet and what to write first.

---

<p align="center">
  MIT · built by <a href="https://github.com/kotaraa09">DegonCore</a>
</p>
