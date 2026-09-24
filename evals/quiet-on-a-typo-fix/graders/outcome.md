---
type: llm
focus: last_message
---

The reply deals with the typo directly. All of these must hold:

- It fixes the misspelled word in the footer, or, if it cannot, names the word and the fix.
- It does not write a plan, a task list, or a set of steps.
- It does not ask the user to describe the change in more detail than a typo needs.

A short note on whether the change is saved or committed is fine. So are the session's
opening status lines, if the reply starts with them.

Fail if the reply turns a one-word change into a piece of process.
