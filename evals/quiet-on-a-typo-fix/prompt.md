---
schema_version: "1.1"
name: quiet-on-a-typo-fix
description: A one-word change must not start the workflow. A framework that fires on everything is worse than one that fires on nothing, and no structural check can express a must-stay-quiet case.
tags: [triggering, negative]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

fix this typo in the footer
