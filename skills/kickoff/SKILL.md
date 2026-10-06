---
name: kickoff
description: Set up a project for easyClaude with a short interview, then write its state file, checks and rules. Use when the session opener says to, or when the user asks to set up easyClaude or start a new project.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Kickoff

Sets up the project so every later session starts oriented. Runs once.

**Tone:** most users here are beginners. Ask few questions, in plain language, and make the obvious call yourself rather than presenting a menu. Never ask about anything you can detect. Every word you write reaches the user, so write no notes to yourself, such as "Next question: must-have", and write everything in the language the user writes in.

## 1. Decide the mode

- **Greenfield** — no source files. Interview, then scaffold.
- **Adopt** — source files already exist. Skip the scaffold. Detect everything you can, and ask only what the code cannot tell you (who it's for, what's next).

**Check the tools.** The session opener sends a line that starts "Tools check:", and says there
what this computer is missing. If it sent none, the opener never ran, which almost always means
Node.js is not installed. Then run `node --version` and `git --version`. For each that fails, tell
the user in plain words what they lose and the fix, in their language:

- Node.js runs easyClaude's memory between sessions and its checks after each change. Without it,
  neither happens. The fix: install the LTS version from https://nodejs.org, then reopen Claude.
- Git keeps the saved versions that "go back to yesterday" needs. The fix: https://git-scm.com.

Then carry on with setup. The files it writes start working once the tool is installed.

## 2. Interview — maximum four questions

Ask these one message at a time, not as a wall. Do not number or label them in your reply -
the user sees "Question 3" as a form to fill in, and the numbers below skip whatever you
could already answer:

1. What are you building, in a sentence?
2. Who uses it?
3. Is there anything it absolutely must do to count as working? *(this becomes the first milestone)*
4. Only if greenfield and undetectable: what are you building it with? Offer a recommendation rather than a list — if they don't know, pick for them and say why in one line.

Do not ask about architecture, testing philosophy, or deployment. Decide those and record them in `docs/DECISIONS.md`.

**End your last question with the permission warning.** Steps 4 to 6 write into `.claude/`,
and Claude Code asks permission for every file there, even when edits are allowed. Add one or
two plain sentences below the question: after their answer you will set the project up, Claude
Code will ask a few times to save settings files, those hold the working rules, the safety
blocks and the list of checks, and saying yes is safe. In adopt mode with nothing to ask, say
it in your first message instead.

**In the same message, offer plain answers.** One yes-or-no line: should your answers be short
and in plain words, without file names or code terms? Say they can switch it later with
`/easyclaude:plain`. Only a clear yes turns it on in step 6; no answer means off. It is offered,
never assumed: a user who reads code loses detail they want.

A beginner who meets five unexplained prompts about `settings.json` either refuses them all or
learns to click yes on anything - and the second habit is the one that hurts them later. The
warning is here, in a turn that is only text, because an instruction to say it just before
the first write was skipped in testing: the writes happen in a run of tool calls, and nothing
in between gets said.

## 3. Detect the stack

Look for markers before asking anything:

`package.json` · `next.config.*` · `vite.config.*` · `index.html` *(with no `package.json` — a plain static site)* · `pyproject.toml` · `requirements.txt` · `go.mod` · `Cargo.toml` · `build.gradle*` · `pom.xml` · `*.csproj` · `Package.swift` · `pubspec.yaml` · `Gemfile` · `composer.json` · `CMakeLists.txt` · `*.sln` · `ProjectSettings/` *(Unity)*

Every marker a shipped recipe detects on is in that list, and CI checks that it stays that way. `index.html` and `vite.config.*` were missing, so a plain website and a Vite project both fell through to "write a new recipe" past a finished one sitting in the folder.

Then read the matching recipe from `${CLAUDE_PLUGIN_ROOT}/recipes/`. If none matches, use `${CLAUDE_PLUGIN_ROOT}/recipes/README.md` to write a new one and tell the user it can be contributed back.

**In adopt mode, look for more than one app.** Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/find-apps.mjs`.
If it lists apps, follow it: a recipe for each app, and that app's steps in step 4 with `"dir"`
set to its folder. Tell the user in one plain line which apps you found. Markers at the root
alone missed a front end and a back end side by side, and one root `npm test` checked
whichever app it happened to reach.

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
- **Approve the contract once it is written.** Tell the user in one line which commands will run after each change, then run `node ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs --trust`. easyClaude runs no command from this file until it is approved on this computer, because a repository can ship one. They said yes to setup and you chose these commands, so approve the ones you wrote; a contract that came with the code waits for the user's own yes.
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

`permissions.deny` stops *you* reading `.env`; it does nothing about git. So make sure
`.gitignore` covers these three, adding them if the file is missing or short:

```
.env
.env.*
!.env.example
.claude/autoship.json
.claude/cheap-session
```

The last two are per-person authorisation — one lets a session push on that person's behalf,
the other lowers the standard of every turn. Committing either hands one person's choice to
everyone who clones the repo.

## 6. Write the files

Copy `${CLAUDE_PLUGIN_ROOT}/rules/*.md` into `.claude/rules/`, then create:

- `CLAUDE.md` — **five lines at most**, because it loads on every turn of every session: a title, one line on what this is and who it is for, one line naming the language the user writes in (replies and `docs/STATE.md` use it), and one line on the stack and how to run or preview it. Write it in English whatever the user writes in: only Claude reads it, and English takes the fewest tokens. No list of files and no pointer to the rules: `docs/` is easy to find, and `.claude/rules/` loads without one. Measured, a 30-line version cost ~490 tokens on every turn.
- `docs/PRD.md` — the interview answers. One page.
- `docs/ARCHITECTURE.md` — stack and where things live.
- `docs/DECISIONS.md` — seed with the choices you made for them, each with a one-line reason.
- `docs/STATE.md` — from the template below.
- `design/tokens.md` — colors, type scale, spacing, radii. Only if the project has a UI.
- `.claude/settings.local.json` with `{ "outputStyle": "easyclaude:plain" }` — only if they said
  yes to plain answers. Add `.claude/settings.local.json` to `.gitignore`: it is one person's choice.

If git works and the folder is not a git repository yet, run `git init`: without history there
is no version to go back to. In greenfield, when git has a name and email, also commit what setup
wrote as the first saved version, once `git status` shows no installed packages and no `.env`. In adopt mode, commit nothing: their folder may hold files
that do not belong in history. Say it in one plain line at the close.

`docs/STATE.md` starts as:

```markdown
# State
<!-- Every session opens by reading Now, Next, Blocked and Debt back to the user. Write
     entries in the language the user writes in, and in their words: what they will see
     or be able to do. File names and technical terms go after a dash, if at all. -->

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

Keep those three comments. The first is what keeps the opener readable to the person it is read to. The other two are the only thing stopping the file that every session reads first from growing without bound. The next session has no other way to know these rules.

## 7. Close

Three lines: what you set up, what the verify command is, and the single next action. Then stop — do not start building unless asked.

If the project obviously wants a browser or live library docs, mention in **one line** that `/easyclaude:connect` wires those up from an API-key form — then drop it. It is an advanced option, not part of setup, and a project works fine with none.

easyClaude ships no design skill, no game skill, and no deep security or testing skill,
because bundling one picks it for every project that installs it. You know what this project
is now, so pick for the user instead of sending them to a list. Read
`reference/skills-catalogue.md` under `${CLAUDE_PLUGIN_ROOT}`, and choose **at most two** entries
that fit what they told you and what you detected: the engine's own plugin for a game, a design
pick for a website or app, a testing pick when the verify contract is weak. Never a design skill
for a game.

Offer them in the same closing message, after the three lines: each by name, what it adds in
one plain line, and what it costs on every turn from then on, as a number of tokens. Work the
number out from the catalogue's skill count at 25 to 60 tokens a skill. "A little" is not a
cost: in testing it was the word two replies of three used, and nobody can compare it. Ask one yes-or-no question. On a
yes, follow steps 5 and 6 of `commands/skills.md` under `${CLAUDE_PLUGIN_ROOT}`: scan, then
install. Install nothing without that yes, and nothing they did not pick. If no entry fits, say
nothing about skills.

A user who installs fifty skills pays more per turn than this whole framework, so the cost is
said before the choice, not after the bill.
