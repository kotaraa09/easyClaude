---
description: Set up a sustained low-cost stretch (explicit, two steps, no hidden state)
disable-model-invocation: true
allowed-tools: Read, Write, Edit
---

The user wants a sustained low-cost stretch, not a single cheap turn.

Be honest about how this works: **easyClaude cannot change the session model.** Only the user can, via `/model`. There is deliberately no hidden framework state that could silently degrade their work.

Do this:

1. Check `.gitignore` first, and add `.claude/cheap-session` and `.claude/cheap-contract.md` if they are not already there. Create the file if the project has none. These are one person's choice to lower the standard of every turn; committing them would apply that choice to everyone who clones the repo, without them ever agreeing to it. `/easyclaude:autoship` protects its own file the same way and for the same reason.
2. Write `.claude/cheap-session` containing today's date. `SessionStart` reads it, so the contract is re-applied automatically in future sessions until it is cleared.
3. Copy `${CLAUDE_PLUGIN_ROOT}/reference/cheap.md` to `.claude/cheap-contract.md`. It is deliberately **not** in `.claude/rules/`: everything there loads on every turn of every session, and this contract is for a minority of turns. Planting it here means it costs nothing until someone arms it.
4. Read `.claude/cheap-contract.md` and restate its contract in your reply. That is what makes it apply for the rest of *this* session — it lands in the conversation, so it costs nothing extra per turn.
5. Then tell the user, in exactly this shape:

```
Cheap session armed. Two things to do yourself:

  1. Run: /model sonnet            ← the actual 5x saving; I can't do this for you
  2. Run: /easyclaude:full         ← when you're done, to clear the contract

Your model is shown in the UI, so you can't lose track of it.
```

6. Say nothing else.

<!-- Deliberately NOT a UserPromptSubmit hook. That fires an LLM evaluation on every
     prompt, which would burn tokens on a feature whose whole purpose is saving them.
     SessionStart already runs once per session at no marginal cost. -->
