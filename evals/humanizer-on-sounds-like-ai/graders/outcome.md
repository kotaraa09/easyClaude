---
type: llm
focus: last_message
---

The reply judges the draft and fixes it. All of these must hold:

- It says yes, the draft reads as AI-written, and names at least two specific tells in it,
  for example "every leaf tells a story", "we don't just X - we Y", "elevate", "curate",
  "sanctuary", or the list of three.
- It gives a rewritten version that drops those tells and keeps the facts: a plant shop
  called Plant Corner.
- It does not claim a score or that a tool ran: nothing measured one.

Fail if the reply says the draft is fine, or reports a score it did not measure.
