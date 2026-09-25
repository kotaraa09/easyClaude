#!/usr/bin/env node
// The PreModelSwitch hook: says what a model switch costs, before it happens.
//
//   node model-switch.mjs     the hook - reads hook JSON on stdin, prints hook JSON or nothing
//
// /easyclaude:cheap-session tells the user to run /model sonnet. In a long conversation
// that switch re-sends everything to the new model, and it can cost more than the cheap
// session saves. The figure is in the hook input, so this shows it.
//
// It never blocks and never asks. A PreModelSwitch "ask" is a refusal everywhere except
// /model at the terminal - in /config, and when turning on fast mode - and a hook that
// fails or times out on this event blocks the switch. So this can only add a line, and
// any error lets the switch go ahead untouched.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { switchNotice } from './cost-notice.mjs';

try {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const notice = switchNotice(payload, existsSync(join(root, 'docs', 'STATE.md')));
  if (notice) process.stdout.write(JSON.stringify({ systemMessage: notice }));
} catch { /* see above: say nothing, and let the switch happen */ }
process.exit(0);
