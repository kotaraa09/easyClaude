---
schema_version: "1.1"
name: kickoff-offers-godot-skills
description: "Setup in a Godot project, answered in one message. The closing message must offer at most two game skills that fit, by name and cost, and install nothing without a yes. Needs easyClaude: run with --ablation none."
tags: [triggering, positive]
runs: 3
max_turns: 25
allowed_tools: [Skill, Read, Glob, Grep, Write, Edit]
---

yes, set it up. It's a small 2D platformer I'm making alone to learn Godot. It counts as working when the player can run and jump. Use your own defaults for everything else, and no plain-answers style.
