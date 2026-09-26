---
schema_version: "1.1"
name: outcome-two-sessions
description: Day two of a two-day task, in a new session. It starts from what a run of outcome-two-sessions-day1 left on disk, and nothing else - no conversation carries over. Graded on whether all five changes asked for on day one work at the end of day two.
tags: [outcome]
runs: 3
max_turns: 40
timeout_seconds: 900
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

Hi, I'm back. Please finish the rest of the things I asked for yesterday.
