---
type: llm
focus: last_message
---

The reply picks up existing work rather than starting the process over. All of these must hold:

- It looks for the current state of the project, or says what it thinks the next unfinished task is.
- It does not produce a fresh plan for a feature nobody just asked for.
- If it cannot tell what to continue, it says so and asks, rather than inventing work.

Fail if the reply opens a planning exercise, or asks the user to describe a feature from scratch.
