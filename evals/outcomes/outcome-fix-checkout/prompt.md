---
schema_version: "1.1"
name: outcome-fix-checkout
description: A beginner reports a bug in their own words. Graded on whether paying without a code works afterwards, nothing else broke, and a test now covers it.
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

When someone tries to pay without a discount code, the checkout breaks. I don't know how to code. Please fix it for me.
