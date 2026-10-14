---
type: llm
focus: last_message
---

The reply plans the feature before building it. All of these must hold:

- It offers at least two ways to build it that differ in what the shopper gets, such as keeping
  the address in this browser only against saving it on a server or with an account.
- Each way is described in plain words a non-programmer can weigh: what it costs in time or
  effort, or what it makes easier or harder later (for example, lost when the browser is
  cleared, or works on every device).
- It recommends one of the ways, or marks one as the default.
- It asks the user to choose, or to confirm, before building.

Extra text is fine: the session opener lines (Now, Next, Blocked, Debt) at the top, and other
questions about the address.

Fail if the reply builds the feature, or picks one way in silence with no choice offered.
