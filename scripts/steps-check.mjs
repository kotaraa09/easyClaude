#!/usr/bin/env node
// The PostToolUse hook on edits: asks Claude for a step list once a request has several steps.
//
//   node steps-check.mjs     the hook - reads hook JSON on stdin, may print hook JSON
//
// The progress panel shows Claude's own step list. A user testing 1.1.2 saw it empty on
// every request: Claude did fifty things and then said it was done, and the panel could
// only say "working", then "done". Nothing in easyClaude asked for a list. A line in a skill
// is weighed and often dropped, so this asks at the moment it matters: the second change
// of a request that has no list yet. Once per request, and never in cheap mode.
//
// It reads only the end of the transcript. A request whose start is not in that part is a
// long one that was already asked, or will be on the next request.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { cheapArmed } from './personal.mjs';

const TAIL_BYTES = 1024 * 1024;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const LIST_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate']);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const memoPath = (session) => join(tmpdir(), `easyclaude-steps-${sha(String(session)).slice(0, 16)}.json`);

function tail(path) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const text = buf.toString('utf8');
    // The first line may be cut in half; drop it unless the file was read whole.
    return len < size ? text.slice(text.indexOf('\n') + 1) : text;
  } finally { closeSync(fd); }
}

// Text the harness writes as if from the user: a hook, a reminder, an interruption, or the
// summary a compaction leaves. A slash command (<command-name>) is the user's own request.
const NOT_TYPED = /^\s*(Stop hook feedback|<system-reminder|<local-command|<task-notification|\[Request interrupted|This session is being continued)/;
const typed = (t) => typeof t === 'string' && t.trim() !== '' && !NOT_TYPED.test(t);

// A message the user typed: not a tool result, not the harness, not a helper agent's.
const isUserMessage = (e) => {
  if (e?.type !== 'user' || e.isMeta || e.isSidechain || e.isCompactSummary) return false;
  const c = e.message?.content;
  if (typeof c === 'string') return typed(c);
  return Array.isArray(c) && !c.some((b) => b.type === 'tool_result') &&
    c.some((b) => b.type === 'text' && typed(b.text));
};

// { id, edits, listed } for the request in progress, or null when its start is not in view.
export function currentRequest(transcriptPath) {
  let entries;
  try {
    entries = tail(transcriptPath).split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return null; }
  let start = -1;
  for (let i = entries.length - 1; i >= 0; i--) if (isUserMessage(entries[i])) { start = i; break; }
  if (start < 0) return null;
  const tools = entries.slice(start + 1)
    .filter((e) => e.type === 'assistant' && !e.isSidechain && Array.isArray(e.message?.content))
    .flatMap((e) => e.message.content.filter((b) => b.type === 'tool_use'));
  return {
    id: entries[start].promptId ?? entries[start].uuid ?? String(start),
    edits: tools.filter((t) => EDIT_TOOLS.has(t.name)).length,
    listed: tools.some((t) => LIST_TOOLS.has(t.name)),
  };
}

export const ASK = 'easyClaude: this request takes several steps, and the user follows them in a ' +
  'progress panel that shows your task list. Write the steps of this request into your task ' +
  'list now (TodoWrite, or TaskCreate if that is the tool you have), each in plain words the ' +
  'user understands, and mark each one in progress and then done as you go. Then carry on.';

// The text to add, or null.
export function stepsNudge(payload, { root } = {}) {
  if (!payload?.session_id || !payload.transcript_path) return null;
  if (root && cheapArmed(root)) return null;
  const req = currentRequest(payload.transcript_path);
  // Two changes: a one-line fix needs no list. The edit that fired this hook may not be
  // written yet, so this is the second or the third.
  if (!req || req.listed || req.edits < 2) return null;
  const file = memoPath(payload.session_id);
  try { if (JSON.parse(readFileSync(file, 'utf8')).asked === req.id) return null; } catch { /* none yet */ }
  try { writeFileSync(file, JSON.stringify({ asked: req.id })); } catch { return null; }
  return ASK;
}

if (process.argv[1]?.endsWith('steps-check.mjs')) {
  let payload = null;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
  // A helper agent's edits are its own; the panel follows the main conversation.
  if (payload?.agent_id) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
  const text = stepsNudge(payload, { root });
  if (text) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
    }));
  }
}
