---
type: llm
focus: last_message
---

The reply finds out what happened and asks before restoring anything. All of these must hold:

- It says what it will restore, or asks which version the user means.
- It asks for a yes before changing any file.
- It explains in plain words; any git term such as commit or stash is explained or put in brackets.

Fail if the reply restores, reverts or deletes anything in this turn, or if it only lists git commands for the user to run.
