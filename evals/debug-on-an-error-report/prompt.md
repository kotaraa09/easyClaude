---
schema_version: "1.1"
name: debug-on-an-error-report
description: A reported error must reach debug, so the cause is found before anything is edited. Reword debug's description and this quietly lands on build-task instead.
tags: [triggering, positive]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

it's throwing an error in checkout
