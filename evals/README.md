# Evals

Seven cases that check **which skill fires on which sentence**, run by `claude plugin eval`.
Seven more, in [`outcomes/`](outcomes/), check **whether the result works**. See
[the outcome benchmark](#the-outcome-benchmark).

## The gap they cover

`scripts/validate.mjs` checks structure. It proves frontmatter parses, names match
directories, and the always-on budget holds. It cannot check the thing this plugin
actually is: which skill fires on which sentence.

Skills trigger on their description and nothing else. Reword `debug`'s description
until it no longer mentions crashes, and *"it's throwing an error"* quietly starts
landing on `build-task` instead. Nothing goes red. Only a behavioural test catches that.

## What is here

| case | prompt | asserts |
|---|---|---|
| `plan-feature-on-a-feature-request` | *"add user profiles"* | `plan-feature` fires |
| `build-task-on-keep-going` | *"keep going"* | `build-task` fires, `plan-feature` does not |
| `debug-on-an-error-report` | *"it's throwing an error in checkout"* | `debug` fires |
| `ship-on-ship-it` | *"ship it"* | `ship` fires |
| `rescue-on-wanting-it-back` | *"...I want yesterday's version back."* | `rescue` fires |
| `quiet-on-a-typo-fix` | *"fix this typo in the footer"* | **no skill fires** |
| `quiet-on-a-security-question` | *"is this safe to make public?"* | `security-check` does **not** fire |

Every case carries a `tool_used` grader (did the skill fire) and an `llm` grader (did the
reply help). Under the default ablation the first is an indicator, not part of the score,
so the score is the outcome grader alone, compared against a no-plugin baseline arm.

## The sample project

Every case runs in `_fixture/project/`: a small plant shop that easyClaude already set up.
It has a filled-in `docs/STATE.md`, a verify contract, the plugin's rules, a two-day git
history, a real bug (checkout fails with no discount code) and a typo in the footer.
`_fixture/setup.sh` builds it, with two variants: `ship` adds finished uncommitted work on a
branch, and `rescue` adds a commit from today plus edits that break the site.

**Why it exists.** The first run, on 2026-09-24, used no project at all. In an empty folder
the SessionStart hook correctly sends every message to `kickoff`, so no case fired the
skill it names, and the suite measured kickoff seven times.

**How it is wired.** The runner takes a scaffold only from `context.scaffold_script`, which
`prompt.md` frontmatter cannot hold, and refuses a path outside the case directory. So
each case has a `case.yaml` holding only that field, and a one-line `setup.sh` that calls
the shared script. The runner merges `case.yaml` with `prompt.md` and `graders/`.
`validate.mjs` accepts `case.yaml` in exactly that shape and refuses anything more.

## Running it

```bash
claude plugin eval . --tag triggering --scaffold --allow-tools Edit --no-publish --max-cost-usd 10
```

- `--tag triggering` keeps the outcome tasks in `outcomes/` out of this run. They have
  their own command, below.

- `--scaffold` is required. Without it every case runs in an empty folder again.
- `--allow-tools Edit` lets the typo and debug cases change files. Edit is a gated tool.
- No case allows a shell. On Windows the runner refuses any shell grant, because it has no
  sandbox there. So `ship` and `debug` cannot run the checks, and their graders accept a
  reply that says so and stops.
- `--case` takes one glob. A second `--case` replaces the first.
- A full run is 42 agent runs: about 5 minutes with `-j 4`, and 3 to 5 US dollars.

CI does not run this: it costs money and needs a login. Check 16 in `validate.mjs` checks
the shape of every case on each push instead.

## Latest results

2026-09-24 (debug: 2026-09-25), Claude Code 2.1.280, three runs per arm. The numbers are the runs where the
outcome grader passed.

| case | skill fired correctly | with plugin | without plugin |
|---|---|---|---|
| build-task-on-keep-going | 3/3 | 3/3 | 3/3 |
| debug-on-an-error-report | 3/3 | 3/3 | 3/3 |
| plan-feature-on-a-feature-request | 3/3 | 3/3 | 3/3 |
| ship-on-ship-it | 3/3 | 3/3 | 3/3 |
| rescue-on-wanting-it-back | 3/3 | 3/3 | 1/3 |
| quiet-on-a-typo-fix | 3/3 | 3/3 | 3/3 |
| quiet-on-a-security-question | 3/3 | 3/3 | 1/3 |

Every skill fires where it should and stays quiet where it should.

On `plan-feature`, `ship`, `debug` and the typo case the baseline scores the same, so those
graders show the skill fires but not yet that it adds anything. Sharper outcome criteria are
the next step there.

## The outcome benchmark

The cases above prove which skill answers. They cannot say whether the answer helped: on
four of seven, Claude without the plugin scored the same. `outcomes/` asks the question a
beginner cares about. Seven tasks, in a beginner's words, in the same sample project:

| task | the beginner says | it works when |
|---|---|---|
| `fix-checkout` | the checkout breaks with no discount code | paying with no code works, the tests pass, and a test fails if the old code comes back |
| `add-shipping` | add $6 shipping, free from $50 | the amount follows the rule, and the tests pass - one of them has to change |
| `rename-shop` | rename the shop everywhere on the site | the page shows only the new name, and no new file appeared |
| `honest-test-fix` | the tests fail, just make them pass | the code is fixed, and the test still expects the right total |
| `two-sessions` | day one: five changes, "just the first one today"; day two, in a new session: "finish the rest" | all five changes work at the end of day two |

`two-sessions` is the only task that needs two sessions. `bench.mjs` runs day one
(`outcome-two-sessions-day1`) first, keeps the project each run leaves, and starts each
day-two run from one of them. Nothing else carries over: not the conversation, and not
any memory outside the project. It is the task that tests what easyClaude is for, which
is that the plan outlives the conversation.

`fix-checkout-th` and `rename-shop-th` are the first two, asked in Thai. Most people
easyClaude is for write in Thai. They run in the shop set up for a Thai owner (`setup.sh
thai`): `CLAUDE.md` names Thai, and `docs/STATE.md` is written in it, as kickoff leaves it.

Every task also fails if the reply is not in the language it was asked in. For Thai, that
means at least 30% of the reply outside code is Thai, and no paragraph almost all English.

```bash
node scripts/bench.mjs
```

It runs each task three times with easyClaude, and three times in the same project with
no easyClaude at all: no plugin, no `docs/`, no `CLAUDE.md`, no `.claude/`. Then it grades
what Claude left on disk with hidden tests Claude never saw. Grading runs code Claude
wrote, so it runs on a copy, under Node's permission model: read the copy, write nothing,
start nothing. `tests/bench.test.mjs` proves every check fails on the untouched project
and on a wrong fix, and passes on a right one, so a paid run cannot be wasted on a broken
check.

**Cost.** About $0.20 per task run on Sonnet 5, at list price. When you are signed in with
a Claude plan, it is plan usage, not a charge. The first run of both arms is about $4. The
no-easyClaude arm does not change when easyClaude does, so each task's result is saved in
`results/outcome-baseline.json` under its own key, and reused until Claude Code, the model,
the run count, the sample project or that task changes. After that, a full run is about
$3.50, most of it the two-day task, and one small task is about $0.60. There is no judge
model: every check is a test or a pattern, so grading is free.

**Results.** Claude Code 2.1.280, Sonnet 5, three runs per task, no shell. The latest,
2026-09-26:

| task | works, with easyClaude | works, without |
|---|---|---|
| `add-shipping` | 3/3 | 3/3 |
| `fix-checkout` | 3/3 | 1/3 |
| `honest-test-fix` | 3/3 | 3/3 |
| `rename-shop` | 3/3 | 3/3 |
| `two-sessions` | 3/3 | 0/3 |
| **all** | **15/15** | **10/15** |

The four small tasks are from one run, and `two-sessions` from a second after its last
fix; the no-easyClaude figures for the small tasks are cached from the day before. Plain
Claude's `fix-checkout` moved between runs: it wrote the test that locks the fix in three
times of three on 2026-09-25, and once of three on 2026-09-26. Three runs is a small
sample, and single tasks move by one or two.

How it got there. The first run of the four small tasks scored 7/12 with easyClaude
against 12/12 without, and found three real problems, which is what it is for:

- **Replies in the wrong language.** Four of twelve English requests got an answer in
  Hungarian, Slovak or Spanish, and in a later run seven of twelve. Claude with no plugin
  never did it. The session opener said "put the labels into the user's language", which
  reads as "the user's language is not English", and Claude picked one. It now says to
  keep English as it is when the user writes English. No file check could see this; the
  language check was added after the traces showed it.

- **A bug fix shipped with no test.** `rules/workflow.md` called a bug fix a small change,
  so in two runs of three Claude fixed the checkout in one edit, never loaded `debug`, and
  wrote no test. Claude with no plugin wrote one every time. Saying so in the rule did not
  change it: still one run of three. A line that `prompt-check.mjs` adds when a message
  reads like a bug report did: three of three.
- **The build step spent as much looking for a shell as on the task.** `build-task` tells
  Claude to run the checks. With no shell, Claude searched for one about ten times and
  sent helpers to try. It now says the checks were not run, and stops. $0.49 a run became
  $0.19.

The two-session task started at 0/3 with easyClaude too, and found three more:

- **"The rest" went unrecorded, or to the bottom.** Day one wrote the four remaining
  requests into `docs/STATE.md` in two runs of three, and put them below older tasks. Day
  two then built the email receipt from the top of the list, which nobody had asked for.
  `prompt-check.mjs` now adds a line when a message leaves work for later: write each item
  at the top of `## Next`, dated. And because a gate block once pulled a turn away before
  it wrote anything, `later-memo.mjs` makes the Stop hook hold that turn once if
  `docs/STATE.md` has not changed. In the last run all three day ones wrote the list on
  their own, so the hold did not fire; the free tests prove it would.
- **Day two took the top of the list, not what the user named.** `build-task` now takes
  the tasks the user refers to, and reads "(asked <date>)".
- **"Finish the rest" got one task and "want me to continue?".** A line `prompt-check.mjs`
  adds to a request to finish several things fixed it, where the same sentence in the
  skill had not. That is the second time here, after the bug-fix test: guidance inside a
  skill or a rule file is read too late, and one line with the message is not.

Plain Claude scores 0/3 on the two-session task because a new session starts with nothing
from the last one, and it says so honestly. One fairness note: Claude Code can keep its own
memory between sessions on some setups, and eval runs start without it. A beginner with that
memory switched on might do better than 0/3 without easyClaude.

**The tasks in Thai.** 2026-09-26, same settings, three runs per task:

| task | works, with easyClaude | works, without |
|---|---|---|
| `fix-checkout-th` | 3/3 | 1/3 |
| `rename-shop-th` | 3/3 | 3/3 |

Plain Claude's two misses are the same as in English: the fix came with no test. The first
two runs found three problems:

- **English notes to a Thai user.** In the bug-fix task, two easyClaude runs of three wrote
  English between steps ("Root cause found: ...", "no new Debt entry is needed"), and one
  opened its final reply with an English paragraph. The rename task, which gets no line from
  `prompt-check.mjs`, had none. So the English line sent with a bug report pulled Claude
  into English. When a message is mostly in another script, `prompt-check.mjs` now adds one
  more line to whatever it sends: notes go in the language of the user's message. English
  messages never get it. In the next run, no easyClaude run wrote English.
- **The sample project said "the user writes in English".** The first run used it for the
  Thai tasks too. That is not the project a Thai user has, so the `thai` variant exists.
- **A usage limit counted as a result.** The account hit its limit during a run, and the
  no-easyClaude arm was cached as 0/3 with "You've hit your monthly spend limit" as each
  reply. `bench.mjs` now treats such a run as partial: it says so, and caches nothing.

**Plain answers.** `output-styles/plain.md` is a style kickoff offers and `/easyclaude:plain`
turns on: the result first, five sentences at most, no code terms unless the user must type
them. `node scripts/bench.mjs --with-only --style plain` runs the easyClaude arm with it on.
An eval run loads no project settings, so a style set in the sample project never loaded
(the trace said "default"); the flag adds the style's text to each case instead, which is
what Claude Code does with a style that keeps the coding instructions. Each reply is also
measured: its length (letters outside code) and its code terms (anything in backticks, file
names, camelCase names). easyClaude only, three runs per task:

| task | works, no style | works, plain | length, no style | length, plain | code terms, no style | code terms, plain |
|---|---|---|---|---|---|---|
| `add-shipping` | 3/3 | 3/3 | 374 | 369 | 1.3 | 1.3 |
| `fix-checkout` | 3/3 | 3/3 | 579 | 408 | 6.3 | 0.3 |
| `fix-checkout-th` | 2/3 | 3/3 | 576 | 420 | 16.0 | 1.0 |
| `honest-test-fix` | 3/3 | 3/3 | 442 | 428 | 6.7 | 1.0 |
| `rename-shop` | 3/3 | 3/3 | 186 | 203 | 3.3 | 0.0 |
| `rename-shop-th` | 3/3 | 3/3 | 252 | 278 | 4.0 | 1.0 |
| `two-sessions` | 3/3 | 3/3 | 661 | 620 | 5.0 | 1.0 |

No task scored lower, code terms fell from 42.6 to 5.6, and the replies were 11% shorter in
total. The no-style `two-sessions` figures are from the 0.1.11 run on 2026-09-26; the plain
ones from 2026-09-29, after a first attempt stopped at a usage limit and was refused. The two renames grew a little: "the name at the top of the page" is longer than
`index.html`. The first version of the style said "a few sentences", and made replies a
third longer, spent on how the cause was found; "five sentences at most" and "leave out how
you found it" fixed that.

Without the style, one Thai bug-fix run of three still opened with an English note ("This
is a small, simple decisions log - not worth adding..."), despite the language line from
0.2.0. With the style on, none did.

**What this does not show yet.** A change that breaks something the user did not mention,
and getting yesterday's version back. Both need a shell to be fair, see below.

**No shell on Windows.** The runner grants no shell on native Windows, because it has no
sandbox there, so neither arm can run commands. easyClaude's verify gate still runs the
tests, because it is a hook and not a tool. That favours easyClaude. Under Linux or WSL2,
`node scripts/bench.mjs --shell --fresh-baseline` gives the fair figure.

## Lessons from the first runs

- **A `max: 0` grader needs `min: 0`.** The runner defaults `min` to 1, so `max: 0` alone
  means 1..0 and never passes. All three should-not-fire graders were written that way.
  Check 16 now refuses it.
- **Relative dates in the fixture must stay on the right day.** A "today" commit made
  hours back crossed midnight in a late run, and "yesterday's version" then named a
  different commit. The fixture now dates today's commit five minutes back.
- **Grade against the known answer.** The debug grader first asked the reply to treat the
  cause as unknown. Once the reply read the code, the cause was known, and the judges split
  on correct replies (1/3). The sample project has one real bug, so the grader now checks
  for that bug, a test for it, and an honest note on what was not run. Debug replies also
  need about 10 steps, so that case allows 14.
- **Judge criteria were too strict at first.** The typo grader failed a correct fix for one
  extra line about the commit. The criteria now say what extra text is fine.

## The next cases to write

- *"how do I ship this?"* must **not** reach `ship`. It is the paired negative for
  `ship-on-ship-it`, and the pair proves the description separates an instruction from a
  question.
- A case for `kickoff` on an empty folder, which is now the only thing no case covers.
