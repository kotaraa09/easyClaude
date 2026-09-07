---
name: plan-feature
description: Turn a feature request into a short written spec and a numbered task list before any code is written. Use whenever the user asks for a new feature, page, screen, endpoint, integration, or capability and there is no matching task already in docs/STATE.md.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Plan a feature

Writing beats guessing. This step is cheap; a wrong build is not.

**Skip this entirely** for bug fixes, copy changes, styling tweaks, or anything under roughly 30 lines. Ceremony on small work is how frameworks get deleted. When in doubt, just do the work.

## 1. Understand before proposing

Read the relevant existing code first. A plan that ignores what's already there produces duplicate implementations — the most common failure in a long-running vibe-coded project.

## 2. Ask only what you genuinely can't decide

At most two questions, and only where two readings lead to materially different builds. Pick sensible defaults for everything else and state them.

## 3. Write the spec

Append to `docs/STATE.md` under `## Next` — not a separate file, so it stays where the next session will actually look:

```markdown
### <feature name>
**Goal:** <one sentence, in user terms>
**Done when:** <observable behaviour — what the user can do that they couldn't before>
**Not doing:** <explicit non-goals, so scope can't drift>

- [ ] <task 1 — a vertical slice that runs>
- [ ] <task 2>
- [ ] <task 3>
```

Rules for the task list:
- Each task is a **vertical slice that runs when it's done** — not "write the model", "write the view", "wire it up".
- Three to six tasks. More means the feature needs splitting.
- If a task can't be verified, say how it will be checked by hand.

## 4. Stop

Show the plan and ask for a yes. **Do not start building in the same turn.** The point of separating these is that the user gets a cheap chance to say "no, not like that".
