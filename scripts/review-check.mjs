// A second reader, once a message, when the checks pass on changed code.
//
// The checks run tests Claude wrote for code Claude wrote, so green means the code does what
// Claude meant. A reader who did not write it asks what Claude did not think of. The ship
// skill had that reader, and only at ship, so a beginner who never ships never got one.
//
// Roadmap item 7 first put the review inside build-task. In the benchmark on 2026-10-09,
// six runs of six answered "Next, please add ..." without any skill, so the review never
// ran. later-memo.mjs and look-check.mjs found the same: a line inside a skill did not change
// what Claude did, and a hook did. So the Stop hook asks for the review, once per message.
//
// The reviewer runs on Haiku and gets only the change. Not after each edit, not for notes or
// the plan, and not in cheap mode, which promises the fewest steps.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { cheapArmed } from './personal.mjs';
import { readTurn } from './look-check.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const memoPath = (root, session) =>
  join(tmpdir(), `easyclaude-review-${sha(`${root}\0${session}`).slice(0, 16)}.json`);

// What counts as code: anything but notes, the plan, data and settings. Tests count only
// beside a change to the code they test, so a turn that only adds a test is not reviewed.
const NOT_CODE = /\.(md|mdx|txt|json|ya?ml|toml|lock|csv|svg|png|jpe?g|gif|webp|ico)$/i;
const TEST_FILE = /(^|[\\/])(tests?|__tests__|spec|e2e)[\\/]|\.(test|spec)\.[a-z]+$/i;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const REVIEWER = /diff-reviewer/;

export function changedCode(tools) {
  return tools.some((t) => {
    const file = String(t.input?.file_path ?? '');
    return EDIT_TOOLS.has(t.name) && file && !NOT_CODE.test(file) && !TEST_FILE.test(file);
  });
}

const askedReviewer = (tools) => tools.some((t) =>
  (t.name === 'Agent' || t.name === 'Task') && REVIEWER.test(String(t.input?.subagent_type ?? '')));

// Called by the Stop hook once the checks pass. Returns the message to block with, or null.
export function reviewBlock(root, payload, { reviewSetting } = {}) {
  const session = payload.session_id;
  if (!session || !payload.transcript_path || reviewSetting === false) return null;
  if (cheapArmed(root)) return null;
  const turn = readTurn(payload.transcript_path);
  if (!turn || /^\s*\/easyclaude:cheap\b/.test(turn.text)) return null;
  if (!changedCode(turn.tools) || askedReviewer(turn.tools)) return null;

  const file = memoPath(root, session);
  try { if (JSON.parse(readFileSync(file, 'utf8')).held === turn.id) return null; } catch { /* none yet */ }
  try { writeFileSync(file, JSON.stringify({ held: turn.id })); } catch { return null; }

  return 'easyClaude: the checks pass. They test what you meant, so one reader who did not write ' +
    'this change looks at it once before the turn ends. Dispatch the easyclaude-diff-reviewer ' +
    'subagent with model "haiku", in the foreground, with this turn\'s change in the prompt and ' +
    'no other context: the git diff, or, with no tool that runs commands, each file you changed ' +
    'with the lines you wrote, and a new file whole. When its report arrives: fix a finding that ' +
    'names an input or state that breaks the code, and add a test for that input if the project ' +
    'has tests; put a finding you cannot confirm under ## Debt in docs/STATE.md, in the user\'s ' +
    'words, if that file exists. Do not review the fix again. If you cannot dispatch a subagent, ' +
    'say the change had no second reader. Your reply is the last message the user reads: start ' +
    'it with one line on what you changed, then one on what the reader found.';
}
