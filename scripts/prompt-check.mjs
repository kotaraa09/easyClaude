#!/usr/bin/env node
// The UserPromptSubmit hook: tells Claude when the conversation has grown long enough to
// cost more than the task in hand.
//
//   node prompt-check.mjs     the hook - reads hook JSON on stdin, prints hook JSON or nothing
//
// Every step of a turn re-reads the whole conversation. Measured on one small task, a
// fresh conversation cost $0.18 and a long one $1.25, and the reading alone was nine times
// more. easyClaude keeps the plan in docs/STATE.md and the opener reads it back, so a fresh
// conversation loses nothing - but only the user can type /clear or /compact. This hook
// measures the conversation from the session file and hands Claude the facts:
//
//   cheap mode (/easyclaude:cheap, /easyclaude:cheap-session, or an armed cheap session)
//     in a long conversation: do not start the task, ask for /clear or /compact first.
//   any other prompt, once per session, in a very long conversation: finish the task in
//     hand, then suggest a fresh conversation in one line.
//
// It prints nothing on every other prompt, so it costs no tokens there. It never blocks a
// prompt itself: a blocked prompt can only carry a fixed English message, and the user may
// write in any language, so Claude says it instead.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { markLater } from './later-memo.mjs';

// History, in tokens, beyond what the session's first request carried. That first request
// is Claude Code's own prompt, tools and project files - a floor no /clear removes - so it
// is subtracted rather than guessed, and a user with many MCP servers is not penalised.
export const CHEAP_LIMIT = 20_000;
export const ADVICE_LIMIT = 80_000;

const CHEAP_COMMAND = /^\s*\/easyclaude:cheap(-session)?\b/;

// Context size of each main-thread request, from the usage Claude Code writes per reply.
export function historyTokens(transcriptPath) {
  let text;
  try { text = readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  const sizes = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const u = entry?.message?.usage;
    if (entry.type !== 'assistant' || entry.isSidechain || !u) continue;
    sizes.push((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0));
  }
  if (!sizes.length) return 0;
  // After /compact the context shrinks in the same file, so the smallest request so far is
  // the floor, not the first one.
  return Math.max(0, sizes[sizes.length - 1] - Math.min(...sizes));
}

// A bug report in plain words. The outcome benchmark (scripts/bench.mjs) found that with
// easyClaude loaded, Claude fixed "the checkout breaks" in one edit and wrote no test in
// two runs of three, where Claude with no plugin wrote one every time. The debug skill
// says to write that test, and a rule in workflow.md said it too - but neither loads
// when Claude decides the fix is too small to need them, and here it decided that before
// it read either. This line arrives with the message, before anything is decided.
// English and Thai, the two languages this project is written in; a miss costs nothing
// but the nudge.
const BUG_REPORT = new RegExp([
  /(?<![a-z])(bugs?|broken|breaks?|crash(es|ed|ing)?|errors?|exceptions?|fail(s|ed|ing)?|wrong)(?![a-z])/.source,
  /(?<![a-z])(doesn'?t|does not|isn'?t|is not|won'?t|stopped|not) work/.source,
  'พัง', 'ไม่ทำงาน', 'ใช้ไม่ได้', 'ใช้งานไม่ได้', 'บั๊ก', 'ผิดพลาด', 'ค้าง',
].join('|'), 'i');
export const looksLikeBug = (prompt) => !/^\s*\//.test(prompt) && BUG_REPORT.test(prompt);
const BUG_NUDGE = 'easyClaude: this reads like a bug report. Use the debug skill: find the ' +
  'cause before you edit, and add a test that fails without the fix. A one-line fix gets ' +
  'its test too.';

// Work left for later. The next session sees only the project, so anything not written to
// docs/STATE.md is gone. In the two-session benchmark a beginner asked for five changes
// and "just the first one today"; one run of three wrote the other four nowhere, and the
// two that did put them below older tasks, where the next session never reached them.
const LATER = new RegExp([
  /(?<![a-z])(tomorrow|later|next time|another day|next week|some other time)(?![a-z])/.source,
  'พรุ่งนี้', 'ทีหลัง', 'ไว้ก่อน', 'คราวหน้า', 'วันหลัง', 'ครั้งหน้า',
].join('|'), 'i');
export const leavesWorkForLater = (prompt) => !/^\s*\//.test(prompt) && LATER.test(prompt);
const laterNudge = (date) => 'easyClaude: the user is leaving part of this for another ' +
  'session, and that session will not see this conversation - only docs/STATE.md carries ' +
  'over. Before you end this turn, put every item they asked for and you did not finish at ' +
  `the top of ## Next, in their words, each ending with "(asked ${date})".`;

// "Finish the rest." build-task says to go on to the next task when the user asked for
// several, and on day two of the benchmark Claude still built one and asked "want me to
// continue?" in two runs of three. The same line, arriving with the message, is what
// worked for bug fixes.
const FINISH = new RegExp([
  /(?<![a-z])(finish|complete|do|build)(?![a-z])[^.?!]{0,30}(the rest|everything|all of (it|them)|them all|remaining)/.source,
  /(?<![a-z])the rest of (it|them|what|the)(?![a-z])/.source,
  'ที่เหลือ', 'ให้เสร็จ', 'ให้ครบ',
].join('|'), 'i');
export const asksToFinishSeveral = (prompt) => !/^\s*\//.test(prompt) && FINISH.test(prompt);
const FINISH_NUDGE = 'easyClaude: the user asked you to finish several tasks. Do them one ' +
  'after another in this turn, each checked and ticked off before the next. Do not stop to ' +
  'ask whether to go on; stop when all are done, or at the first one that fails.';

function say(context) {
  if (context) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
    }));
  }
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const prompt = String(payload.prompt ?? '');
  const cheap = CHEAP_COMMAND.test(prompt) || existsSync(join(root, '.claude', 'cheap-session'));
  // Not in cheap mode: its contract asks for the smallest fix that works, and says so.
  const later = leavesWorkForLater(prompt) && existsSync(join(root, 'docs', 'STATE.md'));
  // The Stop hook holds the turn once if docs/STATE.md is still unchanged. See later-memo.mjs.
  if (later) markLater(root, payload.session_id);
  const nudges = [
    !cheap && looksLikeBug(prompt) ? BUG_NUDGE : null,
    // Only where there is a state file to write to. In cheap mode too: forgetting the rest
    // of the request is not a saving.
    later ? laterNudge(new Date().toLocaleDateString('en-CA')) : null,
    // Not in cheap mode, which does one thing per turn on purpose.
    !cheap && asksToFinishSeveral(prompt) ? FINISH_NUDGE : null,
  ].filter(Boolean).join('\n\n') || null;
  // Nothing left to say this session, so the transcript - which can run to megabytes - is
  // not read on every prompt.
  if (!cheap && alreadyAdvised(payload.session_id)) return say(nudges);

  const history = payload.transcript_path ? historyTokens(payload.transcript_path) : null;
  if (history === null) return say(nudges);
  const k = `about ${Math.round(history / 1000)}k tokens`;

  let context = null;
  if (cheap && history > CHEAP_LIMIT) {
    context = `easyClaude cheap mode: this conversation already holds ${k} of history, and every ` +
      'step re-reads all of it, so it now costs more than the cheap rules save. Do not start ' +
      'the task, and do not read or edit anything this turn. ' +
      (/^\s*\/easyclaude:cheap-session\b/.test(prompt)
        ? 'Arm the cheap session as the command says, then stop. '
        : '') +
      "In the user's language, tell them in two or three plain sentences: type /clear (their plan " +
      'is saved in docs/STATE.md, and the next session opens with it) or /compact (keeps a short ' +
      'summary of this conversation), then send the same request again. Keep both commands exactly ' +
      'as written.';
  } else if (!cheap && history > ADVICE_LIMIT && !alreadyAdvised(payload.session_id)) {
    context = `easyClaude: this conversation holds ${k} of history, and every step re-reads it. ` +
      'Do the task as usual. When it is finished, add one line in the user\'s language: before the ' +
      'next task, /clear makes every step cheaper, and the plan stays in docs/STATE.md. Say this once.';
    markAdvised(payload.session_id);
  }

  say([nudges, context].filter(Boolean).join('\n\n'));
}

// Once per session: advice repeated on every prompt is noise, and costs tokens each time.
const adviceMemo = (session) =>
  join(tmpdir(), `easyclaude-advised-${createHash('sha256').update(String(session)).digest('hex').slice(0, 16)}`);
const alreadyAdvised = (session) => Boolean(session) && existsSync(adviceMemo(session));
const markAdvised = (session) => {
  if (!session) return;
  try { writeFileSync(adviceMemo(session), ''); } catch { /* advice may repeat; nothing breaks */ }
};

// Run as the hook; imported by the tests for historyTokens.
if (process.argv[1]?.endsWith('prompt-check.mjs')) main();
