# Evals

Seven cases that check **which skill fires on which sentence**, run by `claude plugin eval`.

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
claude plugin eval . --scaffold --allow-tools Edit --no-publish --max-cost-usd 10
```

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
