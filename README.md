<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.png">
    <img src="docs/assets/hero-light.png" width="820" alt="easyClaude: a tangled thread passes through a series of gates and leaves as one straight, glowing line.">
  </picture>
</p>

<p align="center">
  A Claude Code plugin for people who build with Claude and do not write code themselves.
</p>

<p align="center">
  <kbd><b>English</b></kbd>
  <a href="README.th.md"><kbd>ภาษาไทย</kbd></a>
</p>

<p align="center">
  <a href="https://github.com/kotaraa09/easyClaude/actions/workflows/validate.yml"><img src="https://github.com/kotaraa09/easyClaude/actions/workflows/validate.yml/badge.svg" alt="Build status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1F1E1D" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/costs-~1.7k%20tokens%2Fturn-8C8781" alt="Around 1.7k tokens per turn">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.png">
    <img src="docs/assets/divider-light.png" width="820" alt="">
  </picture>
</p>

## What it does

- **Asks when your words are unclear.** If a request like "make it better" can mean several things, it names the likely meanings, says which it would pick, and waits for you.
- **Plans before it builds.** A new feature gets a short plan and a task list first. If your request is one sentence, it asks a few questions, each with a default you can accept.
- **Keeps the plan in a file.** `docs/STATE.md` holds what is in progress, what is next and what was skipped. A new session reads it, so "finish the rest" works the next day.
- **Runs your project's checks after each change.** You approve the commands once on your computer, and again whenever they change, so a project from someone else cannot run commands you have not seen. If a check fails, Claude has to fix it before it can say "done". On a website it also asks Claude to look at the page.
- **Suggests a free library** before it hand-writes a calendar, a map or a chart.
- **Blocks a few destructive commands**, such as force pushes and reading `.env`.
- **Answers in your language.** Short answers in plain words are one setting away.

None of these is new on its own. Each one is a normal Claude Code feature: a file, a hook, a permission rule. easyClaude sets them up for you, and it measures whether the result is better.

## What changes when it is on

The same request, in the same small sample shop, three runs with easyClaude and three without:

| you say | plain Claude Code | with easyClaude |
|---|---|---|
| *"the checkout breaks when there's no discount code"* | Fixes it. Adds no test that catches the bug if it comes back, 0 of 3. | Fixes it and adds that test, 3 of 3. |
| the same, in Thai | Fixes it, and adds that test in 2 of 3. | A test in 3 of 3, and the reply stays in Thai. |
| day one: five changes, *"just the first one today"*. Day two, in a new session: *"finish the rest"* | 0 of 3. The new session does not know what "the rest" is. | All five changes work in 2 of 3. The third put shipping in a separate total that the checkout does not use. |
| *"I want yesterday's version back"* | Asks before it changes anything in 1 of 3. The others restore at once, or hand over git commands. | Says what it would restore, and asks first, 3 of 3. |
| *"I want to make a website for my bakery"*, in an empty folder | Writes a plan or a finished page without asking, 3 of 3. | Asks one plain question first, 3 of 3. |
| *"add a calendar so shoppers can pick a delivery day"* | Asks first in 2 of 3. Once it builds a calendar by hand straight away. | Names a free calendar library and asks before adding it, 3 of 3. |

**Where it makes no difference.** Adding shipping costs, *"just make the tests pass"* without weakening the test, and renaming the shop in English and Thai: both get these right every time.

**What it costs.** Where it helps, it does more work, so the run costs more: about $0.23 against $0.13 for the bug fix, and $0.86 against $0.33 for the two-day task (Sonnet 5 at list price; on a Claude plan it is plan usage). Where it makes no difference, the cost is about the same. Every turn also carries about 1,700 tokens of its setup, so it is probably not worth it for one-off questions and snippets.

**How this was measured.** The first three rows are from 2026-10-02 and 2026-10-03, on 0.2.6, the Thai row after the language fix in 0.2.7. In the first three rows, hidden tests that Claude never saw check the files it left. In the last three, a second Claude grades the reply against written criteria. Three runs is a small sample, and a row can move by one run between days. The runs had no shell, which favours easyClaude, because its checks run as a hook. [`evals/README.md`](evals/README.md) has every run.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.png">
    <img src="docs/assets/divider-light.png" width="820" alt="">
  </picture>
</p>

## Install

You need **Claude Code** (the [desktop app](https://claude.ai/download) or the terminal), **[Node.js](https://nodejs.org)** (LTS) and **[Git](https://git-scm.com/downloads)**. A GitHub account is not needed.

**The easy way: ask Claude.** Open Claude Code in any folder and paste this:

```
Install the easyClaude plugin for Claude Code for me. First check that Node.js and Git
are installed, and tell me in plain words how to install anything that is missing.
Then run these two commands:
claude plugin marketplace add kotaraa09/easyClaude
claude plugin install easyclaude@easyclaude
If the claude command is not found, tell me how to install Claude Code for the terminal.
When it is done, tell me to start a new session.
```

Claude asks before it runs each command. Then start a new session, in the desktop app or the terminal.

<details>
<summary><b>Install by hand</b></summary>

<br>

In a terminal, run the same two commands:

```bash
claude plugin marketplace add kotaraa09/easyClaude
claude plugin install easyclaude@easyclaude
```

Inside a terminal session of Claude Code, `/plugin marketplace add kotaraa09/easyClaude` and `/plugin install easyclaude@easyclaude` also work. In the desktop app, `/plugin` opens a browsing screen and installs nothing, so use the commands above.

[`template/`](template/) is a project to fork that already points at the plugin, so Claude Code is meant to offer the install when you trust the folder. In the desktop app that offer did not appear in testing, so install it first.

</details>

## The first time

Open a project and say what you want. If the project is not set up yet, easyClaude asks up to four questions: what you build, who uses it, and what must work. It works out the rest from your files. Then it writes a few files into `docs/`, and offers at most two extra skills that fit your project, each with its cost.

After that, each session starts like this:

```
Now:     Add password reset to the login form
Next:    Rate-limit the reset endpoint
Blocked: none
Debt:    3 items - reset tokens never expire
```

"Debt" shows only when something was skipped on purpose.<!--skill:kickoff-->

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.png">
    <img src="docs/assets/divider-light.png" width="820" alt="">
  </picture>
</p>

## Just say what you want

| You say | What happens |
|---|---|
| *"add user profiles"* | It writes a plan and a task list, then waits for your yes <!--skill:plan-feature--> |
| *"keep going"* | It builds the next task, then checks it <!--skill:build-task--> |
| *"it's throwing an error"* | It finds the cause, fixes it, and adds a test <!--skill:debug--> |
| *"ship it"* | It checks, reviews and commits, and opens a pull request <!--skill:ship--> |
| *"where does login happen?"* | It searches before it reads <!--skill:explore-code--> |
| *"I want yesterday's version back"* | It finds what changed, and asks before it restores anything <!--skill:rescue--> |

Small changes skip all of that.

<details>
<summary><b>The commands</b></summary>

<br>

You never need these for the common jobs. They cost nothing until you type them.

```
/easyclaude:start              run setup by hand
/easyclaude:write-tests        start a test suite, so the checks cover behaviour
/easyclaude:security-check     look for secrets and risks before going public
/easyclaude:deploy             put it online and check the live address
/easyclaude:generate-asset     images, audio and 3D, through a provider you have a key for
/easyclaude:pick-library       find and check a library before hand-writing one
/easyclaude:skills             add third-party skills that fit this project
/easyclaude:connect            connect other tools (a browser, Figma, GitHub)
/easyclaude:cheap <task>       one task in the fewest steps
/easyclaude:cheap-session      stay in cheap mode until /easyclaude:full
/easyclaude:full               leave cheap mode
/easyclaude:plain [off]        short answers in plain words
/easyclaude:autoship           let it commit, push or merge by itself (off by default)
```

</details>

<details>
<summary><b>Images, audio and 3D</b></summary>

<br>

Claude cannot make these, so `/easyclaude:generate-asset` sends the job to a provider you have an API key for: Replicate, ElevenLabs, OpenAI, Gemini or Venice, or Automatic1111 and ComfyUI on your own computer. It asks before it spends money, and logs each result in `docs/asset-log.md`. A subscription such as ChatGPT Plus is not an API key.

So far only Replicate images were tested end to end. `node scripts/gen/generate.mjs --list` shows what each provider has produced.

</details>

<details>
<summary><b>Connecting other tools</b></summary>

<br>

`/easyclaude:connect` adds MCP servers from a form in `.env`. Three need no key: **playwright** (a real browser), **inspo** (design examples from real sites) and **graft** (a map of your own code). Keys stay in `.env`, which Claude cannot read, and never appear in a command line. Nothing is connected by default, because each server adds its tool list to every turn.

</details>

<details>
<summary><b>Shipping by itself</b></summary>

<br>

Off until you turn it on with `/easyclaude:autoship`. You choose how far it may go: commit, push, open a pull request, or merge. It acts only when a feature is finished and every check passed, and never on changes to sign-in, payments or database migrations. Each session tells you when it is on.

</details>

## Questions

<details>
<summary><b>Nothing happens when I open a project</b></summary>

<br>

Node.js is almost certainly missing. easyClaude runs on it, and without it a session opens as plain Claude Code. Install the LTS version from [nodejs.org](https://nodejs.org), restart Claude, and type `/easyclaude:start` if setup still does not begin.

</details>

<details>
<summary><b>Does it work on a project I already started?</b></summary>

<br>

Yes. It reads the existing code, and asks only what the code cannot tell it.

</details>

<details>
<summary><b>Can it promise my code works?</b></summary>

<br>

Only as far as your project's checks go, and it says which case you are in. Websites, Python, Go, Rust and command-line tools can be checked well. Unity, Unreal, Android Studio and iOS usually cannot be checked without a screen, so there it can show that the code compiles, not that it runs.

</details>

<details>
<summary><b>Can the checks trap Claude in a loop?</b></summary>

<br>

No. A failing check sends Claude back while it keeps changing files. If it changes nothing, because the fix is not its to make, the turn ends and the work is marked as not verified. A check that cannot run, for example with no compiler installed, only warns. Slow checks can be marked `"tier": "full"` in `.claude/verify.json`, so they run when a task is finished, not after every turn. The page check on websites asks once per message, and `"look": false` turns it off.

</details>

<details>
<summary><b>How do I remove it?</b></summary>

<br>

`claude plugin uninstall easyclaude@easyclaude`. The files in `docs/` are plain text and stay yours.

</details>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.png">
    <img src="docs/assets/divider-light.png" width="820" alt="">
  </picture>
</p>

## What it costs

Measured with Claude Code in a set-up project whose plan is in English:

<!--measured:1710,934,27,265,484-->**~1,710 tokens per turn**:

| part | tokens | when |
|---|---|---|
| everything the plugin loads when a session starts | ~934 | from install |
| your plan in `docs/STATE.md`, read back by the opener | ~27 | after setup |
| the `CLAUDE.md` setup writes | ~265 | after setup |
| the rules setup copies into `.claude/rules/` | ~484 | after setup |

The plan part grows with your plan; a plan in Thai costs a little more than the same plan in English. Skill bodies and stack recipes load only when they are used.

Three moments cost more, and easyClaude tells you about each one: reopening an old conversation, switching model in a long one (a line shows the cost when it is over about $0.25), and a conversation past about 80,000 tokens of history, where Claude suggests `/clear` once, and again after each `/clear`. Your plan is in `docs/STATE.md`, so `/clear` loses nothing.

<details>
<summary><b>How the cost is kept in check</b></summary>

<br>

`node scripts/measure-cost.mjs` measures the figures above (about $1 a run), and CI fails if this page quotes different ones. CI also estimates the plugin's own share on every push, from the size of its files: <!--cost:855,314,484,57-->**~855 tokens per turn**: ~314 of rules, ~484 of skill descriptions, ~57 of agent descriptions. `skills/registry.json` sets a ceiling of 1,400, and the build fails above it.

<!--always-on:8-->Eight skills stay loaded so plain sentences reach them. Seven are the steps in the table under "Just say what you want", plus setup. The eighth is slopmonster, the prose checker, at ~59 tokens. The five occasional skills load only when typed, so they cost nothing per turn. One read-only agent, the diff reviewer that `ship` uses, costs ~57. `.mcp.json` ships empty, because MCP tool lists are usually the largest cost of all and this ceiling cannot count them.

</details>

## For contributors

```bash
node scripts/validate.mjs   # checks the plugin's structure and its stated costs
node scripts/test.mjs       # tests the checks themselves, by breaking one thing at a time
node scripts/bench.mjs      # the outcome benchmark above (needs a login, costs money)
```

No dependencies, only Node's built-ins. [`evals/README.md`](evals/README.md) has the benchmark and the skill-trigger cases. [ROADMAP.md](ROADMAP.md) says what comes next and why. [`recipes/`](recipes/) holds the checks for ten stacks, from Go to Unity.

<details>
<summary><b>Third-party skills</b></summary>

<br>

One is built in: [slopmonster](skills/slopmonster/), a checker for AI-sounding prose, kept by request even though it needs Python; [`skills/registry.json`](skills/registry.json) records why. Everything else is offered from [`reference/skills-catalogue.md`](reference/skills-catalogue.md), a list checked against GitHub, and scanned with [NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector) before install. Each installed skill costs 25 to 60 tokens on every turn, so the catalogue recommends single plugins, not whole marketplaces.

</details>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/divider-dark.png">
    <img src="docs/assets/divider-light.png" width="820" alt="">
  </picture>
</p>

<p align="center">
  MIT · built by <a href="https://github.com/kotaraa09">DegonCore</a>
</p>
