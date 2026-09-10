# Evals

Six cases, none of which have ever run. This file records why that is deliberate, and
exactly what is unproven about them.

## The gap

`scripts/validate.mjs` checks structure. It proves frontmatter parses, names match
directories, and the always-on budget holds. It cannot check the thing this plugin
actually is: **which skill fires on which sentence.**

Skills trigger on their description and nothing else. Reword `debug`'s description
until it no longer mentions crashes, and *"it's throwing an error"* quietly starts
landing on `build-task` instead. Nothing goes red. Nobody finds out until a user
notices the framework stopped working the way the README says.

That is a behavioural break, and only a behavioural test catches it.

## What is here

| case | prompt | asserts | why |
|---|---|---|---|
| `plan-feature-on-a-feature-request` | *"add user profiles"* | `plan-feature` fires | the headline promise |
| `build-task-on-keep-going` | *"keep going"* | `build-task` fires, `plan-feature` does not | must not re-plan finished work |
| `debug-on-an-error-report` | *"it's throwing an error in checkout"* | `debug` fires | must not go straight to editing |
| `ship-on-ship-it` | *"ship it"* | `ship` fires | an instruction, not a question |
| `quiet-on-a-typo-fix` | *"fix this typo in the footer"* | **no skill fires** | small changes skip the ceremony |
| `quiet-on-a-security-question` | *"is this safe to make public?"* | `security-check` does **not** fire | it is typed, not triggered |

The last two matter most. A framework that fires on everything is worse than one that
fires on nothing, and the negative cases are the ones a structural validator can never
express.

Every case carries two kinds of grader, because a `tool_used` grader alone proves a
skill fired and nothing about whether it helped — and under the default ablation that
grader is a plugin-fired indicator, excluded from the score, so a case graded only that
way scores on nothing at all.

## Why none of them have run

```
$ claude plugin eval --eval-dir evals .
`plugin eval` is currently in early access
```

Still true on 2026-09-10, on CLI 2.1.263. `claude plugin eval init` is gated the same
way, so the template it would have written is not available either.

Writing cases that cannot run was a deliberate trade, made knowingly. The argument
against it stands: a suite that has never executed teaches everyone to ignore it. The
answer to that is check 16 below, not optimism.

## What is confirmed, and what is not

The format here is **not guessed**. Field names, the allowed grader types, and the
folder layout were read out of the CLI's own schema and help text.

Confirmed:

- A case is a directory holding `prompt.md` and `graders/*.md`. The `prompt.md` **body**
  becomes the prompt under test.
- `prompt.md` frontmatter accepts exactly: `schema_version`, `name`, `description`,
  `tags`, `plugins`, `runs`, `expected_outcome`, `model`, `max_turns`,
  `timeout_seconds`, `allowed_tools`, `artifact_publish`, `growthbook_overrides`,
  `append_system_prompt`, `env`. Anything else is rejected outright.
- A grader's **filename** is its name. Its frontmatter must carry
  `type: regex | tool_order | tool_used | file_exists | llm | baseline`.
- `tool_used` takes `tool`, `input_match`, `min`, `max`. `llm` takes `criteria` and a
  `focus` of `last_message | trace | files | mock_calls`.
- Three floor rules, from the CLI's own authoring guidance: at least one should-NOT-fire
  case, at least one outcome grader per case, and `runs: 3` minimum.

Not confirmed, and only a real run will settle it:

1. **The grader body.** These cases put the `llm` criteria in the file body rather than
   in a `criteria:` frontmatter key, following the shape of the blank template. If that
   is wrong, the case fails loudly on a missing field — which is the safe way to be
   wrong, and is why it was written that way round.
2. **`input_match` semantics.** Whether matching `plan-feature` against the `Skill`
   tool's input works the way these cases assume, and whether `ship` or `debug` can
   match too loosely.
3. **Calibration.** Whether the outcome criteria are too strict, too loose, or reward
   the wrong thing. No amount of reading tells you this.

## The day the gate opens

```bash
claude plugin eval --eval-dir evals .
```

The default ablation runs a no-plugin baseline arm, which is what separates "the skill
did this" from "Claude would have done this anyway". Keep it. `--threshold` is what CI
would hang off once the scores are known to be meaningful — do not wire it up before
then.

Expect the first run to fail. Fix the three unknowns above in the order listed.

## What check 16 does, and does not, cover

`validate.mjs` check 16 verifies the shape of every case on each push: known frontmatter
keys, a non-empty prompt, valid grader types, an outcome grader per case, `runs >= 3`,
at least one negative case, and that a grader never asserts on a tool the case withheld
— which would let it pass without testing anything.

It also checks that a skill named in `input_match` still exists, so renaming a skill
breaks these cases loudly instead of leaving them matching a name nothing can produce.

What it cannot check is whether a case **passes**. Only the runner does that.

## The next cases to write

- *"how do I ship this?"* must **not** reach `ship`. It is the paired negative for
  `ship-on-ship-it`, and the pair together is what proves the description separates an
  instruction from a question.
- `build-task-on-keep-going` runs without a session history, so *"keep going"* arrives
  with nothing to continue. The runner has `context.history_file` for exactly this; the
  format of that file is not documented in the help, so it was not guessed at.

## The deterministic substitute, and its limit

Until the above can run, `validate.mjs` checks the README's workflow tables against
each skill's frontmatter: a skill promised to fire on plain English must not set
`disable-model-invocation`, one listed as typed must, and every skill must appear in
one table or the other.

That is real — it caught three README rows promising plain-English triggering for
skills configured never to trigger. But it only proves the *documentation* is
consistent with the *configuration*. It says nothing about whether the description
text actually wins the turn. Only an eval does that.
