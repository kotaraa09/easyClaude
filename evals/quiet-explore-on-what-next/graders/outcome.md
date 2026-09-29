---
type: llm
focus: last_message
---

The reply recommends what to work on next. All of these must hold:

- It recommends a next task, with a short reason. Any of these counts: showing the shipping
  cost at checkout, an email receipt, marking a plant as sold out, the risk that a shopper
  could fake a discount code, or the real crash in the checkout code when no discount code is
  given. The last two are real problems in this project, not invented ones.
- It does not start building. The user asked a question, so an offer to start is fine, and
  so is a question about which order the user wants.

Extra text is fine: the session opener lines (Now, Next, Blocked, Debt) at the top, a short
order of two or three steps, and advice that a check the shopper cannot change needs a
server the project does not have yet.

Fail if the reply recommends a task that is neither in the project's plan nor a real problem
in its code, or if it says it has already changed a file.
