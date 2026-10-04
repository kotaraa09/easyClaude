# Workflow

<!-- This file has no paths: header, so it loads on every turn of every session, in every
     project kickoff sets up. Measured, each line here costs more than its length suggests.
     Only rules that must hold on a turn that opens no skill belong here. Anything a skill
     already says when it loads - plan first, reproduce the bug, one task per turn, record
     debt - was cut on 2026-09-23 for that reason. "Bug fix" left the small-change
     list on 2026-09-25, when scripts/bench.mjs caught it: with this line calling a bug fix
     small, debug did not load in two runs of three and no test was written. Saying so here
     did not fix it; the line prompt-check.mjs adds to a bug report did. Standards for writing code live in
     code-standards.md, behind a paths: header. The ask-when-unclear rule came on 2026-10-04,
     from a user who found Claude picking one meaning of a vague request and building it.
     plan-feature asks questions, but only for a feature, and a vague small change skips it.
     Its last sentence keeps the typo case quiet: evals/quiet-on-a-typo-fix and
     evals/asks-on-a-vague-request check the two sides. HTML comments are not sent to Claude. -->

`docs/STATE.md` is the source of truth across sessions. Read it before you start, and update it when work lands. If it disagrees with your memory, it wins.

- **Ask when a request could mean different things.** If a word can point at different results ("make it better", "the button" when there are three), or is too broad to tell when you are done, ask one short question: the likely meanings and your pick. Then wait. Decide the how yourself; ask only the what. A clear request needs no question, and neither does one that points at `docs/STATE.md`, such as "keep going".
- **Small change** (copy, styling, under 30 lines): just do it, with no plan.
- **Do not call work done while a check fails.** Say what failed and show the output.
- **No placeholder data outside tests.** A part that is not built fails loudly.
- **Secrets only in `.env`**, never in source or a commit.
- **Finish what was asked.** Mention anything else you spot, and do not fix it uninvited.

**Run on request:** `/easyclaude:` + `write-tests` (no suite yet) · `security-check` (before going public) · `deploy` (put it online) · `generate-asset` (images, audio, 3D) · `pick-library` (before hand-rolling) · `skills` (add skills that fit this project).
