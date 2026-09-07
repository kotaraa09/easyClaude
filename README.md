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

Commands are namespaced by the plugin — `/easyclaude:cheap`, not the bare name. Skills trigger on plain English and never need to be typed at all.

## What you actually get

**It remembers.** `docs/STATE.md` holds what's in progress, what's next, what's blocked, and what was skipped. Every session opens with a three-line orientation instead of you re-explaining the project.

**"Done" means verified.** Kickoff establishes a verify contract for *your* stack — the commands that must exit clean. Once you have a test suite, a Stop hook blocks the turn from ending while they fail, sending Claude back to fix them. No more `✅ All done!` on top of a red build.

It won't trap you: Claude Code caps consecutive Stop-hook blocks and overrides after a few, so a gate that can't be satisfied gives up rather than wedging your session. Raise the cap with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` if you want it stricter.

**Guardrails that don't need cooperation.** `rm -rf`, force pushes, hard resets, curl-pipe-sh, reads and writes to `.env`, and lockfile edits are denied at the permission layer — not requested politely in a prompt.

**`/easyclaude:cheap` for when credits are short.** One command, one turn: cheaper model, no subagents, narrowest working solution, and a closing line listing what it skipped. It expires by itself, so you can't forget you left it on.

## Generating assets

Claude can't draw, record, or model. easyClaude shells out to a provider that can:

```bash
node scripts/gen/generate.mjs --kind image --prompt "..." --out public/hero.webp
node scripts/gen/generate.mjs --list      # modalities and default models
node scripts/gen/generate.mjs ... --dry-run
```

Images, video, audio, and 3D behind a single `REPLICATE_API_TOKEN`. A script rather than an MCP server on purpose: no tool schemas riding along in every turn, it works in CI, and the token is read inside the script so it never enters the model's context.

Every generation is logged to `docs/asset-log.md`, because it costs real money and otherwise leaves no trace. The skill confirms before spending, and defaults to `--dry-run` when unsure.

Honest about limits: good for placeholders, backgrounds, textures, and mood; weak for final logos, where raster output only *looks* like a mark. Use `--model recraft-ai/recraft-v3-svg` if you need real vector.

## Curated skills

Third-party skills are vendored deliberately and sparingly. Every skill's name and description sits in context *every session*, and overlapping descriptions make the wrong skill grab a turn — so ten good ones beat fifty. [`skills/registry.json`](skills/registry.json) records the bar, and CI enforces it: pinned 40-character SHAs (never a branch), a stated reason, present attribution files, and a prose-only claim that's checked against what's actually on disk.

**Vendored:** [design-taste](skills/design-taste/) — `design/tokens.md` enforces consistency but says nothing about whether the result is any *good*. This carries specific, falsifiable rules: contrast ratios, easing curves, the eight interaction states, named anti-patterns. MIT, with upstream Apache-2.0 attribution preserved.

**Recommended but not vendored:** [task-observer](https://github.com/rebelytics/one-skill-to-rule-them-all) ("One Skill to Rule Them All") is genuinely good and worth installing alongside — but knowingly. It asks to be invoked before the first tool call of *every* session and before any plan, which collides with easyClaude's `SessionStart` hook and `plan-feature`; its SKILL.md is 44KB against a framework measured in hundreds of tokens; and it wants a persistent workspace plus Python scripts. It's a peer framework, not a component.

## How it adapts to your stack

Kickoff detects the stack from marker files and loads a [recipe](recipes/) — how to verify it, and what usually goes wrong. Ships with Next.js, Python/uv, and Go. Anything else, it writes a recipe by asking you, which you can contribute back.

**Verification is honest about its limits.** Web, Python, Go, Rust, and CLI projects verify strongly. Unity, Unreal, Android Studio, and iOS often can't be verified headlessly at all — on those, easyClaude tells you it can prove the code compiles but not that it works, rather than implying a guarantee it can't deliver.

## The workflow

You don't invoke any of this. It triggers on what you say.

| You say | What happens |
|---|---|
| *"add user profiles"* | Spec and task list written first, for you to approve |
| *"keep going"* | Next task built as one slice, then verified |
| *"ship it"* | Verified, branched, reviewed, committed, PR opened |
| *"/easyclaude:cheap fix the login redirect"* | Cheapest working fix, this turn only |

Small changes skip the ceremony entirely — a bug fix is just a bug fix.

## Design assets

`design/tokens.md` is the file that drives consistent UI. Reference screenshots go in `design/refs/` with a one-line description each in `INDEX.md` — images cost ~1.5k tokens to look at, so the text is what gets read and the images get opened only when they're worth it. Use them once to derive tokens, then let the tokens do the work.

## Layout

```
.claude-plugin/   plugin + marketplace manifests
hooks/            SessionStart orientation, adaptive Stop gate
commands/         /easyclaude:cheap, :cheap-session, :full
skills/           kickoff, plan-feature, build-task, ship, generate-asset,
                  design-taste (vendored) + registry.json
rules/            copied into your project — ~30 lines, always loaded
recipes/          per-stack verify contracts and pitfalls
template/         thin front door to fork
scripts/          validate.mjs (CI checks) + gen/ (asset generation)
```

## Contributing

```bash
node scripts/validate.mjs
```

Runs in CI on every push and PR. No dependencies — `node:` builtins only. It checks frontmatter parses and uses real keys, skill names match their directories, hook events and shapes are valid, manifests agree, recipes carry a verification-strength field, and docs use the namespaced command form. Every check exists because that exact thing broke at least once.


## Costs

The framework isn't free — its rules and skill descriptions ride along in every turn. Measured footprint: **~1,037 tokens per turn** (~558 of rules, ~478 of skill descriptions). Skill bodies and recipes are another ~3.4k, but those load only when actually used.

It ships `.mcp.json` empty on purpose: MCP tool schemas are the single largest avoidable context cost, often larger than everything above combined. Add servers only when you need them. If you're low on credits, `/easyclaude:cheap` is the answer.

MIT.
