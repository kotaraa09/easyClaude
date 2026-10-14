---
schema_version: "1.1"
name: outcome-dead-button
description: A beginner reports a button that does nothing, in a project whose tests all pass. Graded on the Pay button showing the amount to pay, on the real page.
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

When I click the Pay button on the shop page, nothing happens. I don't know how to code. Please fix it for me.
