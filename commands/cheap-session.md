---
description: Set up a sustained low-cost stretch (explicit, two steps, no hidden state)
disable-model-invocation: true
allowed-tools: Read, Write, Edit
---

The user wants a sustained low-cost stretch, not a single cheap turn.

Be honest about how this works: **easyClaude cannot change the session model.** Only the user can, via `/model`. There is deliberately no hidden framework state that could silently degrade their work.

Do this:

1. Check `.gitignore` first, and add `.claude/cheap-session` and `.claude/cheap-contract.md` if they are not already there. Create the file if the project has none. These are one person's choice to lower the standard of every turn; committing them would apply that choice to everyone who clones the repo, without them ever agreeing to it. `/easyclaude:autoship` protects its own file the same way and for the same reason. If git already tracks either file, run `git rm --cached` on it: easyClaude ignores a tracked copy, because it came with the code and not from this user.
2. Write `.claude/cheap-session` containing today's date. `SessionStart` reads it, so the contract is re-applied automatically in future sessions until it is cleared.
3. Copy `${CLAUDE_PLUGIN_ROOT}/reference/cheap.md` to `.claude/cheap-contract.md`. It is deliberately **not** in `.claude/rules/`: everything there loads on every turn of every session, and this contract is for a minority of turns. Planting it here means it costs nothing until someone arms it.
4. Read `.claude/cheap-contract.md` and restate its contract in your reply. That is what makes it apply for the rest of *this* session — it lands in the conversation, so it costs nothing extra per turn.
5. Then tell the user these steps, in the language they write in, and nothing else. The commands stay exactly as written, because they must be typed that way:

```
Cheap session armed. Three things to do yourself:

  1. Run: /clear                   ← start short; your plan stays in docs/STATE.md
  2. Run: /model sonnet            ← about half the price per token; I can't do this for you
  3. Run: /easyclaude:full         ← when you're done, to clear the contract

Your model is shown in the UI, so you can't lose track of it.
```

6. Say nothing else.

<!-- "about half": Opus 5.5 is $4 / $20 per million tokens, Sonnet 5 is $2 / $10. This
     line said "5x" from an older price list. The switch is worth making once for a whole
     stretch, as here. Switching for a single turn is a different trade: a cache belongs to
     one model, so the new model re-reads the whole conversation at the cache-write price. -->

<!-- Deliberately NOT a UserPromptSubmit hook. That fires an LLM evaluation on every
     prompt, which would burn tokens on a feature whose whole purpose is saving them.
     SessionStart already runs once per session at no marginal cost. -->
