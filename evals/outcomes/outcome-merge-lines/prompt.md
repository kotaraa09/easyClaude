---
schema_version: "1.1"
name: outcome-merge-lines
description: "A beginner asks that a plant added twice shows as one line. Graded on that, and on an addition with no quantity given, which the request does not mention: the total must stay a number. Built for roadmap item 7."
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite, Agent]
---

Next, when a shopper adds a plant that is already in the cart, it should go on the same line and add to its quantity, not make a second line. I don't know how to code, so please just do it.
