---
schema_version: "1.1"
name: quiet-slopmonster-on-write-copy
description: "The pair for slopmonster-on-sounds-like-ai. Writing new copy is not de-slopping it. Its cleanse step bills a second model provider, so it must not fire unasked."
tags: [triggering, negative]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

write a one-line welcome for the top of the home page
