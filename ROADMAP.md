# Roadmap

What comes next for easyClaude, in order, and why. The goal: a beginner with no coding
knowledge gets an agent workflow as good as the big labs' own, from one plugin, with
nothing to learn first. Last reviewed on 2026-10-14, at 1.3.0.

**What a prompt is worth, measured 2026-10-11.** The four outcome tasks were each asked four
ways: two beginner wordings, and two expert wordings that add only general good practice.
Without easyClaude, the expert wordings passed 40 of 40 and the beginner wordings 31 of 40.
With easyClaude, the beginners passed 40 of 40 and the experts 39 of 40. The whole gap came
from one task, `fix-checkout`: the experts asked for a regression test, and the beginners
got one only from the `debug` skill. The other three tasks passed every time at every
wording, so they cannot show a gap. Items 1, 2 and 9 aim at the tasks that can. Item 2's
task, on 2026-10-14, also passed every time in both arms; item 9's `sold-out` showed a
prompt gap (beginners 7 of 12, experts 12 of 12), and no clear share for easyClaude.

Every item says how we will know it worked. Since 0.1.10, `node scripts/bench.mjs` gives
that answer: beginner tasks, hidden tests, with and without easyClaude. An item that
cannot be measured there says what stands in for it. Twice so far, an instruction inside
a skill or a rule file did not change what Claude did, and a line sent with the message
did. So every behaviour item below is checked in the benchmark, not by reading
the skill.

Efforts are working time. Benchmark runs are on top: about $0.60 per small task and $2.50
for the two-session task at list price, which is plan usage on a Claude plan.
## Now: small and cheap

Each item here is a few days at most, and costs a few dollars of runs or none.

### 4. Benchmark: a button that does nothing

**Why.** 0.2.4 released the page check: when a turn changed a web page and nothing looked
at it, the gate holds the turn once. The free tests pin the hold, and `fix-checkout` still
passes with it. No task yet shows that it catches a bug a beginner would see.

**What.** A task with a visible bug, such as a button with no handler, where the hidden
tests pass before and after. Graded on the button working. The eval has no browser, so
with easyClaude the expected reply says how to see it; with a browser tool, a later run
shows whether Claude looks.

**Done when.** The task runs in both arms. **Effort:** 1-2 days.

### 10. Checks that stay fast as a project grows

**Why.** easyClaude runs the project's checks after each change. In a small project that
takes seconds. A project with a test for every feature, a build and a browser test can take
minutes, and then every change waits for it. The gate already has two tiers (fast after
each change, full at the end of a task and at ship), runs only the checks of the app a
change is in, and skips a change to notes. It still runs the whole fast tier for any code
change, and no measurement uses a project larger than the sample plant shop.

**What.** A large sample project: many features, a test file each, a build, a slow
end-to-end test. Measure the wait per change. Then, where the test tool supports it, let a
fast step run only the tests related to the changed files (`vitest related`,
`jest --findRelatedTests`, `pytest` with a changed-file list), with the whole suite kept for
the full tier. Kickoff sorts a slow build or browser test into the full tier, and says so.

**Done when.** On the large sample, the wait after a one-file change stays under 30
seconds, and the full tier at ship still catches a bug the fast tier missed. **Effort:**
3-4 days, plus about $5 of runs.

**Built for JavaScript, 2026-10-11, waits for a release (#107).** A step's `"related"`
command runs after each change on the changed source files; kickoff adds it for Vitest and
Jest. On a 200-feature Vitest sample the wait after a one-file change fell from 49 seconds
to 7-8, and 15 for a helper 40 features use. A bug in the changed feature still blocked the
turn, and a test that reads a file without importing it, which the narrow run cannot see,
failed at the end of the task. Measured with the test tools directly, not in benchmark runs
with Claude, so no money was spent. **Left:** `pytest` (about 1 day).

### Test speed of easyClaude itself

Since #108 each test area runs in its own process: the full run fell from 306 to about 120
seconds, and warns over 5 minutes. When it warns, run only the areas a change uses (about
1 day), and remove tests that check the same thing twice (half a day each review).

## Waits for budget: a large project or many runs

Each item here needs a larger sample project, which takes 2-3 days to build, or more than
about $8 of runs. Three tasks on the four-file plant shop (items 2 and 7, and the prompt
measurement) passed every time without easyClaude: one search shows the whole project. So
items 2, 6, 8 and 10 can share one larger sample, built once.

- **A larger sample project.** Many features in many files, so one search does not show
  everything a change reaches. Items 2 (again), 6 and 8 need it; item 10 measured its own
  200-feature sample without Claude. **Effort:** 2-3 days, then about $5 per task to run.

### 8. Look before you edit, measured first

**Why.** A beginner cannot see what a change broke elsewhere (item 2). ECC's GateGuard
makes Claude list a file's importers before every edit; it works, and it adds a step to
every edit. That is worth it only if it catches breakage the checks miss.

**What.** A light form: before the first edit to a file in a turn, Claude names what uses
that file, from one search. Nothing for new files, notes, or the plan. A hook supplies the
line, because a rule inside a skill did not change behaviour in earlier tests.

**Done when.** Item 2's task, which breaks a feature nobody mentioned, passes more often
with it than without, and the added cost per task is stated. If it does not, it is not
shipped. **Effort:** 2 days, including the measurement.

**Waits for a task that shows a gap.** Item 2's task passed 3/3 without easyClaude, because
plain Claude already looked at what the shared code touched. Item 8 cannot pass more often
than that. It waits for a version of item 2's task in a larger project.

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

### 5. Fewer permission prompts a beginner cannot answer

**Why.** Claude Code asks "allow this command?" often. A beginner says yes to everything
or stops. The deny rules are not a security boundary, and the Claude Code docs say so.

**What.** Kickoff offers Claude Code's sandbox and auto mode, explained in one sentence
each, with the deny rules kept as a second layer.

**Done when.** A setup check confirms both are on, and the benchmark scores do not drop
with them on. **Effort:** 3-5 days.

**Can start.** Claude Code's sandbox is not available on native Windows. Item 1 gave the
test machine Ubuntu under WSL2, where the setup check and the benchmark run can both be tested.

- **Prompt wordings in Thai.** Most easyClaude users write in Thai. A beginner and a terse
  beginner wording in Thai for the four outcome tasks, both arms. About $8 of runs.
- **Expert wordings written by people.** Claude wrote the expert prompts of the 2026-10-11
  measurement. One or two people who write prompts for a living would make the expert side
  a real one.
- **More runs only where it is close.** Five runs per wording is enough at 100% against
  78%. Ten only for a task whose two sides fall within each other's range. First: `sold-out`
  (item 9), two more runs a wording, about $5, to see whether easyClaude helps a beginner there.
- **Larger samples.** Three runs per task moves by one or two between days. Five runs on
  the tasks that differ between arms, once the figures are used to decide something.
- **Claude Code's own memory.** Eval runs start without it. A run with it on would show
  whether the two-session result holds for users who have it.

## Later

- **Panels for everyone.** 1.1.0 ships a progress panel and a control panel as a Claude
  Code hooks module (`hooks/panels.tsx`). On 2026-10-06 installed plugins' modules loaded on
  Claude Code 2.1.288 with no variable set, behind a server rollout flag
  (`tengu_plugin_hooks_modules`) that was off for this account on 2026-10-03; 2.1.284 still
  needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. The API is early access. **Watch for** the
  flag reaching every account, and an API change that breaks the panels: `claude plugin
  test .` from the plugin root runs their tests. A session with a person stands in for a
  benchmark, which cannot see a panel.
- **The install, tried on a clean machine.** 0.2.5 found that `/plugin` in the desktop app
  only browses, so 0.2.6 installs by pasting a prompt. Nobody has tried that prompt on a
  computer with nothing installed. `template/` should offer the install when the folder is
  trusted; in the desktop app that offer did not appear.
- **The skills offer, end to end.** At the end of setup, easyClaude offers at most two skills.
  In the eval, Claude Code refused every write into `.claude/`, so no run installed one.
  A run that allows it would show the install works, and the cost it quotes is right.
- **Planning that waits for a yes, measured.** `plan-feature` stops and asks before it
  builds. The benchmark sends one message per session. Since item 3, a case can start from a
  saved conversation (`context.history_file`), so a case could send the "yes". About 1 day.
- **Hook messages in the user's language.** Cost notices are English, because Claude Code
  shows them before Claude reads anything. Only a translation table could change that.
- **English notes to a Thai user, without plain answers.** 0.2.0 made them rarer, not gone:
  one Thai bug-fix run of three on 2026-09-26 still opened with an English note. With the
  plain style on, none did. Five runs would show whether the language line needs more.

## Done this round

### 1. A test machine that can run commands - done

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

It also gives the prompt measurement its fair figure: with a shell, plain Claude can run
the tests an expert's request asks it to run.

**Done, 2026-10-14.** The full `--shell` run is in `evals/README.md`: 19/21 with easyClaude,
15/21 without, against 20/21 and 14/21 without a shell. The gap is in `fix-checkout` and
`two-sessions`. The run found and fixed three faults in the benchmark on Linux. It cost
about $14.50 in all, most of it on finding those faults.

### 2. Benchmark: a change that breaks something nobody mentioned

**Why.** A beginner cannot see what a change broke elsewhere. This is where the verify
gate should earn its cost, and no task measures it yet.

**What.** A task whose obvious fix breaks another, untested-by-the-user feature, with a
test for that feature already in the project. Graded on both features working.

**Done when.** The task runs in both arms with a shell, at a beginner and an expert wording.
An expert asks "keep everything else working"; a beginner does not. **Effort:** 1 day.

**Done, 2026-10-14: no gap.** `outcome-cart-badge`: the cart badge and the receipt share one
price format, and the request asks for whole dollars on the badge only. Under WSL2 with a
shell, three runs each: 3/3 with easyClaude and 3/3 without, at the beginner and the
`expert-checklist` wording. No run broke the receipt. Plain Claude ran the tests
itself, and at the expert wording it also listed what else used the format before it edited.
In a project of four source files, one search shows everything a change touches, so the trap
is in plain sight. A task that can show a gap needs the shared code out of sight: a larger
project, as items 6 and 10 also need. Spent: $2.74.

### 3. Benchmark: "I want yesterday's version back"

**Why.** The rescue skill exists because Claude restored files before asking, twice, in
testing. The trigger case shows it asks first (3/3, against 1/3 without), but a judge read
the reply. Nothing checks the files, and that needs git, so it needs item 1.

**What.** The `rescue` variant of the sample project already exists. Grade on: the old
version is back, today's uncommitted work still exists somewhere recoverable, and the
reply asked before overwriting.

**Done when.** The task runs in both arms with a shell. **Effort:** 1 day.

**Done, 2026-10-14.** Two tasks, three runs each arm, under WSL2 with a shell. `rescue-asks`,
the first turn: 3/3 in both arms; everyone asked first. `rescue-restore` starts from a saved
first turn (`context.history_file`, now accepted by `validate.mjs`) and sends the yes: 3/3
with easyClaude, 2/3 without. The miss threw today's unsaved edits away for good and said
git could bring them back. Spent: $1.45.

### 9. Benchmark: a request that hides a requirement

**Why.** A short request leaves things out, and a beginner leaves out the most. easyClaude
asks when a request can mean two things, but no outcome task needs a question to pass. On
the four tasks of the prompt measurement, a beginner's wording already passed at 100%.

**What.** A task where the hidden tests expect something the request does not say. Example:
"add a sold-out option", where a sold-out plant must also be refused at checkout. Asked at
the four wordings of `evals/prompt-levels/`, in both arms. A run that asks a good question
must be able to pass: a second turn from a saved conversation (`context.history_file`)
answers it.

**Done when.** The task runs at all four wordings, both arms, 5 runs each, and the gap
between beginner and expert is stated with and without easyClaude. **Effort:** 1-2 days,
plus about $10 of runs.

**Done at three runs, 2026-10-14: the wording matters, easyClaude's share is unclear.**
`sold-out`, three runs each arm, at all four wordings. A run passes if the cart or the
checkout refuses a sold-out plant, or if it asks about buying one before it builds; a fixed
second turn could not answer whatever was asked, so the question counts instead.

| wording | with easyClaude | without |
|---|---|---|
| `beginner` | 2/3 | 0/3 |
| `beginner-terse` | 2/3 | 3/3 |
| `expert-checklist` | 3/3 | 3/3 (2/3 before "let me know" counted as asking) |
| `expert-spec` | 3/3 | 3/3 |

Beginners passed 7 of 12 and experts 12 of 12, so the hidden requirement is a real prompt
gap. With easyClaude the beginner side passed 4 of 6, against 3 of 6 without: one run, which
three runs a wording cannot tell from chance. A miss in either arm was a "sold out" label on
the page that a shopper could still buy past. Spent: $7.30. Two more runs a wording, about $5,
is under "Waits for budget".

## Stopped

### 7. A short review when a task is finished

**Why.** The diff reviewer runs only at `ship`. A beginner who never ships, or ships
weeks later, gets no second reader at all. ECC (everything-claude-code) reviews every
change; that is the expense this plugin exists to avoid, so this reviews once a task.

**What.** When `build-task` finishes a task, the `easyclaude-diff-reviewer` reads that
task's diff once, on a small model, with the same four questions it asks at `ship`.
Findings it is sure of are fixed before the task is called done; the rest go under
`## Debt`. No review per edit, and none for a change to notes or the plan.

**Done when.** A benchmark task with a bug a reader catches and the tests do not (an
empty list, a failure caught and dropped) passes more often with the review than without,
and the added cost per task is measured and stated. **Effort:** 1 day, plus about $5 of
runs. Estimated cost: about $0.02 a task.

**Stopped, 2026-10-09.** Not shipped: no task was found where it helps. The review first
sat in `build-task`, and six runs of six answered "Next, please add ..." without any skill,
so it never ran; it moved to the Stop hook (`scripts/review-check.mjs`), as items 2 and 8
expect. Then four tasks with an input the request does not mention - the same plant added
twice, a $5 code on a $3 order, a quantity left out, broken gift card codes - were run on
1.2.2 with Sonnet 5, and every run handled the input with no reviewer. A second reader
adds a step to every change; without a task it improves, that is the cost this plugin
exists to avoid. The branch was removed on 2026-10-14; rebuild from this note. It had
`scripts/review-check.mjs`, which `verify.mjs` called when a turn changed code and the
checks passed, to ask the diff reviewer for one read of that task's diff; and the four
cases, `outcome-plant-limit`, `outcome-fixed-code`, `outcome-merge-lines` and
`outcome-gift-card`, each a `prompt.md` plus a hidden test. Try again with a change across several files, or an error
the code hides, before a second attempt. Spent: $2.55.

## Not planned

- **API keys in the system password store.** Claude Code's plugin settings can keep a key
  in secure storage, but the key then reaches only the plugin's own hooks and servers, not
  the scripts that generate assets or connect servers. It would also show a key form to
  every user at install. Decided against on 2026-09-25. Keys stay in the user's own
  Claude Code config, readable only by them.
- **Cheap mode that hands the work to a Haiku helper.** For users who stay on Opus and never
  run `/model sonnet`. Measured on 2026-10-14 under WSL2 with a shell, four outcome tasks,
  three runs each: Opus 5.5 with a Haiku 5.5 helper cost 13% less than cheap mode on Opus
  ($0.47 against $0.54 for the four tasks), from 5% on the rename to 37% on shipping. A new
  conversation costs about $0.10 on Opus before any work, and a helper cannot remove that.
  The payment task stayed on Opus and cost 25% more. Cheap mode on Sonnet 5.5 cost less than
  either, $0.31 for the four. Every arm fixed every task. Decided against: under the 50%
  that would pay for the risk of Haiku failing a harder task. **Revisit** if a measurement
  of larger tasks shows more than 40%.

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
- **1.0.0** - The first stable release, after a review for bugs and security holes. A
  project's checks run only after the user approves the commands on their computer, and a
  repository's own autoship or cheap-mode file arms nothing. Claude asks when a request can
  mean two things: on "sort the plants" it asked first in 9 of 9 runs, over two wordings of
  the rule, against 4 of 6 without easyClaude; the final wording also named its pick, 3/3.
  The message hook stops reading helper reports as the user, the page check's last reply
  says what changed (typo case 0/3 to 3/3), and the unsupported Postgres connector is gone.
  Measured cost: ~1,710 tokens per turn in a set-up project.
- **1.1.0** - Projects that already exist. Setup scans first: it keeps planning notes off a
  published docs site, adds to an existing `CLAUDE.md`, `AGENTS.md`, architecture file or
  ADR folder instead of replacing them, and gives each app in a multi-app folder its own
  checks, which run only for the app a change is in. A new task, setup in a project someone
  else started: 3/3. A commit that would save an API key or a private key is stopped. Autoship
  is a level you pick (`off`, `commit`, `push`, `pr`, `merge`) and stops the "should I
  commit?" questions; it is off without git. A progress panel and a control panel, where Claude
  Code shows plugin panels. Measured cost: ~1,708 tokens per turn, unchanged.
- **1.1.1** - The panels redesigned after the first look: a status label, a step bar and
  marked steps, the costs as figures, and the controls grouped, with **Autoship level** as a
  drop-down and a short explanation on hover. In a folder with no git, Autoship level is a
  Create repo button.
- **1.1.2** - The panels as they look on screen: the hover help no longer hides under the
  rows below it, each setting has a short note, divider lines no longer wrap, and the desktop
  app draws real bars. `scripts/preview-panels.mjs` loads a preview of the panels into a
  session, and a panel change is looked at before it is released.
- **1.1.3** - Fixes from a test in a new folder. Setup and planning ask in Claude Code's
  question form, and every form ends with "Ready?": only the user's "start building" ends
  the questions, and until then a hook holds every change outside the planning notes. The
  skill offer is a question in the setup form. Plain answers are on unless the user says no,
  from the first form. The progress panel shows the latest actions in plain words when
  Claude keeps no step list, and a hook asks Claude for a step list on the second change of
  a request. Autoship reports in plain words, without branch names. #87, #88, #89.
- **1.2.0** - The progress panel becomes a bar above the prompt (Savvy Progress, adapted),
  with a panel of the helpers Claude starts. A file tree beside the conversation, and Blast
  Radius, which holds a risky delete with Proceed and Cancel and works on Windows and in
  PowerShell; both are plugins of their own that install with easyClaude. The /clear
  reminder holds the first message of a long stretch with a note, as Cache Tax does,
  instead of asking Claude to say it. Every control panel button says what it does. #92.
- **1.2.1** - easyClaude loads after an update from 1.1.x. 1.2.0 listed the file tree and
  Blast Radius as dependencies, an update did not install them, and Claude Code then loaded
  none of easyClaude. They are companions now: the first session says once which one is
  missing, with its install command, and the README installs all three. A release check in
  CI installs fresh and updates the last release, and fails when either does not load. #94.
- **1.2.2** - The helpers panel becomes the progress panel, in Savvy's style: the request's
  cost, actions and time, each step of Claude's step list (or the latest actions), then the
  helpers. A Details button on the bar opens it on every request. The control panel is short,
  with "What do these do?" for the explanations. A background task's report no longer
  replaces the request's title on the bar. #96.
- **1.2.3** - The bar says Waiting, not Done, while a test run or a helper Claude started in
  the background is still running, and the panel and the status line say what it waits for.
  A dev server or a watcher does not keep it waiting. Beginners had seen Done, found nothing
  yet, and said it did not work. #99.
- **1.3.0** - Each helper in the progress panel wears a uniform for its job: a programmer, an
  artist, a reviewer, a planner, a writer or an explorer. A click on a changed file in the file
  tree shows what changed since the last save to git, under the tree (file tree 0.2.25).
  humanizer replaces slopmonster as the built-in skill for AI-sounding text: instructions only,
  no Python, nothing sent to a second model. Three trigger cases brought up to date with 1.1.3
  and the Stop hook. #102, #103, #104.
