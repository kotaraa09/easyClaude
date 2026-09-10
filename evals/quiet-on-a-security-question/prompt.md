---
schema_version: "1.1"
name: quiet-on-a-security-question
description: security-check is typed, not spoken. Every README so far promised this phrase would trigger it, while the skill was configured never to fire on its own - the drift this case pins down.
tags: [triggering, negative]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

is this safe to make public?
