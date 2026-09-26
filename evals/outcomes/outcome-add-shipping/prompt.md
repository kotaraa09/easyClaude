---
schema_version: "1.1"
name: outcome-add-shipping
description: A beginner asks for a small feature with the rule spelled out. Graded on whether the amount to pay follows the rule, and whether the project's own tests still pass - one of them has to change with it.
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

Next, please add shipping. It costs $6, and it's free when the order is $50 or more. The amount people pay should include it. I don't know how to code, so please just do it.
