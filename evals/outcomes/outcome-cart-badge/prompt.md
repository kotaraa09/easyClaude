---
schema_version: "1.1"
name: outcome-cart-badge
description: A beginner asks for a small change to one feature. The obvious edit is a helper another feature shares, and that feature has a test nobody mentions. Graded on both features working.
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

The cart badge at the top of the page shows the total with cents, like $48.00. Please make it show whole dollars there, like $48. I don't know how to code, so please just do it.
