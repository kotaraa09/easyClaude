# Evals

Empty on purpose, and this file records why.

## The gap

`scripts/validate.mjs` checks structure. It proves frontmatter parses, names match
directories, and the always-on budget holds. It cannot check the thing this plugin
actually is: **which skill fires on which sentence.**

Skills trigger on their description and nothing else. Reword `debug`'s description
until it no longer mentions crashes, and *"it's throwing an error"* quietly starts
landing on `build-task` instead. Nothing goes red. Nobody finds out until a user
notices the framework stopped working the way the README says.

That is a behavioural regression, and only a behavioural test catches it.

## Why there are no cases here yet

`claude plugin eval` is the right tool — it runs cases against a plugin with a
no-plugin baseline arm, and `tool_used: Skill` graders are exactly a "did this skill
fire" assertion. It is currently gated:

```
$ claude plugin eval --eval-dir evals .
`plugin eval` is currently in early access
```

So the cases could be written but never run, and an eval suite that has never
executed is the same mistake as a verify contract that has never passed — it teaches
everyone to ignore it. `--list` in `scripts/gen/generate.mjs` marks adapters
`UNTESTED` for the same reason; guessed-at YAML would be worse, because a wrong field
name fails silently for whoever tries it next.

## What is known about the format, from the CLI's own help

Enough that finishing this is an afternoon, not a research project:

- Cases live at `<eval dir>/**/case.yaml`, or as `prompt.md` + `graders/*.md`.
  Default eval dir is `evals/`, overridable per-manifest via `experimental.evals`.
- Cases carry at least: a name (`--case <glob>` filters on it), `tags`, `runs`
  (default 3), `max_turns`, `timeout_seconds`, and an optional `scaffold_script`.
- Graders can be marked `with-only`. Under the default `--ablation with-without`,
  those — `tool_used: Skill` among them — are read as a plugin-fired indicator
  rather than as part of the score.
- `--threshold <0..1>` exits 1 below a score, which is what CI would hang off.

Unknown: how graders nest inside `case.yaml`. That is the part worth not guessing.

## The cases to write first

One per always-on skill, since those are the ones that fire without being asked, plus
the two failure modes that actually bite:

| prompt | must fire | why |
|---|---|---|
| *"add user profiles"* | `plan-feature` | the headline promise |
| *"keep going"* | `build-task` | must not re-plan finished work |
| *"it's throwing an error in checkout"* | `debug` | must not go straight to editing |
| *"ship it"* | `ship` | must not fire on *"how do I ship this?"* |
| *"fix this typo in the footer"* | **nothing** | small changes skip the ceremony |
| *"is this safe to make public?"* | **nothing** | `security-check` is typed, not triggered |

The last two matter most. A framework that fires on everything is worse than one that
fires on nothing, and the negative cases are the ones a structural validator can never
express.

## The deterministic substitute, and its limit

Until the above can run, `validate.mjs` checks the README's workflow tables against
each skill's frontmatter: a skill promised to fire on plain English must not set
`disable-model-invocation`, one listed as typed must, and every skill must appear in
one table or the other.

That is real — it caught three README rows promising plain-English triggering for
skills configured never to trigger. But it only proves the *documentation* is
consistent with the *configuration*. It says nothing about whether the description
text actually wins the turn. Only an eval does that.
