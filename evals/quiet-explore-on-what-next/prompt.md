---
schema_version: "1.1"
name: quiet-explore-on-what-next
description: "The pair for explore-code-on-where-is-it. \"What should I work on next?\" is answered from docs/STATE.md, and searching the code for it is wasted work."
tags: [triggering, negative]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

what should I work on next?
