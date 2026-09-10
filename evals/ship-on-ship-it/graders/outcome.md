---
type: llm
focus: last_message
---

The reply runs the release routine rather than explaining it. All of these must hold:

- It checks the work before releasing it - tests, the verify contract, or the state of the branch.
- It treats releasing as something it is doing now, not as a topic it is teaching.
- It does not commit, push, or merge without saying so plainly first.

Fail if the reply is a general explanation of how shipping works.
