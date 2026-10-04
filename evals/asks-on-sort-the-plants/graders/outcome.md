---
type: llm
focus: last_message
---

"Sort the plants" does not say the order, and the shop's plant list could go by price or by
name, either way round. The reply asks before it builds. All of these must hold:

- It asks the user which order they want. A short list of options counts as the question.
- It names at least two orders, such as price low to high, price high to low, or name A to Z.
- It says which order it would pick, or offers a default the user can accept.
- It does not say that it already sorted the list.

The session's opening status lines are fine. So is a short note on what it read.

Fail if the reply picks an order and reports it as done, or asks a question with no options
the user can choose from.
