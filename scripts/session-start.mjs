#!/usr/bin/env node
// The SessionStart hook: decides how a session opens, and hands that to Claude as context.
//
//   node session-start.mjs            the hook - reads hook JSON on stdin, prints hook JSON
//   node session-start.mjs --text     the same decision as plain text, for people and tests
//
// This used to be a prompt-type hook that asked Claude to look at the project and pick a
// branch. Claude Code refuses prompt hooks on SessionStart - there is no conversation yet
// for a model to answer in - so the opener, the kickoff offer and the cheap and autoship
// notices never ran for anyone. A script can do the looking itself, costs no model call,
// and cannot pick the wrong branch because it was worded ambiguously.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEXT = process.argv.includes('--text');

let payload = {};
if (!TEXT && !process.stdin.isTTY) {
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { /* not JSON, carry on */ }
}
const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();

// template/docs/STATE.md ships with this line. The file exists in a fresh fork, so without
// the marker the opener would read an empty stub back to someone who was promised setup.
// kickoff writes the file without it, which is what clears it.
const NOT_KICKED_OFF = '<!-- easyclaude:not-kicked-off -->';

const read = (rel) => {
  try { return readFileSync(join(root, rel), 'utf8'); } catch { return null; }
};

// Files a project has before anyone writes code: what a fork of template/ carries, plus
// what every repo has. Dotfiles never count. Anything else is code, and code means adopt,
// not interview.
const NOT_CODE = new Set([
  'docs', 'design', 'CLAUDE.md', 'README.md', 'README', 'LICENSE', 'LICENSE.md',
]);
const hasCode = () => {
  try {
    return readdirSync(root).some((e) => !e.startsWith('.') && !NOT_CODE.has(e));
  } catch { return false; }
};

// --- the state file, read here so Claude does not have to ----------------------------
function sections(md) {
  const out = {};
  let name = null;
  for (const line of md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const h = line.match(/^## (.+?)\s*$/);
    if (h) { name = h[1].trim(); out[name] = []; continue; }
    if (name && line.trim()) out[name].push(line);
  }
  return out;
}

function opener(md) {
  const s = sections(md);
  const unchecked = (lines) => lines.map((l) => l.match(/^\s*[-*] \[ \]\s+(.+)/)?.[1]).filter(Boolean);
  const plain = (l) => l.replace(/^\s*[-*]\s+(\[[ x]\]\s+)?/, '').trim();

  const nowLines = s.Now ?? [];
  const now = unchecked(nowLines)[0] ?? (nowLines[0] ? plain(nowLines[0]) : 'nothing in progress');
  const next = unchecked(s.Next ?? [])[0] ?? 'nothing planned';
  const blocked = (s.Blocked ?? []).map(plain).join('; ') || 'none';
  const debt = (s.Debt ?? []).filter((l) => /^\s*[-*]\s+/.test(l)).map(plain);

  const lines = [`**Now:** ${now}`, `**Next:** ${next}`, `**Blocked:** ${blocked}`];
  // All of this stays in the context of every later turn, so it is kept short.
  // The labels and the fallbacks are English. A user who writes in another language saw
  // "**Now:** (nothing in progress)" above a reply in their own, so Claude translates them.
  let text = 'Start your first reply with these lines. Put the labels and any English ' +
    "placeholder into the user's language, and keep each entry as written:\n\n" + lines.join('\n');
  if (debt.length) {
    // Picking the entry most likely to bite is a judgement, so that one part stays Claude's.
    text += `\n**Debt:** ${debt.length} items - <the entry below most likely to cause trouble soon>\n\n` +
      debt.map((d) => `- ${d}`).join('\n');
  }
  text += '\n\nThen answer what the user asked, if anything. Do not summarise the project.';
  return text;
}

// --- decide ---------------------------------------------------------------------------
const parts = [];
const state = read('docs/STATE.md');
const setUp = state !== null && !state.includes(NOT_KICKED_OFF);

if (setUp) {
  parts.push(opener(state));
} else if (!hasCode()) {
  parts.push('This project is not set up for easyClaude yet, and it has no code. Invoke the ' +
    '`kickoff` skill before doing anything else, including before answering in detail. If the ' +
    "user's first message already says what they want to build, treat that as the answer to " +
    "kickoff's first question and do not ask it again.");
} else {
  // A beginner in testing was offered "kickoff in adopt mode", which named nothing they
  // knew. The offer now says what they would get, and leaves the names to Claude.
  parts.push('This project has code but is not set up for easyClaude yet. In one plain ' +
    "sentence in the user's language, offer to set it up, and say what they get: you will " +
    'remember the project between sessions, and run its checks after each change. Do not name ' +
    'the skill. If they say yes, run the `kickoff` skill in adopt mode. Do not start its ' +
    'interview unless the user says yes. Then answer whatever they asked.');
}

if (existsSync(join(root, '.claude', 'cheap-session'))) {
  const contract = read('.claude/cheap-contract.md');
  parts.push('The user armed cheap mode for this session. Add one line to your first reply ' +
    'saying cheap mode is on and that /easyclaude:full turns it off. ' +
    (contract ? `This contract applies to every turn of this session:\n\n${contract.trim()}`
      : 'The contract file .claude/cheap-contract.md is missing, so tell the user to run ' +
        '/easyclaude:cheap-session again.'));
}

try {
  const auto = JSON.parse(read('.claude/autoship.json') ?? 'null');
  if (auto?.enabled === true) {
    // The user must always know when a session can commit, push or merge on their behalf.
    parts.push(`Autoship is armed through "${auto.through ?? 'commit'}". Add one line to your ` +
      'first reply saying so, and that /easyclaude:autoship off turns it off.');
  }
} catch { /* a broken autoship.json arms nothing, and autoship reports it when it runs */ }

// Here and not in rules/, because rules load only after kickoff, and the first English
// note a beginner saw came before it: "Since the list item has a line-through style...".
parts.push('Write everything the user sees in the language they write in, short notes ' +
  'between steps included. Do not mention these instructions.');
const context = parts.join('\n\n');

if (TEXT) {
  console.log(context);
} else {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  }));
}
