---
schema_version: "1.1"
name: outcome-fixed-code
description: "A beginner asks for two new discount codes, one of them a fixed amount. Graded on the codes, and on a cart worth less than the fixed amount, which the request does not mention: the amount to pay must not go below zero. Built for roadmap item 7."
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite, Agent]
---

Next, please add two discount codes. SUMMER25 gives 25% off, and WELCOME5 gives $5 off the order. I don't know how to code, so please just do it.
