---
type: llm
focus: last_message
---

"Look better" can mean many different results, so the reply asks before it builds. All of
these must hold:

- It asks the user what they mean. A short list of options counts as the question.
- It names at least two concrete meanings, such as colours, layout, fonts, product photos,
  or the mobile view.
- It says which option it would pick, or offers a default the user can accept.
- It does not say that it already changed the look of the shop.

The session's opening status lines are fine. So is a short note on what it read.

Fail if the reply picks one meaning and reports it as done, or asks a question with no
options the user can choose from.
