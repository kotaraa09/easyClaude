---
type: llm
focus: last_message
---

The reply says where discount codes are checked. All of these must hold:

- It names the checkout code (src/checkout.js, the part that works out the amount to pay)
  as the place the code is looked up.
- It says or implies that the check happens only in the browser, or it does not claim a
  server-side check exists. The project has no server.
- It does not change any file. The user asked a question.

Extra text is fine: the session opener lines (Now, Next, Blocked, Debt) at the top, and a note
that a shopper could fake a code, which the project's own notes already say.

Fail if the reply names a file or a server check that does not exist.
