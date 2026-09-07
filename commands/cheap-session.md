---
description: Set up a sustained low-cost stretch (explicit, two steps, no hidden state)
disable-model-invocation: true
allowed-tools: Read, Write, Edit
---

The user wants a sustained low-cost stretch, not a single cheap turn.

Be honest about how this works: **easyClaude cannot change the session model.** Only the user can, via `/model`. There is deliberately no hidden framework state that could silently degrade their work.

Do this:

1. Write `.claude/cheap-session` containing today's date. A `UserPromptSubmit` rule re-injects the frugal contract while it exists.
2. Tell the user, in exactly this shape:

```
Cheap session armed. Two things to do yourself:

  1. Run: /model sonnet        ← the actual 5x saving; I can't do this for you
  2. Run: /easyclaude:full                 ← when you're done, to clear the contract

Your model is shown in the UI, so you can't lose track of it.
```

3. Say nothing else.
