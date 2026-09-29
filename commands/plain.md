---
description: Turn short answers in plain words on or off for this project
argument-hint: "[off]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit
---

Arguments: `$ARGUMENTS`

Set `outputStyle` in `.claude/settings.local.json`, and keep every other key in that file:

- no argument, or `on`: `"outputStyle": "easyclaude:plain"`
- `off`: remove the `outputStyle` key. If that leaves the file as `{}`, delete the file.

Create the file if it does not exist. It is this person's own choice, so make sure
`.gitignore` lists `.claude/settings.local.json`, and add it if it does not.

Then tell the user in one plain sentence, in their language, that it applies from their next
message: answers start with the result and skip code terms unless they need them (on), or
answers go back to the usual detail (off). Say nothing else.
