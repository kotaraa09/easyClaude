# easyClaude

A stack-agnostic harness that makes Claude Code work well on real projects — web, mobile, ML, games, anything.

It is **not** a starter template. It ships no scaffolding and assumes no stack. It gives Claude four things it doesn't have on its own: memory between sessions, a definition of "done" it can't fake, guardrails that don't depend on it cooperating, and a way to work cheaply when you're low on credits.

## Install

```bash
claude
/plugin marketplace add kotaraa09/easyClaude
/plugin install easyclaude@easyclaude
```

Then open any project and start typing. There is nothing to configure and no commands to memorise — on a project it doesn't recognise, it runs kickoff by itself.

Or fork [`template/`](template/), which pre-registers the marketplace in `.claude/settings.json` so a clone needs no install step at all — just approve the trust prompt on first run. CI checks those keys still match the real plugin and marketplace names, since a rename would otherwise break the template silently.

Commands are namespaced by the plugin — `/easyclaude:cheap`, not the bare name. Skills trigger on plain English and never need to be typed at all.

## What you actually get

**It remembers.** `docs/STATE.md` holds what's in progress, what's next, what's blocked, and what was skipped. Every session opens with a three-line orientation instead of you re-explaining the project.

**"Done" means verified.** Kickoff establishes a verify contract for *your* stack — the commands that must exit clean. Once you have a test suite, a Stop hook blocks the turn from ending while they fail, sending Claude back to fix them. No more `✅ All done!` on top of a red build.

It won't trap you: Claude Code caps consecutive Stop-hook blocks and overrides after a few, so a gate that can't be satisfied gives up rather than wedging your session. Raise the cap with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` if you want it stricter.

**Guardrails that don't need cooperation.** `rm -rf`, force pushes, hard resets, curl-pipe-sh, reads and writes to `.env`, and lockfile edits are denied at the permission layer — not requested politely in a prompt.

**It reaches for a library before writing one.** Custom code is the expensive default — a hand-rolled date parser is written once and debugged forever, on your credits. `/easyclaude:pick-library` finds what the ecosystem already settled on and runs a supply-chain check first: typosquats, install scripts, live advisories, abandonment, license. Adopting is still your call; what changed is that hand-rolling stops being treated as the safe option.

**`/easyclaude:cheap` for when credits are short.** One command, one turn: cheaper model, no subagents, narrowest working solution, and a closing line listing what it skipped. It expires by itself, so you can't forget you left it on.

## Generating assets

Claude can't draw, record, or model. easyClaude shells out to a provider that can:

```bash
node scripts/gen/generate.mjs --kind image --prompt "..." --out public/hero.webp
node scripts/gen/generate.mjs --list      # modalities and default models
node scripts/gen/generate.mjs ... --dry-run
```

Images, video, audio, and 3D. A script rather than an MCP server on purpose: no tool schemas riding along in every turn, it works in CI, and keys are read inside the script so they never enter the model's context.

**Six providers, and whichever key you have gets used.** Replicate covers every modality with one key; ElevenLabs does speech and sound effects (Replicate's default is music-only, so this is the one that makes voice work at all); OpenAI, Gemini and Venice do images; and `--provider local` drives Automatic1111 or ComfyUI on your own machine for **nothing per image**. `--check` proves a key works without generating anything.

**A subscription is not an API key.** ChatGPT Plus, Gemini Advanced, Copilot and NotebookLM don't include API access — it's a separate account, billed separately. Providers are also rejected on a stated rule: they must do something Claude can't. That keeps Ollama, DeepSeek, Kimi and OpenRouter out (text-only, and Claude already writes text), and Midjourney out because it has **no official API** at all. The reasons ship in `providers.mjs` so the rule survives the next contributor.

Adapters are marked `tested` or `UNTESTED` in `--list`, and the flag is honest: only Replicate has produced a real file.

Every generation is logged to `docs/asset-log.md`, because it costs real money and otherwise leaves no trace. The skill confirms before spending, and defaults to `--dry-run` when unsure.

Honest about limits: good for placeholders, backgrounds, textures, and mood; weak for final logos, where raster output only *looks* like a mark. Use `--model recraft-ai/recraft-v3-svg` if you need real vector.

## Connecting things — advanced, and optional

Nothing here is needed to build software. It exists because wiring up MCP servers by hand is fiddly and the failure modes are unobvious.

`/easyclaude:connect` turns setup into filling in a form. `.env.example` lists every connector with a one-line description and where to get the key; you fill in only what you have, and blanks stay switched off — there is nothing to uninstall later. One command then reads the form and configures whatever it found:

```bash
node scripts/connect.mjs --list      # what's available
node scripts/connect.mjs --status    # which keys are filled - names only, never values
node scripts/connect.mjs --apply     # wire up everything that has a key
```

**Your keys never enter the model's context.** `.env` is denied to Claude for both read and write, so the script reads it and reports only which key *names* are present — the same reason `generate.mjs` reads its own token internally.

**Scope is chosen per connector, and that's the part that matters:**

| connector | lands in | why |
|---|---|---|
| needs no key | `.mcp.json`, committed | teammates get it, and Claude Code holds it at *pending approval* until a human accepts |
| needs a key | `~/.claude.json`, outside the repo | a key cannot be committed by accident |

**Browser sign-in connectors cannot be automated at all.** Figma, Notion, Linear, Slack and Sentry need the interactive `/mcp` flow — there is no key to paste. The script names them instead of pretending otherwise.

`.mcp.json` ships with zero servers, and `enableAllProjectMcpServers` is deliberately absent from every settings file here: it auto-approves every server in a committed `.mcp.json`, so cloning a repo would silently run whatever a stranger put in it. That approval gate is the only reason shipping a committed `.mcp.json` is safe at all.

## Curated skills

Third-party skills are vendored deliberately and sparingly. Every skill's name and description sits in context *every session*, and overlapping descriptions make the wrong skill grab a turn — so ten good ones beat fifty. [`skills/registry.json`](skills/registry.json) records the bar, and CI enforces it: pinned 40-character SHAs (never a branch), a stated reason, present attribution files, and a prose-only claim that's checked against what's actually on disk.

**Vendored:** [design-taste](skills/design-taste/) — `design/tokens.md` enforces consistency but says nothing about whether the result is any *good*. This carries specific, falsifiable rules: contrast ratios, easing curves, the eight interaction states, named anti-patterns. MIT, with upstream Apache-2.0 attribution preserved.

**Recommended but not vendored:** [task-observer](https://github.com/rebelytics/one-skill-to-rule-them-all) ("One Skill to Rule Them All") is genuinely good and worth installing alongside — but knowingly. It asks to be invoked before the first tool call of *every* session and before any plan, which collides with easyClaude's `SessionStart` hook and `plan-feature`; its SKILL.md is 44KB against a framework measured in hundreds of tokens; and it wants a persistent workspace plus Python scripts. It's a peer framework, not a component.

## How it adapts to your stack

Kickoff detects the stack from marker files and loads a [recipe](recipes/) — how to verify it, and what usually goes wrong. Ten ship today: Go, Rust, Python/uv, Node+TS, Next.js, Vite+React, Flutter, Android, Unity, and plain static sites. Anything else, it writes a recipe by asking you, which you can contribute back.

**Verification is honest about its limits.** Web, Python, Go, Rust, and CLI projects verify strongly. Unity, Unreal, Android Studio, and iOS often can't be verified headlessly at all — on those, easyClaude tells you it can prove the code compiles but not that it works, rather than implying a guarantee it can't deliver.

## The workflow

You don't invoke any of this. It triggers on what you say.

| You say | What happens |
|---|---|
| *"add user profiles"* | Spec and task list written first, for you to approve |
| *"keep going"* | Next task built as one slice, then verified |
| *"it's throwing an error"* | Reproduced, isolated, fixed, regression test added |
| *"is this safe to make public?"* | Secrets, git history, endpoints and dependencies swept |
| *"put it online"* | Production build proven, host picked, env vars set, live URL verified |
| *"ship it"* | Verified, branched, reviewed, committed, PR opened |
| *"/easyclaude:cheap fix the login redirect"* | Cheapest working fix, this turn only |

Small changes skip the ceremony entirely — a bug fix is just a bug fix.

## Shipping without being asked

Off until you turn it on. `/easyclaude:autoship` checks whether git is actually set up — identity, a remote, `gh` installed and authenticated, whether you even have write access — and then offers only the levels that can work:

| level | adds | what it gives up |
|---|---|---|
| `commit` | branch, self-review the diff, commit | little — a bad commit is one revert away |
| `push` | the branch leaves your machine | it is now somewhere others can see |
| `pr` | opens a pull request | — |
| `merge` | merges it and syncs your local base | the last human checkpoint |

It fires from `build-task` only when a *feature* is finished: every verify step passed, and `docs/STATE.md` has nothing left under `Now`, `Next`, or `Blocked`. A bug found mid-task goes under `## Next`, which by itself stops the ship — that coupling is deliberate, because "I found something" and "this is done" turn out to be the same moment surprisingly often.

It refuses regardless of the config when verification failed, when the change touched auth, payments, or a migration, or when cheap mode is on. `SessionStart` says so at the top of every session while it is armed — you should never have to wonder whether this session can push on your behalf. The config lives in `.claude/autoship.json` and is gitignored: it is your authorisation, not the repository’s.

## Design assets

`design/tokens.md` is the file that drives consistent UI. Reference screenshots go in `design/refs/` with a one-line description each in `INDEX.md` — images cost ~1.5k tokens to look at, so the text is what gets read and the images get opened only when they're worth it. Use them once to derive tokens, then let the tokens do the work.

## Layout

```
.claude-plugin/   plugin + marketplace manifests
.mcp.json         zero servers by design - /easyclaude:connect fills it
hooks/            SessionStart orientation, adaptive Stop gate
commands/         /easyclaude:cheap, :cheap-session, :full, :autoship, :connect
skills/           always-on: kickoff, plan-feature, build-task, debug, ship
                  opt-in:    write-tests, rescue, security-check, deploy,
                             generate-asset, pick-library
                  vendored:  design-taste
rules/            copied into your project — ~30 lines, always loaded
recipes/          per-stack verify contracts and pitfalls
template/         thin front door to fork
scripts/          validate.mjs (CI checks), connect.mjs (MCP + keys),
                  gen/ (asset generation)
```

## Contributing

```bash
node scripts/validate.mjs
```

Runs in CI on every push and PR. No dependencies — `node:` builtins only. It checks frontmatter parses and uses real keys, skill names match their directories, hook events and shapes are valid, manifests agree, recipes carry a verification-strength field, docs use the namespaced command form, and the per-turn cost quoted below matches what the validator measures. Every check exists because that exact thing broke at least once.


## Costs

The framework isn't free, and it says so out loud. A skill's name and description ride along on **every turn of every session** — so the standing cost is a real tax, not a rounding error.

**~1,165 tokens per turn**: ~690 of rules, ~475 of skill descriptions. Skill bodies and recipes are another ~3.4k, but those load only when actually used.

**Skills are split by how often they fire.** The five that trigger constantly — kickoff, plan-feature, build-task, debug, ship — stay always-on so plain English keeps working. The six used a handful of times per project set `disable-model-invocation`, which removes them from per-turn cost **entirely** (that's the binary's own cost function: it skips them). They're invoked by name instead:

```
/easyclaude:write-tests        start a suite, upgrade the gate to enforcing
/easyclaude:rescue             undo it, get it back
/easyclaude:security-check     before going public
/easyclaude:deploy             to put it online
/easyclaude:generate-asset     images, audio, 3D
/easyclaude:pick-library       adopt a vetted library instead of hand-rolling
```

A one-line pointer in `rules/workflow.md` keeps all six discoverable for ~60 tokens, against ~424 if they rode along in full. Adding an opt-in skill is close to free; adding an always-on one is not.

**CI enforces the budget.** `skills/registry.json` sets `max_always_on_tokens`, the validator computes the real figure using the same formula the binary uses, and the build fails if it drifts over. Adding another always-on skill now means displacing one — which is the point. The vendored `design-taste` is ~156 of the total on its own and is left verbatim rather than edited, since modifying vendored frontmatter would break the pinned-SHA guarantee.

It ships `.mcp.json` with zero servers on purpose: MCP tool schemas are the single largest avoidable context cost, often larger than everything above combined. Add servers only when you need them — `/easyclaude:connect` does that from a form. If you're low on credits, `/easyclaude:cheap` is the answer.

MIT.
