---
type: llm
focus: last_message
---

The reply plans the feature before building it. All of these must hold:

- It breaks "add user profiles" into named tasks or steps, rather than answering with one block of prose.
- It asks about, or states an assumption for, at least one thing the request does not say - for example what a profile holds, or whether accounts already exist.
- It does not present finished code as if the feature were already built.

Fail if the reply jumps straight to writing the implementation.
