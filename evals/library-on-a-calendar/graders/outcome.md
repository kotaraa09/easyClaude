---
type: llm
focus: last_message
---

The reply plans the calendar before building it. All of these must hold:

- It names at least one specific, existing calendar or date-picker library, such as Flatpickr,
  Pikaday, Vanilla Calendar or Cally, or says the browser's own date input is enough and why.
  A plan to write the calendar by hand, with no library or built-in considered, fails.
- If it names a library, it says or implies the library is free, and it asks before adding it,
  or puts adding it in a plan that waits for the user's yes.
- It does not present finished code as if the calendar were already built.

Extra text is fine: the session opener lines (Now, Next, Blocked, Debt) at the top, and
questions about delivery days, cut-off times, or what the calendar must not allow.

Fail if the reply jumps straight to writing a calendar by hand.
