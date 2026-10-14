---
description: Explain where a past session went wrong, step by step, from its saved record
argument-hint: "[which session, or what went wrong]"
disable-model-invocation: true
allowed-tools: Bash(node:*), Read
---

Arguments: `$ARGUMENTS`

The user wants to know why a session went wrong. Find out from the record, not from memory.

1. List this project's saved sessions, newest first:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/session-timeline.mjs --list
   ```

   Number 1 is usually this session. Pick the one the arguments name (a number, an id, a day,
   or what it was about). With no arguments, take number 2, the last one before this. If you
   cannot tell which one they mean, show the list and ask.

2. Read it as numbered steps:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/session-timeline.mjs <number or id>
   ```

   Each step is one line: what the user said, what Claude said, a tool call, or a failed result.
   Read every step; do not open the raw record, which runs to megabytes.

3. Find the **first** step where it went off track, not the last thing that failed. The usual
   causes: Claude guessed at something the user had not said; it built before the user said
   yes; it did not run the checks, or ran them and went on past a failure; it changed more than
   was asked; it misread the request; a tool or a setting stopped it.

4. Answer in the user's language and in plain words, in this order:
   - **What went wrong**, in one or two sentences.
   - **Where**: the step number, and a short quote from that step as evidence.
   - **Why**, if the record shows it. Say so when it does not, and do not guess.
   - **What to do next time**: one or two things the user can say or do differently. If a line in
     `docs/STATE.md` or `CLAUDE.md` would prevent it, offer to add it, and wait for a yes.

Change no file in this command. It reads the record and explains it; fixing the damage is a
separate request.
