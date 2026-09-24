---
type: llm
focus: last_message
---

The reply works towards the cause before changing anything. All of these must hold:

- It asks for the error text, or reads the checkout code, or states how it will reproduce the failure.
- It does not name a cause from the sentence alone. A cause it found in code it read counts
  as evidence, and so does saying the cause is likely rather than confirmed.
- Any fix it proposes follows from something it read or asked for.

Fail if the reply edits files, or offers a speculative fix, before it has any evidence of what is wrong.
