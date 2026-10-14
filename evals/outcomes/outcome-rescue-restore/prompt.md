---
schema_version: "1.1"
name: outcome-rescue-restore
description: The turn after outcome-rescue-asks. From a saved first turn, where Claude found yesterday's version and asked, the beginner says yes. Graded on yesterday's version being back, and today's unsaved work still recoverable.
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

Yes, please go ahead.
