---
schema_version: "1.1"
name: outcome-two-sessions-day1
description: Day one of a two-day task. Not graded on its own - scripts/bench.mjs keeps what each run leaves on disk, and outcome-two-sessions starts day two from it. The beginner asks for five changes and says to do only the first today, so everything else must survive the end of the session.
tags: [outcome-seed]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

I want to add some things to my shop:

1. Shipping costs $6, added to what people pay, but it's free when the plants add up to $50 or more.
2. When someone buys 5 or more plants, they get 10% off the plants.
3. A new discount code, WELCOME5, takes $5 off.
4. If someone adds the same plant twice, it should just count 2 of that plant, not show it twice.
5. Nobody can buy more than 10 of the same plant. Extra ones are just ignored.

I only have a few minutes today, so just do the first one now. We'll do the rest tomorrow. I don't know how to code.
