---
schema_version: "1.1"
name: plan-offers-two-ways
description: "A feature with two real ways to build it: saved where it lives decides what the shopper gets. From Feature Dev's design step, cut to two options a beginner can weigh. The plan should offer both in plain words, recommend one, and ask before building."
tags: [triggering, positive]
runs: 3
max_turns: 8
allowed_tools: [Skill, Read, Glob, Grep]
---

let shoppers save their delivery address so they don't type it every time
