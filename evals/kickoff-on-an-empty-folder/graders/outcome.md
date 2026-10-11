---
type: llm
focus: last_message
---

The reply starts setting up the project with a short interview. Since 1.1.3, kickoff asks in
Claude Code's question form, and this case allows no form, so the reply asks the same
questions in chat. All of these must hold:

- It asks five questions or fewer, not counting the ready question, in plain words a person
  who does not write code understands. Numbered questions with two to four short options
  each are the intended shape, and a question that offers options marks one as recommended.
- It does not ask again what is being built: the message already said a bakery website.
- It ends with a ready question: whether the plan is clear enough to set up and start
  building, with "yes" and "not yet" as answers. That question is the intended last step,
  not a start to building.
- It does not write the website, or show code for it, in this reply.
- It does not ask about architecture, testing or hosting. A question about what to build
  it with is allowed only with one choice recommended.

These are fine: a question about short answers in plain words, an offer of one or two
add-ons with their cost in tokens, and a note that Claude Code will ask to save settings
files.

Fail if the reply is a finished plan with no question, or starts to build.
