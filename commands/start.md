---
description: Set up this project for easyClaude - the same setup that runs on its own the first time
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

Run the `kickoff` skill on this project.

This command exists because `kickoff` is not a word anyone guesses. Setup already runs on
its own the first time a project is opened, so most people never need this. The ones who do
are the ones who dismissed the offer, or who are adopting easyClaude into a repository that
already has code, and who then went looking for the word "start".

**Warning: setup writes `docs/STATE.md`. Overwriting a real one loses the record of what is
in progress, what is next, and what is blocked.** So check before you run anything.

1. Read `docs/STATE.md`.
2. If it is missing, or it still carries the `<!-- easyclaude:not-kicked-off -->` marker,
   run `kickoff` normally. Nothing is at risk.
3. If it exists without that marker, this project is already set up. Say so in one line.
   Then ask whether they want to re-run setup, and say plainly that it rewrites the state
   file. Wait for an answer. Do not run anything until they say yes.
4. If they say no, tell them the one thing they most likely wanted instead: `/easyclaude:skills`
   to add third-party skills, or `/easyclaude:connect` to wire up other tools. Pick the one
   that fits what they asked, and name only that one.
