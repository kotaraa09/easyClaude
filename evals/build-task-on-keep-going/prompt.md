---
schema_version: "1.1"
name: build-task-on-keep-going
description: "\"keep going\" must reach build-task, not plan-feature. Re-planning work that is already planned is the failure this case exists for."
tags: [triggering, positive]
runs: 3
max_turns: 14
allowed_tools: [Skill, Read, Glob, Grep]
---

keep going
