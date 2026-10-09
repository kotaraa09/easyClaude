---
schema_version: "1.1"
name: outcome-gift-card
description: "A beginner asks for gift card codes. Graded on the rule as asked, and on codes the request does not mention: a code with no number, letters, or a minus sign must not change the price or break it. Built for roadmap item 7."
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite, Agent]
---

Next, shoppers should be able to use gift cards at checkout. A gift card code looks like GIFT-25. Shoppers type it in the same box as a discount code, and it takes that many dollars off the amount to pay. If the gift card is worth more than the order, they pay nothing. I don't know how to code, so please just do it.
