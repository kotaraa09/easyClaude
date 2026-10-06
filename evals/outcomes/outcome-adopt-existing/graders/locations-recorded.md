---
type: regex
target: trace
pattern: 'easyclaude\.json","content":"[^}]{0,200}planning/STATE\.md[^}]{0,200}doc/adr/'
---

Setup tried to record the new places: the plan in planning/, decisions in the ADR folder.
Graded on the attempt, because the eval runner denies every write into .claude/. On a
real computer Claude Code asks the user first, and kickoff warns them it will.
