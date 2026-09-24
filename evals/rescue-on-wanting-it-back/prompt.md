---
schema_version: "1.1"
name: rescue-on-wanting-it-back
description: A request for an earlier version must reach rescue, so the user says yes before anything is restored. Until rescue listened for plain words, Claude restored files on its own, twice in testing.
tags: [triggering, positive]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

I changed a bunch of stuff and now the site is broken. I want yesterday's version back.
