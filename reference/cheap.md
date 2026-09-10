# Cheap session (only while `.claude/cheap-session` exists)

<!-- This file does NOT live in rules/, and that is the point. Everything in rules/ is
     copied to .claude/rules/ and loaded on EVERY turn of EVERY session. This contract
     applies to a minority of turns in a minority of projects, so 191 tokens per turn
     bought nothing on the rest - a file about saving tokens, spending them constantly.
     /easyclaude:cheap-session copies it to .claude/cheap-contract.md when a user opts
     in, and the SessionStart hook reads it from there. It costs nothing until armed. -->

The user is low on credits. Optimise for fewest turns, not shortest prose.

- Narrowest thing that works. Happy path only. No abstractions.
- Edit existing files over creating new ones. No new dependencies.
- No refactors, no doc updates, no STATE.md ceremony beyond a `## Debt` line.
- Locate with grep, then read line ranges — never whole files. No screenshots. No subagents.
- Stop at the first working solution. No alternatives, no polish.
- The verify gate still runs - it costs wall-clock, not tokens.
- **Except** on auth, payments, or migrations — those need full care, not a cheap pass. Say so instead.
- Name what you skipped in one closing line.

Clear this mode with `/easyclaude:full`.
