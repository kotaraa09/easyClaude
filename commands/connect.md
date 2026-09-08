---
description: Advanced - connect MCP servers and AI providers by filling in one API-key form
argument-hint: (nothing) | status
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash
---

Requested: `$ARGUMENTS`

**This is an advanced option.** Never run it during kickoff and never offer it unprompted.
A project works fine with no connectors at all, and every server added is third-party code
plus a prompt-injection surface. The user came here on purpose.

For `status`, run step 3 only and stop.

## 1. Show what exists

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/connect.mjs --list
```

Three groups come back, and the difference matters:

- **no key needed** — goes into `.mcp.json`, committed, shared with anyone who clones
- **needs a key** — goes into `~/.claude.json`, outside the repo, private to this user
- **browser sign-in only** — Figma, Notion, Linear, Slack and friends. **No script can set
  these up.** They need the interactive `/mcp` flow. Say that plainly instead of trying.

## 2. Put the form where they can fill it

If `.env.example` has no connector block, append one:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/connect.mjs --form >> .env.example
```

Then tell them: copy `.env.example` to `.env`, fill in **only** what they already have, and
leave the rest blank. A blank line is a connector that stays switched off — there is nothing
to uninstall later.

**You cannot check their work.** `.env` is in `permissions.deny` for both read and edit, so
you cannot open it. That is deliberate: the script reads the file itself and reports only
which key *names* are filled, so a secret never enters your context. Don't try to work
around it, and don't ask them to paste a key into the chat.

The key does not reach the command line either. `claude mcp add` can only accept one
through its arguments, where any process running as that user can read it, so the script
passes a single-use placeholder and writes the real value into the config afterwards. So
never run `claude mcp add` by hand with a key in it — that is the thing this avoids.

## 3. See what got filled

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/connect.mjs --status
```

Names and present/absent only. If everything says "not set", they haven't saved `.env` yet —
say so rather than guessing at a cause.

## 4. Apply, after showing what will happen

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/connect.mjs --apply --dry-run
```

Show that output, get a yes, then run it without `--dry-run`. Adding a server changes what
runs on their machine, so it gets a confirmation like any other install.

## 5. Explain the approval gate rather than removing it

Project-scope servers land in `.mcp.json` and sit at **pending approval** until the user
accepts them on the next start. Tell them to expect the prompt. `claude mcp reset-project-choices`
re-asks if they change their mind.

**Never set `enableAllProjectMcpServers: true`,** and never suggest it. It auto-approves every
server in a committed `.mcp.json` — so cloning a repo would silently run whatever a stranger
put there. The gate existing is the reason a committed `.mcp.json` is safe to ship at all.

## 6. Close

One line per connector configured, one line naming any that need `/mcp` by hand, and stop.
Do not start using a newly added server in the same turn — it isn't connected until the
session restarts and the user approves it.
