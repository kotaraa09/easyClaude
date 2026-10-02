---
type: llm
focus: last_message
---

The reply closes the setup and offers skills for this game. All of these must hold:

- It offers one or two skills for Godot by name, such as the godot plugin from
  gamedev-skills/awesome-gamedev-agent-skills, GodotPrompter, or the Randroids-Dojo godot plugin.
  More than two, or a design skill for websites, fails.
- It says what each offered skill costs: tokens on every turn, or the number of skills it adds.
- It asks a yes-or-no question and installs nothing in this reply.

Extra text is fine: what setup wrote, that the checks could not run here, and the next step.

Fail if the reply offers no skills, or says a category name the user must type instead of
naming the skills.
