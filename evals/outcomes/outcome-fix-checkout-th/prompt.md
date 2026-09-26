---
schema_version: "1.1"
name: outcome-fix-checkout-th
description: The fix-checkout task, asked in Thai. Same checks, and the reply must be in Thai. Most people easyClaude is for write in Thai, and every other task is in English, so a bug that only shows in Thai would pass unseen.
tags: [outcome]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Skill, Read, Glob, Grep, TodoWrite]
---

ถ้ามีคนจะจ่ายเงินโดยไม่ใส่โค้ดส่วนลด หน้าชำระเงินจะพัง ผมเขียนโค้ดไม่เป็น ช่วยแก้ให้หน่อยครับ
