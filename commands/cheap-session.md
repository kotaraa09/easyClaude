---
description: Set up a sustained low-cost stretch (explicit, two steps, no hidden state)
disable-model-invocation: true
allowed-tools: Read, Write, Edit
---

The user wants a sustained low-cost stretch, not a single cheap turn.

Be honest about how this works: **easyClaude cannot change the session model.** Only the user can, via `/model`. There is deliberately no hidden framework state that could silently degrade their work.

Do this:

1. Write `.claude/cheap-session` containing today's date. `SessionStart` reads it, so the contract is re-applied automatically in future sessions until it is cleared.
2. Read `.claude/rules/cheap.md` and restate its contract in your reply. That is what makes it apply for the rest of *this* session — it lands in the conversation, so it costs nothing extra per turn.
3. Then tell the user, in exactly this shape:

```
Cheap session armed. Two things to do yourself:

  1. Run: /model sonnet            ← the actual 5x saving; I can't do this for you
  2. Run: /easyclaude:full         ← when you're done, to clear the contract

Your model is shown in the UI, so you can't lose track of it.
```

4. Say nothing else.

<!-- Deliberately NOT a UserPromptSubmit hook. That fires an LLM evaluation on every
     prompt, which would burn tokens on a feature whose whole purpose is saving them.
     SessionStart already runs once per session at no marginal cost. -->
