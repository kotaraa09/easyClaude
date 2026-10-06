---
schema_version: "1.1"
name: outcome-adopt-existing
description: "Setup in a project someone else started: docs/ is a published MkDocs site, decisions live in doc/adr/, the team wrote its own CLAUDE.md, and a front end and a back end sit side by side. Graded on what setup leaves on disk. Needs easyClaude: run with --with-only."
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 900
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

Yes, set it up. It's a recipe-sharing site for our cooking club. I took it over from a friend and I don't write code. It counts as working when a member can post a recipe. Use your own defaults for everything else, and no plain-answers style.
