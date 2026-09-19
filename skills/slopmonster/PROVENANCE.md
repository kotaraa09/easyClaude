# Provenance

This skill is **vendored third-party code**, not written for easyClaude.

| | |
|---|---|
| Source | https://github.com/ItsssssJack/SlopMonster |
| Pinned commit | `f261dbf11c2a206ecd8780c070a46dae64edd8be` |
| Vendored | 2026-09-19 |
| License | MIT - see `LICENSE` |
| Contains | **executable code.** One Python script, three shell and Python test files |

## Attribution obligations - do not strip these files

`LICENSE` must ship with this directory. The MIT licence requires the copyright notice
and permission notice to travel with any redistribution, which is what publishing this
plugin does. `references/sources.md` credits the prior work the catalogue is built on and
belongs with it.

## What was vendored, and what was left behind

Taken: `SKILL.md`, `LICENSE`, `tools/`, `prompts/cleanse.txt`, `references/`.

Left behind: `README.md`, `examples/`, `.github/workflows/slop.yml`, and `docs/img/`.
The images alone are 3.2MB of screenshots. Everything here is about 72KB, and the skill
refers to none of the omitted paths.

## The code, read before it was vendored

The registry bar says executable code gets read line by line before vendoring. It was.
Two files do the work.

`tools/deslop.py` - 18KB of standard-library Python. It imports `re`, `sys`, and `html`
and nothing else. It opens files to read them and never to write. There is no network
call, no subprocess, no `eval`, and no telemetry. It strips tags from HTML, matches a
catalogue of regexes against the visible words, scores out of 5, and exits non-zero below
5. It is a linter and behaves like one.

`tools/cleanse.sh` - 6KB of bash. This one calls out. It prepends `prompts/cleanse.txt`
to your draft and pipes the result to whichever rival model CLI is installed: `codex exec`
if you drafted in Claude, `claude -p` if you drafted in GPT. With neither, it prints the
prompt and exits 127 so you can paste it somewhere yourself.

Two things follow from that, and both belong in front of a user before they run it:

- **It sends your draft to another model provider.** That is the entire point of the step -
  a model cannot hear its own accent - but it is still your text leaving your machine,
  through a CLI you already signed into.
- **It costs money.** The call is billed by whichever provider answers it.

The script is careful about both. It bounds the call with a timeout, refuses an empty or
unreadable draft rather than paying for a call on nothing, and runs the sandbox read-only.
Nothing in it is hidden.

## Two things that will bite on Windows

**`python3` is not the command here.** `SKILL.md` and `cleanse.sh` both say `python3`. On
a normal Windows install the command is `python`, and `python3` is a Microsoft Store stub
that opens a shop page instead of running anything. Substitute `python` when you follow
the skill's instructions. This is not fixed in place, because editing vendored files
breaks the pinned-SHA guarantee that makes vendoring safe to begin with.

**`cleanse.sh` needs bash and awk.** Git Bash supplies both, so step 3 works from a Git
Bash prompt and not from PowerShell. Steps 1, 2 and 4 - the linter and the rewrite - need
only Python and work anywhere.

## Why it is here

It is the only mechanical check in this framework aimed at prose rather than code.
`verify.mjs` decides whether the build is honest. Nothing decided whether the words were,
and "make it sound less like a robot" was a judgement call every time.

This makes it falsifiable instead: five rule groups, one point each, exits red below 5/5.
You can disagree with a rule and look it up. That is the same reason `design-taste` was
carried before it was removed, and the reason the catalogue prefers checkable rules to
advice.

## What it said about our own README, and what happened next

On the day it was vendored it scored this repository's README at **2 out of 5**. It
objected to em-dash pile-ups, to rule-of-three lists, and to the word "curated" in a
section heading.

The README was then rewritten and it now scores **5 out of 5**. That is the argument for a
falsifiable rule rather than advice: every objection named a specific string, so every
objection could be met or rejected on its merits. None of them needed a debate about taste.

## The limit that fixing it exposed

`README.th.md` scores **5 out of 5** and always did, because the catalogue is English only.
The scorer cannot read Thai, so it reports a clean page on one it never read.

Treat a 5/5 on non-English copy as no result rather than a pass. Nothing in the skill claims
otherwise, and nothing in it detects the case either, so the only guard is knowing.

## Updating

Re-vendor from a newer commit, update the SHA above and in `skills/registry.json`, re-read
the diff of every file under `tools/` before accepting it, and re-run
`python tools/test_deslop.py`. Never track a branch. A moving upstream is unreviewed code
executing on user machines, and this directory contains code that executes.
