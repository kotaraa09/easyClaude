---
schema_version: "1.1"
name: outcome-rename-shop-th
description: The rename-shop task, asked in Thai. Same checks, and the reply must be in Thai. The shop's names stay in English, as a Thai shop owner would type them.
tags: [outcome]
runs: 3
max_turns: 20
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

ช่วยเปลี่ยนชื่อร้านจาก Plant Corner เป็น Green Corner ทุกที่ที่คนเห็นบนเว็บไซต์ให้หน่อยครับ
