---
description: End a cheap session and return to normal working standards
disable-model-invocation: true
allowed-tools: Read, Bash
---

Delete `.claude/cheap-session` if it exists.

Then remind the user in one line that if they ran `/model sonnet`, they should run `/model` to switch back.

If the file did not exist, just say there was no cheap session active. Do not elaborate.
