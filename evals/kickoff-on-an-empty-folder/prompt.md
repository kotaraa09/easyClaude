---
schema_version: "1.1"
name: kickoff-on-an-empty-folder
description: "The first thing a new user sees. In an empty folder the session opener sends every message to kickoff; this pins that it fires, and that its first reply is one plain question, not a menu or a build. No scaffold on purpose: the empty folder is the case."
tags: [triggering, positive]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

I want to make a website for my bakery
