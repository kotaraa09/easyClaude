---
type: llm
focus: last_message
---

The reply starts setting up the project with a short interview. All of these must hold:

- It asks one question, or two at most, in plain words a person who does not write code
  understands. It does not number or label them as a form.
- It does not ask again what is being built: the message already said a bakery website.
- It does not write the website, or show code for it, in this reply.
- It does not ask about architecture, frameworks, testing or hosting.

Fail if the reply is a list of options to pick from, or a finished plan with no question.
