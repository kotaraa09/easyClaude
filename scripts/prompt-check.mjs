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
import { readFileSync, existsSync, writeFileSync, rmSync, openSync, readSync, fstatSync, closeSync } from 'node:fs';
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

// A piece of interface that free libraries already do well. A user trying easyClaude on
// 2026-09-30 found features built by hand where a library existed, and the debugging and
// restyling that followed. plan-feature says to name one, but the plan is skipped for small
// work, and here the decision is made before any skill loads. "map" is matched as a word, so
// a sitemap is not one; a miss costs one line.
const SOLVED_PIECE = new RegExp([
  /(?<![a-z.])(calendars?|date ?pickers?|maps?|charts?|graphs?|rich ?text|wysiwyg|drag(-| and | ?& ?)drop|carousels?|sliders?|video players?|audio players?|file uploads?|markdown editors?|code editors?|pathfinding|physics engine)(?![a-z])/.source,
  'ปฏิทิน', 'แผนที่', 'กราฟ', 'แผนภูมิ', 'ลากวาง', 'อัปโหลด',
].join('|'), 'i');
export const asksForSolvedPiece = (prompt) => !/^\s*\//.test(prompt) && SOLVED_PIECE.test(prompt);
const LIBRARY_NUDGE = 'easyClaude: this asks for something free, open-source libraries already do ' +
  'well. Before writing it yourself, name one widely used library for it, with its licence and ' +
  'one line on why it fits, and ask the user before adding it. Prefer MIT, BSD or Apache-2.0, ' +
  'and nothing that needs a paid account.';

// The lines above are English, and a user who writes in Thai got English with them. In the
// Thai bug-fix task, two runs of three wrote English notes between steps ("Root cause
// found: ...", "no new Debt entry is needed"), where the rename task, with no line added,
// wrote none. Only for a message mostly in a script other than Latin: a line naming the
// user's language on English messages is what once got English requests Hungarian replies.
// Letters and marks both: Thai writes most vowels as marks, and letters alone undercounted
// "เปลี่ยนชื่อร้านจาก Plant Corner เป็น Green Corner" as mostly Latin. Even counted right,
// that line is half Latin, so the bar is under half: English has next to none of another script.
export const writesNonLatin = (prompt) => {
  const chars = prompt.match(/[\p{L}\p{M}]/gu) ?? [];
  const other = chars.filter((c) => !/[\p{Script=Latin}\p{Script=Inherited}]/u.test(c)).length;
  return chars.length > 0 && other >= 0.3 * chars.length;
};
const LANGUAGE_NUDGE = "Every note the user sees, between steps included, goes in the language of the user's " +
  'message, not in the language of these lines.';

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
    // In cheap mode too: an existing library is usually the smaller change.
    asksForSolvedPiece(prompt) ? LIBRARY_NUDGE : null,
  ].filter(Boolean);
  if (nudges.length && writesNonLatin(prompt)) nudges.push(LANGUAGE_NUDGE);
  const nudgeText = nudges.join('\n\n') || null;
  // Nothing left to say this session, so the transcript - which can run to megabytes - is
  // not read on every prompt.
  if (!cheap && alreadyAdvised(payload.session_id)) {
    // Once per conversation, not once per session. /clear and /compact keep the session, so
    // a user who took the advice never heard it again, however long the next stretch grew.
    // Only the end of the transcript is read: the last request's size is enough to see it
    // shrank.
    const advisedAt = advisedContext(payload.session_id);
    const now = payload.transcript_path ? lastContextTokens(payload.transcript_path) : null;
    if (!(advisedAt && now !== null && now < advisedAt / 2)) return say(nudgeText);
    forgetAdvice(payload.session_id);
  }

  const history = payload.transcript_path ? historyTokens(payload.transcript_path) : null;
  if (history === null) return say(nudgeText);
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
    markAdvised(payload.session_id, payload.transcript_path ? lastContextTokens(payload.transcript_path) : null);
  }

  say([nudgeText, context].filter(Boolean).join('\n\n'));
}

// Once per session: advice repeated on every prompt is noise, and costs tokens each time.
const adviceMemo = (session) =>
  join(tmpdir(), `easyclaude-advised-${createHash('sha256').update(String(session)).digest('hex').slice(0, 16)}`);
const alreadyAdvised = (session) => Boolean(session) && existsSync(adviceMemo(session));
const markAdvised = (session, context) => {
  if (!session) return;
  try { writeFileSync(adviceMemo(session), JSON.stringify({ context })); } catch { /* advice may repeat; nothing breaks */ }
};
const advisedContext = (session) => {
  try { return Number(JSON.parse(readFileSync(adviceMemo(session), 'utf8')).context) || null; } catch { return null; }
};
const forgetAdvice = (session) => rmSync(adviceMemo(session), { force: true });

// The size of the last main-thread request, from the end of the transcript only. A session
// file runs to megabytes, and this runs on every prompt once advice was given.
export function lastContextTokens(transcriptPath, tailBytes = 512 * 1024) {
  let fd;
  try {
    fd = openSync(transcriptPath, 'r');
    const size = fstatSync(fd).size;
    const len = Math.min(size, tailBytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"usage"')) continue;
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; }
      const u = entry?.message?.usage;
      if (entry.type !== 'assistant' || entry.isSidechain || !u) continue;
      return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}

// Run as the hook; imported by the tests for historyTokens.
if (process.argv[1]?.endsWith('prompt-check.mjs')) main();
