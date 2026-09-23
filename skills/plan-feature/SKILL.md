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

Then read `## Debt` in `docs/STATE.md` and pull out anything that touches the area you are about to plan. **This is the moment debt is cheap.** A stub you are about to build three tasks on top of costs one task to fix now and a rewrite later — and planning time is the only point where that trade is still visible. Fold what's relevant into the task list and say which entries you took.

Leave the rest alone. This is a readback, not a cleanup: turning a feature request into a debt-paydown plan the user didn't ask for is how the ceremony becomes the thing people delete.

## 2. Name the parts you should not be writing

Before listing tasks, mark any that are long-solved problems — dates and timezones, money, auth, crypto, parsing a file format, validation, retries. Those become "adopt a library" tasks, not "build" tasks, and `/easyclaude:pick-library` handles them. Deciding this at plan time is far cheaper than discovering it halfway through an implementation.

## 3. Ask only what you genuinely can't decide

At most two questions, and only where two readings lead to materially different builds. Pick sensible defaults for everything else and state them.

## 4. Write the spec

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
- **Write it in the user's language and in their words.** The next session reads `## Now` and `## Next` back to them as its first lines. "Photos open full screen when tapped" is a task a beginner can follow; "lightbox modal in `gallery.js`" is not. Technical detail goes after a dash, if it is needed at all.
- Each task is a **vertical slice that runs when it's done** — not "write the model", "write the view", "wire it up".
- Three to six tasks. More means the feature needs splitting.
- If a task can't be verified, say how it will be checked by hand.

## 5. Stop

Show the plan and ask for a yes. **Do not start building in the same turn.** The point of separating these is that the user gets a cheap chance to say "no, not like that".
