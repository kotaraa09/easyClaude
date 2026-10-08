#!/usr/bin/env node
// The planning gate: no building until the user says "start building".
//
//   node plan-gate.mjs --answer   PostToolUse hook on AskUserQuestion: opens or closes it
//   node plan-gate.mjs --edit     PreToolUse hook on edits and shell commands: holds a build
//
// A user testing 1.1.2 in a new folder answered setup's questions for three replies and more.
// Then Claude decided it had enough and started building, while the user still thought the
// plan was unclear. kickoff and plan-feature both said "wait for the answers", and that is
// a line Claude weighs, not a rule it cannot pass. Who decides the questions are over was
// the fault: it was Claude. Now it is the user.
//
// Every round of questions goes through the question form, and every round ends with one
// question whose header is "Ready?" and whose first option means "start building". Picking
// that first option closes the gate. Any other answer opens it. A new folder opens it at
// the start of the session. While it is open, writes outside the planning notes and
// commands that create or install a project are held, with a reason that says to ask.
//
// The answer is matched by position, the first option, and not by its words, so a reply in
// Thai closes the gate as surely as one in English. A typed message can close it too, for a
// session where the form is not shown: only a short one that is plainly a go, from the user.
//
// Fails open: a payload it cannot read, or a temp folder it cannot write, holds nothing.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { locations } from './locations.mjs';

export const READY_HEADER = 'Ready?';
// An open gate older than this is forgotten: a folder someone left mid-plan last month is
// not still waiting for an answer.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const sha = (s) => createHash('sha256').update(s).digest('hex');
// One key for one folder, however a hook spells it: "D:\x" and "d:/x/" are the same place.
const key = (root) => {
  const r = resolve(String(root)).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? r.toLowerCase() : r;
};
const memoPath = (root) => join(tmpdir(), `easyclaude-plan-${sha(key(root)).slice(0, 16)}.json`);

// The memo as written, or null when there is none or it is too old.
const memo = (root, now) => {
  try {
    const m = JSON.parse(readFileSync(memoPath(root), 'utf8'));
    return now - Number(m?.at) < MAX_AGE_MS ? m : null;
  } catch { return null; }
};
const write = (root, m) => {
  try { writeFileSync(memoPath(root), JSON.stringify(m)); } catch { /* fails open */ }
};
export const isOpen = (root, now = Date.now()) => memo(root, now)?.open === true;
export const isSetup = (root, now = Date.now()) => Boolean(memo(root, now)?.setup);
// `setup`: opened for a new project, so the go is also the end of setup's questions.
// A later "not yet" keeps the flag of the gate it reopens.
export function open(root, { now = Date.now(), setup = false } = {}) {
  write(root, { open: true, at: now, setup: setup || isSetup(root, now) });
}
// Only where the user has not answered yet. A session started again in a folder that still
// has no code - a resume, or a /clear - must not take back the go they gave.
export function openForNewProject(root, now = Date.now()) {
  if (!memo(root, now)) open(root, { now, setup: true });
}
// Closed is written down, not deleted: see openForNewProject.
export function close(root, now = Date.now()) {
  write(root, { open: false, at: now, setup: false });
}

// The form's answers, as { question text: chosen label(s) }. The answers arrive in the
// tool's input once the user fills the form in; the result is read too, in case a
// version of Claude Code puts them only there.
function answersOf(payload) {
  const found = {};
  for (const src of [payload?.tool_response, payload?.tool_response?.data, payload?.tool_input]) {
    const a = src?.answers;
    if (a && typeof a === 'object' && !Array.isArray(a)) Object.assign(found, a);
  }
  return found;
}

// The answer to `question` in the result as text: "<question>"="<answer>". A quote inside
// either is escaped there, so both spellings are looked for and the answer is unescaped.
function answerInText(payload, question) {
  const text = typeof payload?.tool_response === 'string' ? payload.tool_response
    : JSON.stringify(payload?.tool_response ?? '');
  for (const q of [question, JSON.stringify(question).slice(1, -1)]) {
    const at = text.indexOf(q);
    if (at < 0) continue;
    const m = text.slice(at + q.length).match(/^\\?"?\s*[=:]\s*\\?"((?:\\.|[^"\\])*)/);
    if (m) return m[1].replace(/\\(.)/g, '$1');
  }
  return undefined;
}

// 'start' when the user picked the first option of the Ready? question, 'wait' when they
// answered it any other way, 'unread' when there was one and its answer could not be found,
// and null when the form had no Ready? question.
export function readyAnswer(payload) {
  const questions = payload?.tool_input?.questions;
  if (!Array.isArray(questions)) return null;
  const q = questions.find((x) => String(x?.header ?? '').trim().toLowerCase() === READY_HEADER.toLowerCase());
  if (!q) return null;
  const first = String(q.options?.[0]?.label ?? '').trim();
  let picked = answersOf(payload)[q.question];
  if (picked === undefined) picked = answerInText(payload, String(q.question));
  if (picked === undefined) return 'unread';
  // Not split on commas: "Yes, start building" is one label.
  const chosen = (Array.isArray(picked) ? picked : [picked]).map((s) => String(s).trim());
  return first && chosen.length === 1 && chosen[0] === first ? 'start' : 'wait';
}

// A short typed message that is plainly a go to build. Only from the user, through
// prompt-check.mjs. Not a bare "go" or "start": either can answer some other question.
const GO = /^\s*((ok(ay)?|yes|sure)[,!.]?\s+)*(please\s+)?(start building|start now|go ahead|build it|let['’]?s (start )?(build|building|go|start)|just build( it)?|เริ่มสร้าง|เริ่มได้|เริ่มเลย|ลุยเลย|สร้างเลย|ทำเลย)(\s*(now|please|it|เลย|ครับ|ครับผม|ค่ะ|คะ|นะ))*[.!]*\s*$/i;
export const isGo = (text) => GO.test(String(text ?? '')) && String(text).trim().split(/\s+/).length <= 6;

// Paths a plan may write while the gate is open: easyClaude's notes and settings.
export function isPlanningPath(root, file) {
  if (!file) return true;
  const abs = resolve(root, String(file));
  const rel = relative(root, abs).replace(/\\/g, '/');
  // Outside the project, or on another drive: not the build.
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('../')) return true;
  const notes = Object.values(locations(root)).map((n) => n.toLowerCase());
  const low = rel.toLowerCase();
  return /^(docs|design|\.claude)\//.test(low) ||
    ['claude.md', 'agents.md', '.gitignore'].includes(low) ||
    notes.includes(low) || notes.some((n) => n.endsWith('/') && low.startsWith(n));
}

// A shell command that starts the build: creating a project, or installing packages. A file
// written by a shell redirect is not caught; the hold's reason tells Claude not to try.
const BUILD_COMMAND = new RegExp([
  /\b(npm|pnpm|yarn|bun)\s+(create|init|i|install|ci|add)\b/.source,
  /\b(npx|bunx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec)\s+(-\S+\s+)*(create-|degit|nuxi|sv\s+create|@angular\/cli)/.source,
  /\bgit\s+clone\b/.source,
  /\b(cargo\s+(new|init|add)|go\s+mod\s+init|pip3?\s+install|uv\s+(init|add)|poetry\s+(new|init|add)|dotnet\s+new|flutter\s+create|rails\s+new|django-admin\s+startproject|composer\s+(create-project|require))\b/.source,
].join('|'), 'i');
// The gate's own file, so a command cannot clear it.
const TOUCHES_GATE = /easyclaude-plan/i;
export const isBuildCommand = (cmd) => BUILD_COMMAND.test(String(cmd ?? '')) || TOUCHES_GATE.test(String(cmd ?? ''));

export const HOLD = 'easyClaude held this: the user has not said to start building yet. You are ' +
  'still planning with them, and only they decide when the questions are over. Do not try ' +
  'another way to make this change. Ask what is still open with the AskUserQuestion form. ' +
  `End the form with a question whose header is exactly "${READY_HEADER}": ask whether the plan ` +
  'is clear enough to start building. Its first option means "yes, start building" and its ' +
  'second "not yet, I have more to say", both in the user\'s language. If the form cannot be ' +
  'shown, ask in chat: a short reply such as "start building" from the user opens the build. ' +
  'Planning notes under docs/ and .claude/ can still be written.';

export const SETUP_GO = 'easyClaude: the user said to start. Finish setup before you build: ' +
  'if no form in this setup asked about skills and kickoff step 7 finds one that fits, ask that ' +
  'one question in the form now. Then set the project up, and build what they asked.';

const UNREAD = 'easyClaude could not read the answer to the Ready? question, so the build is ' +
  'still held. If the user picked "start", tell them in one plain line to type "start building".';

function readPayload() {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return null; }
}
const context = (text) => process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
}));

if (process.argv[1]?.endsWith('plan-gate.mjs')) {
  const payload = readPayload();
  if (!payload) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  if (process.argv.includes('--answer')) {
    const a = readyAnswer(payload);
    if (a === 'wait') open(root);
    if (a === 'unread' && isOpen(root)) context(UNREAD);
    if (a === 'start') {
      const setup = isSetup(root);
      close(root);
      // Said at the moment it applies: the skill offer was the step setup skipped.
      if (setup) context(SETUP_GO);
    }
    process.exit(0);
  }
  if (process.argv.includes('--edit')) {
    // A helper agent works for the main conversation, so it is held the same way.
    if (!isOpen(root)) process.exit(0);
    const input = payload.tool_input ?? {};
    const shell = payload.tool_name === 'Bash' || payload.tool_name === 'PowerShell';
    let held = false;
    try {
      held = shell ? isBuildCommand(input.command)
        : !isPlanningPath(root, input.file_path ?? input.notebook_path);
    } catch { /* fails open */ }
    if (!held) process.exit(0);
    process.stderr.write(HOLD);
    process.exit(2);
  }
}
