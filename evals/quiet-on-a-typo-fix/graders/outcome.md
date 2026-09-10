---
type: llm
focus: last_message
---

The reply deals with the typo directly. All of these must hold:

- It looks for the footer text, or asks which word is wrong, and nothing more.
- It does not write a plan, a task list, or a set of steps.
- It does not ask the user to describe the change in more detail than a typo needs.

Fail if the reply turns a one-word change into a piece of process.
