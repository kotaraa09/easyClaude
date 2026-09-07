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

## What you actually get

**It remembers.** `docs/STATE.md` holds what's in progress, what's next, what's blocked, and what was skipped. Every session opens with a three-line orientation instead of you re-explaining the project.

**"Done" means verified.** Kickoff establishes a verify contract for *your* stack — the commands that must exit clean. Once you have a test suite, a Stop hook blocks the turn from ending while they fail, sending Claude back to fix them. No more `✅ All done!` on top of a red build.

It won't trap you: Claude Code caps consecutive Stop-hook blocks and overrides after a few, so a gate that can't be satisfied gives up rather than wedging your session. Raise the cap with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` if you want it stricter.

**Guardrails that don't need cooperation.** `rm -rf`, force pushes, hard resets, curl-pipe-sh, reads and writes to `.env`, and lockfile edits are denied at the permission layer — not requested politely in a prompt.

**`/cheap` for when credits are short.** One command, one turn: cheaper model, no subagents, narrowest working solution, and a closing line listing what it skipped. It expires by itself, so you can't forget you left it on.

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
| *"/cheap fix the login redirect"* | Cheapest working fix, this turn only |

Small changes skip the ceremony entirely — a bug fix is just a bug fix.

## Design assets

`design/tokens.md` is the file that drives consistent UI. Reference screenshots go in `design/refs/` with a one-line description each in `INDEX.md` — images cost ~1.5k tokens to look at, so the text is what gets read and the images get opened only when they're worth it. Use them once to derive tokens, then let the tokens do the work.

## Layout

```
.claude-plugin/   plugin + marketplace manifests
hooks/            SessionStart orientation, adaptive Stop gate
commands/         /cheap, /cheap-session, /full
skills/           kickoff, plan-feature, build-task, ship
rules/            copied into your project — ~30 lines, always loaded
recipes/          per-stack verify contracts and pitfalls
template/         thin front door to fork
```

## Costs

The framework isn't free — its rules and skill descriptions ride along in every turn. Measured footprint: **~810 tokens per turn** (~560 of rules, ~250 of skill descriptions). Skill bodies and recipes are another ~3.4k, but those load only when actually used.

It ships `.mcp.json` empty on purpose: MCP tool schemas are the single largest avoidable context cost, often larger than everything above combined. Add servers only when you need them. If you're low on credits, `/cheap` is the answer.

MIT.
