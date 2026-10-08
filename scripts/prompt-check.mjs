#!/usr/bin/env node
// The UserPromptSubmit hook: tells Claude when the conversation has grown long enough to
// cost more than the task in hand.
//
//   node prompt-check.mjs     the hook - reads hook JSON on stdin, prints hook JSON or nothing
//
// Every step of a turn re-reads the whole conversation. Measured on one small task, a
// fresh conversation cost $0.18 and a long one $1.25, and the reading alone was nine times
// more. easyClaude keeps the plan in docs/STATE.md and the opener reads it back, so a fresh
// conversation loses nothing - but only the user can type /clear or /compact. In cheap mode
// (/easyclaude:cheap, /easyclaude:cheap-session, or an armed cheap session) this hook
// measures the conversation from the session file, and in a long one tells Claude not to
// start the task and to ask for /clear or /compact first.
//
// The /clear reminder outside cheap mode is hooks/clear-reminder.ts: it holds the message
// with a note before it is sent, and costs no tokens. Until then this hook asked Claude to
// say it after the task, which cost tokens in a conversation that was already expensive.
//
// It prints nothing on every other prompt, so it costs no tokens there.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { markLater } from './later-memo.mjs';
import { writesNonLatin, withLanguage } from './language.mjs';
import { cheapArmed } from './personal.mjs';
import { locations } from './locations.mjs';
import { isGo, isOpen as planningOpen, isSetup, close as closePlanning, SETUP_GO } from './plan-gate.mjs';

// History, in tokens, beyond what the session's first request carried. That first request
// is Claude Code's own prompt, tools and project files - a floor no /clear removes - so it
// is subtracted rather than guessed, and a user with many MCP servers is not penalised.
export const CHEAP_LIMIT = 20_000;

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

// What the user typed, without what Claude Code wrapped around it. A helper's report, a
// background task's result and the harness's own reminders arrive through this same hook,
// inside these tags. On 2026-10-04 a code reviewer's report reached it as a prompt, and its
// words - "fails", "finish the rest" - told Claude that the user had reported a bug and
// asked for several tasks. The user had written neither. Every matcher below reads only
// what is left.
const WRAPPED = /<(system-reminder|task-notification|agent-message)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
export const userWords = (prompt) => String(prompt ?? '').replace(WRAPPED, ' ').trim();

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
  'พัง', 'ไม่ทำงาน', 'ใช้ไม่ได้', 'ใช้งานไม่ได้', 'บั๊ก', 'ผิดพลาด',
  // ค้าง is "it hangs", but also "still to do": งานที่ค้าง is the pending work, and asking
  // for it read as a bug report. Those two senses are told apart by the word before it.
  /(?<!งาน|ที่|เรื่อง)ค้าง(?!ไว้|คา)/.source,
].join('|'), 'i');
// An error the user asks to add or show is a feature, not one they hit: "add an error
// message when the email is empty" got the debug line. A sentence is dropped only when it
// opens with the request and the error follows within a few words, so "it shows an error
// when I pay" is still a bug report, and so are "Add to cart gives an error" and "Log in
// fails", where the verb is the name of a button. The whole sentence goes, because "show an
// error if the code is wrong" says "wrong" too. Thai has no sentence marks and drops the
// subject, so "แสดงข้อผิดพลาด..." may be "it shows an error"; only "add", "put" and "make it
// show" count there.
const ASKS_FOR_ERROR = new RegExp([
  /(?:^|[.!?\n])\s*(?:(?:also|and|then|please|let's|can you|could you|would you|i want you to|i'd like you to)\s+)*(?:add|show|display|create|write|handle|return|throw|raise|log)\s+(?:(?:a|an|the|some|any|more|better|clear|clearer|friendly|helpful|proper|nice|nicer|custom|inline|validation)\s+){0,3}errors?(?![a-z])[^.!?\n]*/.source,
  /^\s*(?:ช่วย|รบกวน)?\s*(?:เพิ่ม|ใส่|ให้แสดง|ทำให้แสดง)[^.!?\n]*?(?:errors?|ผิดพลาด)[^.!?\n]*/.source,
].join('|'), 'gi');
export const looksLikeBug = (prompt) => {
  const words = userWords(prompt);
  return !/^\s*\//.test(words) && BUG_REPORT.test(words.replace(ASKS_FOR_ERROR, ' '));
};
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
export const leavesWorkForLater = (prompt) => {
  const words = userWords(prompt);
  return !/^\s*\//.test(words) && LATER.test(words);
};
const laterNudge = (date, plan) => 'easyClaude: the user is leaving part of this for another ' +
  `session, and that session will not see this conversation - only ${plan} carries ` +
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
export const asksToFinishSeveral = (prompt) => {
  const words = userWords(prompt);
  return !/^\s*\//.test(words) && FINISH.test(words);
};
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
export const asksForSolvedPiece = (prompt) => {
  const words = userWords(prompt);
  return !/^\s*\//.test(words) && SOLVED_PIECE.test(words);
};
const LIBRARY_NUDGE = 'easyClaude: this asks for something free, open-source libraries already do ' +
  'well. Before writing it yourself, name one widely used library for it, with its licence and ' +
  'one line on why it fits, and ask the user before adding it. Prefer MIT, BSD or Apache-2.0, ' +
  'and nothing that needs a paid account.';

// The lines above are English. language.mjs adds the user's language to them; see there.
export { writesNonLatin };

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
  // Only what the user typed: see userWords. A message that was all wrapper came from a
  // helper or the harness, not the user, so nothing here applies to it - not even the
  // long-conversation advice, which would hold a cheap session's work on a report.
  const prompt = userWords(payload.prompt);
  if (!prompt && String(payload.prompt ?? '').trim()) return;
  // A plain "start building", typed: the user's own go, for a session that shows no form.
  // See plan-gate.mjs.
  // The go that ends setup brings back its skill offer, as the form's go does.
  let go = null;
  if (isGo(prompt) && planningOpen(root)) {
    go = isSetup(root) ? SETUP_GO : null;
    closePlanning(root);
  }
  // A cheap-session file that came with the repo is not this user's; see personal.mjs.
  const cheap = CHEAP_COMMAND.test(prompt) || cheapArmed(root);
  // Not in cheap mode: its contract asks for the smallest fix that works, and says so.
  // The plan file is docs/STATE.md unless the project moved it; see locations.mjs.
  const plan = locations(root).state;
  const later = leavesWorkForLater(prompt) && existsSync(join(root, plan));
  // The Stop hook holds the turn once if the plan file is still unchanged. See later-memo.mjs.
  if (later) markLater(root, payload.session_id);
  const nudges = [
    go,
    !cheap && looksLikeBug(prompt) ? BUG_NUDGE : null,
    // Only where there is a state file to write to. In cheap mode too: forgetting the rest
    // of the request is not a saving.
    later ? laterNudge(new Date().toLocaleDateString('en-CA'), plan) : null,
    // Not in cheap mode, which does one thing per turn on purpose.
    !cheap && asksToFinishSeveral(prompt) ? FINISH_NUDGE : null,
    // In cheap mode too: an existing library is usually the smaller change.
    asksForSolvedPiece(prompt) ? LIBRARY_NUDGE : null,
  ].filter(Boolean);
  const nudgeText = withLanguage(nudges.join('\n\n'), prompt) || null;
  // Outside cheap mode there is nothing to measure, so the transcript - which can run to
  // megabytes - is not read.
  if (!cheap) return say(nudgeText);
  const history = payload.transcript_path ? historyTokens(payload.transcript_path) : null;
  if (history === null) return say(nudgeText);
  const k = `about ${Math.round(history / 1000)}k tokens`;

  let context = null;
  if (history > CHEAP_LIMIT) {
    context = `easyClaude cheap mode: this conversation already holds ${k} of history, and every ` +
      'step re-reads all of it, so it now costs more than the cheap rules save. Do not start ' +
      'the task, and do not read or edit anything this turn. ' +
      (/^\s*\/easyclaude:cheap-session\b/.test(prompt)
        ? 'Arm the cheap session as the command says, then stop. '
        : '') +
      "In the user's language, tell them in two or three plain sentences: type /clear (their plan " +
      `is saved in ${plan}, and the next session opens with it) or /compact (keeps a short ` +
      'summary of this conversation), then send the same request again. Keep both commands exactly ' +
      'as written.';
  }

  say([nudgeText, context].filter(Boolean).join('\n\n'));
}

// Run as the hook; imported by the tests for historyTokens.
if (process.argv[1]?.endsWith('prompt-check.mjs')) main();
