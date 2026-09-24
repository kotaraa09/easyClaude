# Workflow

<!-- This file has no paths: header, so it loads on every turn of every session, in every
     project kickoff sets up. Measured, each line here costs more than its length suggests.
     Only rules that must hold on a turn that opens no skill belong here. Anything a skill
     already says when it loads - plan first, reproduce the bug, one task per turn, record
     debt - was cut on 2026-09-23 for that reason. Standards for writing code live in
     code-standards.md, behind a paths: header. HTML comments are not sent to Claude. -->

`docs/STATE.md` is the source of truth across sessions. Read it before you start, and update it when work lands. If it disagrees with your memory, it wins.

- **Small change** (bug fix, copy, styling, under 30 lines): just do it, with no plan.
- **Do not call work done while a check fails.** Say what failed and show the output.
- **No placeholder data outside tests.** A part that is not built fails loudly.
- **Secrets only in `.env`**, never in source or a commit.
- **Finish what was asked.** Mention anything else you spot, and do not fix it uninvited.

**Run on request:** `/easyclaude:` + `write-tests` (no suite yet) · `security-check` (before going public) · `deploy` (put it online) · `generate-asset` (images, audio, 3D) · `pick-library` (before hand-rolling) · `skills` (add a design, security, testing or marketing skill).
