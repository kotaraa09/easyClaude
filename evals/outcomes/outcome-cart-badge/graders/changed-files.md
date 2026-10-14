---
type: regex
target: trace
pattern: '"name":"(Edit|Write)"'
---

A sanity line for the runner's own table: Claude changed at least one file. The real
grading is in check.mjs, which scripts/bench.mjs runs after the run, on a copy of what
Claude left behind.
