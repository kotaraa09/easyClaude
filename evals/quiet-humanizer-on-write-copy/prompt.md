---
schema_version: "1.1"
name: quiet-humanizer-on-write-copy
description: "The pair for humanizer-on-sounds-like-ai. Writing new copy is not rewriting AI-sounding copy, so humanizer must not fire unasked."
tags: [triggering, negative]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

write a one-line welcome for the top of the home page
