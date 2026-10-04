---
schema_version: "1.1"
name: asks-on-sort-the-plants
description: "A short request that leaves out one choice that changes the result: by price or by name, and which way. It must get a question, not a silent pick. Harder than asks-on-a-vague-request, where Claude asks with or without the plugin."
tags: [triggering, positive]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep, Edit]
---

sort the plants
