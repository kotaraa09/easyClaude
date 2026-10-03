# Roadmap

What comes next for easyClaude, in order, and why. The goal: a beginner with no coding
knowledge gets an agent workflow as good as the big labs' own, from one plugin, with
nothing to learn first. Last reviewed on 2026-10-03, at 0.2.7.

Every item says how we will know it worked. Since 0.1.10, `node scripts/bench.mjs` gives
that answer: beginner tasks, hidden tests, with and without easyClaude. An item that
cannot be measured there says what stands in for it. Twice so far, an instruction inside
a skill or a rule file did not change what Claude did, and a line sent with the message
did. So every behaviour item below is checked in the benchmark, not by reading
the skill.

Efforts are working time. Benchmark runs are on top: about $0.60 per small task and $2.50
for the two-session task at list price, which is plan usage on a Claude plan.

## Now

### 1. A test machine that can run commands

**Why.** On native Windows the eval runner grants no shell, because it has no sandbox
there. Neither arm can run a command, but easyClaude's verify gate still runs the tests,
because it is a hook. Every figure in `evals/README.md` leans toward easyClaude for that
reason, and the tasks in items 2 and 3 cannot be tested fairly at all.

**What.** Run the benchmark under WSL2 or Linux with `--shell`, and re-run the no-easyClaude
arm with `--fresh-baseline`. Say in `evals/README.md` which figures are the fair ones.
Optional later: a manually triggered GitHub Actions job, which needs an API key secret
and bills real money rather than plan usage.

**Needs a decision.** Installing WSL2 changes the machine, so the owner does it:
`wsl --install -d Ubuntu`, then Node 22, Git and Claude Code inside it.

**Done when.** A full `--shell` run is published beside the Windows one. **Effort:** half
a day, plus about $5 of runs.

### 2. Benchmark: a change that breaks something nobody mentioned

**Why.** A beginner cannot see what a change broke elsewhere. This is where the verify
gate should earn its cost, and no task measures it yet.

**What.** A task whose obvious fix breaks another, untested-by-the-user feature, with a
test for that feature already in the project. Graded on both features working.

**Done when.** The task runs in both arms with a shell. **Effort:** 1 day.

### 3. Benchmark: "I want yesterday's version back"

**Why.** The rescue skill exists because Claude restored files before asking, twice, in
testing. The trigger case shows it asks first (3/3, against 1/3 without), but a judge read
the reply. Nothing checks the files, and that needs git, so it needs item 1.

**What.** The `rescue` variant of the sample project already exists. Grade on: the old
version is back, today's uncommitted work still exists somewhere recoverable, and the
reply asked before overwriting.

**Done when.** The task runs in both arms with a shell. **Effort:** 1 day.

## Next

### 4. Benchmark: a button that does nothing

**Why.** 0.2.4 released the page check: when a turn changed a web page and nothing looked
at it, the gate holds the turn once. The free tests pin the hold, and `fix-checkout` still
passes with it. No task yet shows that it catches a bug a beginner would see.

**What.** A task with a visible bug, such as a button with no handler, where the hidden
tests pass before and after. Graded on the button working. The eval has no browser, so
with easyClaude the expected reply says how to see it; with a browser tool, a later run
shows whether Claude looks.

**Done when.** The task runs in both arms. **Effort:** 1-2 days.

### 5. Fewer permission prompts a beginner cannot answer

**Why.** Claude Code asks "allow this command?" often. A beginner says yes to everything
or stops. The deny rules are not a security boundary, and the Claude Code docs say so.

**What.** Kickoff offers Claude Code's sandbox and auto mode, explained in one sentence
each, with the deny rules kept as a second layer.

**Done when.** A setup check confirms both are on, and the benchmark scores do not drop
with them on. **Effort:** 3-5 days.

**Waits for item 1.** Claude Code's sandbox is not available on native Windows, so neither
the setup check nor the benchmark run can be tested on the current test machine.

### 6. Trigger cases that show a difference

**Why.** On `plan-feature`, `ship`, `debug` and the typo fix, plain Claude passes the same
grader as easyClaude. Those cases prove the skill fires, not that it helps. And four skills
that fire on their own have no sentence that should not reach them.

**What.** Sharper outcome criteria for those four cases. A should-not-fire case each for
`build-task`, `debug`, `rescue` and `kickoff`. A sample project large enough that one
search does not find a name, so `explore-code` can fire (0/3 now, and correctly).

**Done when.** Every skill that fires on its own has a case that should reach it and one
that should not, and each case either differs between arms or says why it cannot.
**Effort:** 2-3 days, plus about $10 of runs.

## Later

- **A progress panel, once plugin panels are on for everyone.** A beginner cannot see how
  much of a feature is done without opening `docs/STATE.md`. Claude Code's function hooks
  ("mods") can draw a pane beside the conversation, with Buttons that send a prompt
  (`$.prompt.submit`), in the terminal and the desktop app. Checked on 2026-10-03 with
  Claude Code 2.1.284/2.1.286, in a copy of this plugin:
  - One plugin can carry both kinds. `hooks/hooks.json` took `"modules": ["./register.ts"]`
    beside the existing `"hooks"`, `claude plugin validate` passed, and in one session the
    module loaded and `session-start.mjs` ran as before. No second install.
  - An installed plugin's module loads only with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in
    the environment (early access). Without it the debug log says "hooks modules are not
    turned on for installed plugins" and everything else works. The API also changes
    between releases. So we wait.

  **Start when** a plugin installed from the marketplace loads its module with no variable
  set. To check: copy the plugin, add the module line and a `register.ts` that calls
  `$.ui.status`, run `claude -p "hi" --plugin-dir <copy> --debug`, and look for
  "hooks module easyclaude@inline loaded" in `~/.claude/debug`. A few cents a run.

  **Decide first.** The panel cannot count "3 of 5 done" today: `build-task` moves each
  finished task to `## Done` as a loose line, so it leaves its feature's list. Ticking
  tasks in place (`- [x]`) under the feature heading would fix that, but it changes what
  every session reads back, so it goes through the benchmark like any behaviour change.

  **What.** A pane with the feature, its tasks done and left, and the last check result
  (`lastSeen` in `tree-state.mjs` keeps the failed steps); then Buttons for Continue, Fix
  the problem, Undo the last change and Save my work, each sending the sentence the skills
  already answer. Without function hooks, nothing changes. **Done when.** A beginner sees
  progress without asking; the benchmark cannot see a pane, so a session with a person
  stands in for it. **Effort:** half a day for the format change, 1 day for the pane, 1 day
  for the Buttons.

- **The install, tried on a clean machine.** 0.2.5 found that `/plugin` in the desktop app
  only browses, so 0.2.6 installs by pasting a prompt. Nobody has tried that prompt on a
  computer with nothing installed. `template/` should offer the install when the folder is
  trusted; in the desktop app that offer did not appear.
- **The skills offer, end to end.** At the end of setup, easyClaude offers at most two skills.
  In the eval, Claude Code refused every write into `.claude/`, so no run installed one.
  A run that allows it would show the install works, and the cost it quotes is right.
- **Planning that waits for a yes, measured.** `plan-feature` stops and asks before it
  builds. The benchmark sends one message per session, so it cannot answer "yes" yet. A
  saved conversation (`context.history_file`) could.
- **Larger samples.** Three runs per task moves by one or two between days. Five runs on
  the tasks that differ between arms, once the figures are used to decide something.
- **Claude Code's own memory.** Eval runs start without it. A run with it on would show
  whether the two-session result holds for users who have it.
- **Hook messages in the user's language.** Cost notices are English, because Claude Code
  shows them before Claude reads anything. Only a translation table could change that.
- **English notes to a Thai user, without plain answers.** 0.2.0 made them rarer, not gone:
  one Thai bug-fix run of three on 2026-09-26 still opened with an English note. With the
  plain style on, none did. Five runs would show whether the language line needs more.

## Not planned

- **API keys in the system password store.** Claude Code's plugin settings can keep a key
  in secure storage, but the key then reaches only the plugin's own hooks and servers, not
  the scripts that generate assets or connect servers. It would also show a key form to
  every user at install. Decided against on 2026-09-25. Keys stay in the user's own
  Claude Code config, readable only by them.

## Done

- **0.1.9** - Guardrails that actually match, PowerShell coverage on Windows, the gate kept
  across compaction, cost notices before a resume or a model switch.
- **0.1.10** - The outcome benchmark. English replies stay English; a bug fix gets a test.
- **0.1.11** - Work left for later survives to the next session, and "finish the rest"
  finishes it. Two-session task: 3/3 with easyClaude, 0/3 without.
- **0.2.0** - Two tasks in Thai. They found English notes between steps for a
  Thai user in the bug-fix task, now fixed: 3/3 with easyClaude, 1/3 without.
- **0.2.1** - Plain answers: an output style kickoff offers, and
  `/easyclaude:plain` turns on. Every task still works; code terms in replies fell from 42.6
  to 5.6, and replies are 11% shorter.
- **0.2.2** - Start from nothing installed. Before setup, easyClaude says in plain words
  that git, or a git name and email, is missing, and how to fix it; kickoff checks for
  Node.js when the opener never ran, and starts a git history. The README lists what to
  install and has a desktop-app path. Tests with git off the PATH stand in for the
  benchmark, which always starts on a complete machine.
- **0.2.3** - "How do I ship this?" gets an answer, not a release. A new case found `ship`
  firing on the question 3/3, stopped only by the missing shell; now 0/3, and "ship it"
  still 3/3. A case for setup in an empty folder: 3/3 with easyClaude, 0/3 without. The
  per-turn cost is re-measured: ~1,575 tokens.
- **0.2.4** - A web page that changed must be looked at. When the checks pass and a turn
  changed a page nobody looked at, the gate holds it once: look with a browser tool, or tell
  the user how to open the real page and what to click. `fix-checkout` still 3/3, at about
  $0.25 a run (was $0.20). Its own benchmark task is item 4. The benchmark now builds its
  sample project from a PowerShell terminal too.
- **0.2.5** - Fixes from the first real use, in the desktop app: plans ask more when the request
  is short, name a free library before hand-building a calendar or a map, the `/clear` advice
  comes back after each `/clear`, and the skill catalogue covers games. The calendar case:
  3/3 with easyClaude, 2/3 without.
- **0.2.7** - Every message easyClaude sends Claude goes through one language step. The
  0.2.6 benchmark, both arms fresh, found the Thai tasks at 2/6, after the page check's English
  hold; now 6/6. All tasks: 20/21 with easyClaude, 14/21 without.
- **0.2.6** - Skills that fit the project, offered at the end of setup with a cost in tokens,
  and `/easyclaude:skills` works out the project with no category. A shorter README, in both
  languages, that installs by pasting a prompt and compares plain Claude Code with easyClaude
  on the same requests, ties included.
