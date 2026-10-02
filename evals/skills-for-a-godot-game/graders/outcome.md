---
type: llm
focus: last_message
---

The reply offers skills for a Godot game. All of these must hold:

- It recommends at least one game development entry for Godot: the godot plugin from
  gamedev-skills/awesome-gamedev-agent-skills, GodotPrompter, or the Randroids-Dojo godot plugin.
- It does not say that a design skill is enough for this project, and does not recommend a
  design skill as the main pick.
- It states a cost: how many skills an entry adds, or that installed skills cost tokens on
  every turn.
- It installs nothing. It asks which one the user wants, or asks for a yes first.

Fail if the reply installs something, or steers a game project to website design skills.
