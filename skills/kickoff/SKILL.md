---
name: kickoff
description: Set up a project for easyClaude — interview the user about what they are building, detect the stack, and write the PRD, state file, verify contract, and project rules. Use when a project has no docs/STATE.md, when the user is starting something new from an empty directory, or when adopting easyClaude into an existing codebase.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Kickoff

Sets up the project so every later session starts oriented. Runs once.

**Tone:** most users here are beginners. Ask few questions, in plain language, and make the obvious call yourself rather than presenting a menu. Never ask about anything you can detect.

## 1. Decide the mode

- **Greenfield** — no source files. Interview, then scaffold.
- **Adopt** — source files already exist. Skip the scaffold. Detect everything you can, and ask only what the code cannot tell you (who it's for, what's next).

## 2. Interview — maximum four questions

Ask these one message at a time, not as a wall:

1. What are you building, in a sentence?
2. Who uses it?
3. Is there anything it absolutely must do to count as working? *(this becomes the first milestone)*
4. Only if greenfield and undetectable: what are you building it with? Offer a recommendation rather than a list — if they don't know, pick for them and say why in one line.

Do not ask about architecture, testing philosophy, or deployment. Decide those and record them in `docs/DECISIONS.md`.

## 3. Detect the stack

Look for markers before asking anything:

`package.json` · `next.config.*` · `pyproject.toml` · `requirements.txt` · `go.mod` · `Cargo.toml` · `build.gradle*` · `pom.xml` · `*.csproj` · `Package.swift` · `pubspec.yaml` · `Gemfile` · `composer.json` · `CMakeLists.txt` · `*.sln` · `ProjectSettings/` *(Unity)*

Then read the matching recipe from `${CLAUDE_PLUGIN_ROOT}/recipes/`. If none matches, use `${CLAUDE_PLUGIN_ROOT}/recipes/README.md` to write a new one and tell the user it can be contributed back.

## 4. Establish the verify contract — the important step

Every project needs one command per check that exits non-zero on failure. Write `.claude/verify.json`:

```json
{
  "steps": [
    { "name": "typecheck", "cmd": "npx tsc --noEmit" },
    { "name": "test",      "cmd": "npm test", "tier": "full" }
  ]
}
```

Rules:
- **Run every step once before writing the file.** A verify contract that has never passed is worse than none — it teaches the gate to be ignored.
- **Time each step while you run it, and set `"tier": "full"` on anything slower than about 30 seconds.** Untagged steps are `fast` and run at the end of every turn; `full` steps run when a task is finished and when shipping. You have just measured these commands, so tier them on what you observed rather than on what you assume — a two-second typecheck belongs in the per-turn gate and a four-minute browser suite does not. If everything is quick, tag nothing; a single-tier contract is the stricter arrangement and there is no reason to give that up.
- If a step can't run because the toolchain is missing, say so plainly, tell the user exactly what to install, and omit that step. Do not invent a step you couldn't execute.
- **Be honest about weak verification.** GUI-centric stacks (Unity, Unreal, Android Studio, iOS) often can't be verified headlessly. If so, write what you can (a compile step at minimum), and tell the user in one line: *"On this stack I can verify it compiles, but not that it works — you'll need to run it yourself."* Never imply a guarantee you can't deliver.

## 5. Wire the gate — writing step 4 already did it

The plugin's Stop hook runs `.claude/verify.json` itself, so there is nothing further to wire.
**Do not add a Stop hook to the project's `.claude/settings.json`** — a second one would run the
same commands twice, and slow gates are the ones people delete.

Say in one line what the gate now covers, and be exact about it. A contract that is only a
typecheck catches type errors and nothing else; it does not prove the thing works. That gap is
the honest argument for `/easyclaude:write-tests`, which widens the contract — not a promise the
gate already keeps. Mention it once and don't push it.

Add the guardrails from `${CLAUDE_PLUGIN_ROOT}/rules/permissions.json` into `permissions.deny`.

## 6. Write the files

Copy `${CLAUDE_PLUGIN_ROOT}/rules/*.md` into `.claude/rules/`, then create:

- `CLAUDE.md` — under 30 lines: what this is, the stack, and a pointer to `.claude/rules/`. Nothing that's derivable from the code.
- `docs/PRD.md` — the interview answers. One page.
- `docs/ARCHITECTURE.md` — stack and where things live.
- `docs/DECISIONS.md` — seed with the choices you made for them, each with a one-line reason.
- `docs/STATE.md` — from the template below.
- `design/tokens.md` — colors, type scale, spacing, radii. Only if the project has a UI.

`docs/STATE.md` starts as:

```markdown
# State

## Now
(nothing in progress)

## Next
- [ ] <first milestone from question 3, split into 3-5 tasks>

## Blocked
none

## Debt
<!-- Deliberately skipped work, specific enough to act on later. Read back at plan
     time: anything here touching the area being planned becomes a candidate task. -->

## Done
<!-- The ten most recent. Older entries move to docs/CHANGELOG.md, newest first -
     never deleted, just moved. This file is read at the start of every session. -->
```

Keep those two comments. They are the only thing stopping the file that every session reads first from growing without bound, and the next session has no other way to know the rule.

## 7. Close

Three lines: what you set up, what the verify command is, and the single next action. Then stop — do not start building unless asked.

If the project obviously wants a browser, a database, or live library docs, mention in **one line** that `/easyclaude:connect` wires those up from an API-key form — then drop it. It is an advanced option, not part of setup, and a project works fine with none.
