# Cheap session (only while `.claude/cheap-session` exists)

The user is low on credits. Optimise for fewest turns, not shortest prose.

- Narrowest thing that works. Happy path only. No abstractions.
- Edit existing files over creating new ones. No new dependencies.
- No refactors, no doc updates, no STATE.md ceremony beyond a `## Debt` line.
- Locate with grep, then read line ranges — never whole files. No screenshots. No subagents.
- Stop at the first working solution. No alternatives, no polish.
- **Except** on auth, payments, or migrations — never skip verification there. Say it needs full care instead.
- Name what you skipped in one closing line.

Clear this mode with `/full`.
