# Prompt levels

The same four outcome tasks, each asked four ways, to measure one question: how much does the
way a request is written change the result, and does easyClaude close the gap between a
beginner and someone who writes prompts well?

| level | who writes it | example (fix-checkout) |
|---|---|---|
| `beginner` | a beginner who explains, as each task's own `prompt.md` does | "When someone tries to pay without a discount code, the checkout breaks. I don't know how to code. Please fix it for me." |
| `beginner-terse` | a beginner who types fast | "checkout breaks if theres no discount code. can u fix" |
| `expert-checklist` | a prompt engineer, as a short numbered list | root cause first, smallest fix, a regression test, keep every test, summary |
| `expert-spec` | a prompt engineer, as a structured spec in XML tags | context, problem, task, success criteria, constraints, report |

Two wordings per side, so no single prompt decides the result: the analysis pools the two
beginner levels and the two expert levels.

## The rule for writing a level

**Every level carries the same facts.** An expert prompt may add what a skilled prompt writer
asks of any software task: find the cause first, keep the change small, add a test, do not
weaken tests, check the work, say what was not checked, state an assumption instead of
stopping. It may not add what only someone who read the code would know: a file name, the
cause of the bug, a test's name or value. The question is prompt skill, not knowledge of the
project. `beginner-terse` drops words, never facts: "free if the order is $50 or more" stays
exact, because "free over $50" would be a different rule.

`beginner/` holds each task's own words, copied from its `prompt.md`. A test fails when the
two differ, so the levels always compare against the words the benchmark uses.

## Running it

```bash
node scripts/prompt-gap.mjs --runs 3 --max-cost-usd 40
```

It runs `scripts/bench.mjs --prompts <level>` for each level, both arms, then prints the table
and saves it under `evals/results/`. `node scripts/prompt-gap.mjs --report` prints the table
again from the saved runs without running anything.

What it reports, per level and arm: tasks that work (graded by hidden tests and file checks,
no judge model), runs that stopped to ask a question instead of changing anything, and cost.
Then the gap: expert minus beginner, with easyClaude and without. easyClaude closes the gap
when its gap is smaller, and helps a beginner most when a beginner with it does as well as an
expert without it.

## Limits

- The benchmark sends one message. A run that asks a good question and stops fails, though a
  person could have answered it. The table counts those runs on their own.
- On native Windows neither arm can run commands, and easyClaude's verify hook still runs the
  tests. An expert prompt that says "run the tests" cannot be followed without easyClaude.
  That narrows the gap without easyClaude. Run it under WSL2 or Linux with `--shell` for the
  fair figure (ROADMAP item 1).
- Three runs per level and arm is 12 runs per level, 24 per side. A difference of one or two
  runs is noise.
