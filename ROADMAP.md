# Roadmap

What comes next for easyClaude, in order, and why. The goal: a beginner with no coding
knowledge gets an agent workflow as good as the big labs' own, from one plugin, with
nothing to learn first.

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
reason, and the two tasks in items 2 and 3 cannot be tested fairly at all.

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
testing. Nothing measures it, and it needs git, so it needs item 1.

**What.** The `rescue` variant of the sample project already exists. Grade on: the old
version is back, today's uncommitted work still exists somewhere recoverable, and the
reply asked before overwriting.

**Done when.** The task runs in both arms with a shell. **Effort:** 1 day.

## Next

### 4. Replies in plain words

**Why.** Claude's replies still name files, functions and error text. A beginner cannot
act on "`amountToPay` in `src/checkout.js` read `discount.code` unguarded". Claude Code
plugins can ship an output style.

**What.** An easyClaude output style: result first, plain words, file names only when the
user must type them. Offered at kickoff, never forced.

**Done when.** A benchmark check on the reply (length, file names per sentence) improves
without any task scoring lower. **Effort:** 1-2 days.

### 5. Fewer permission prompts a beginner cannot answer

**Why.** Claude Code asks "allow this command?" often. A beginner says yes to everything
or stops. The deny rules are not a security boundary, and the Claude Code docs say so.

**What.** Kickoff offers Claude Code's sandbox and auto mode, explained in one sentence
each, with the deny rules kept as a second layer.

**Done when.** A setup check confirms both are on, and the benchmark scores do not drop
with them on. **Effort:** 3-5 days.

### 6. "Done" means the user could see it work

**Why.** The gate checks exit codes. For a website, a beginner's "done" is "I opened it and
it works", and nothing checks that yet.

**What.** For web projects, open the page in a browser after a change, take a screenshot,
and check it against the task. Only where a browser tool is available.

**Done when.** A benchmark task with a visible bug (a button that does nothing) passes with
easyClaude and is measured without it. **Effort:** 1-2 weeks.

### 7. Start from nothing installed

**Why.** Installing means a terminal, Node, git and a GitHub account. A true beginner fails
before the first message.

**What.** A first-run check that finds what is missing and explains each fix in plain
words, and a desktop-app path in the README. **Effort:** 3-5 days.

## Later

- **Planning that waits for a yes, measured.** `plan-feature` stops and asks before it
  builds. The benchmark sends one message per session, so it cannot answer "yes" yet. A
  saved conversation (`context.history_file`) could.
- **Larger samples.** Three runs per task moves by one or two between days. Five runs on
  the tasks that differ between arms, once the figures are used to decide something.
- **Claude Code's own memory.** Eval runs start without it. A run with it on would show
  whether the two-session result holds for users who have it.
- **Hook messages in the user's language.** Cost notices are English, because Claude Code
  shows them before Claude reads anything. Only a translation table could change that.
- **Re-measure the per-turn cost.** `docs/cost.json` is out of date since 0.1.9. The words
  sent each turn barely changed, but the figure should be measured, not assumed. About
  $0.50-1.

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
- **Not released yet** - Two tasks in Thai. They found English notes between steps for a
  Thai user in the bug-fix task, now fixed: 3/3 with easyClaude, 1/3 without.
