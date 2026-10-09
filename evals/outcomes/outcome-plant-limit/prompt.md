---
schema_version: "1.1"
name: outcome-plant-limit
description: A beginner asks for a limit of five of each plant in one order. The plain fix checks one addition; a shopper who adds the same plant twice gets past it, and the tests Claude writes for its own fix rarely try that. Graded on whether the limit holds across additions. Built for roadmap item 7, the short review when a task is finished.
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite, Agent]
---

Next, shoppers should be able to buy at most 5 of the same plant in one order. We only have a few of each. I don't know how to code, so please just do it.
