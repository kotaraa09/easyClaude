// Automatic shipping: the level the user chose, and the standing line that tells Claude to
// stop asking about it.
//
// /easyclaude:autoship off | commit | push | pr | merge writes .claude/autoship.json. Each
// level includes the ones before it. The point is the questions it removes: "should I
// commit?", "should I push?", "should I open a PR?" are one more message each, and every
// message re-sends the whole conversation. Until 1.1 it fired only from build-task, at the
// end of a feature recorded in docs/STATE.md, so a user who armed it and then just worked
// with Claude heard "autoship is on" every session and was still asked every time.
//
// So the session opener now sends the rule itself, every session and after a compaction,
// and it applies to any finished request, not only to a feature in the plan.
//
// Off, whatever the file says, when the folder is not a git repository: there is nothing to
// commit to. And off when git tracks the file; see personal.mjs.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const LEVELS = ['commit', 'push', 'pr', 'merge'];
export const AUTOSHIP_FILE = '.claude/autoship.json';

export function isGitRepo(root, { spawn = spawnSync } = {}) {
  const r = spawn('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8', timeout: 5_000 });
  return !r.error && r.status === 0 && String(r.stdout).trim() === 'true';
}

// The file as written, or null. "enabled" and "through" are the shape every release since
// 0.1 wrote, so an existing file keeps working.
export function readConfig(root) {
  try { return JSON.parse(readFileSync(join(root, AUTOSHIP_FILE), 'utf8')); } catch { return null; }
}

// The active level, or null. `kind` is personalFile()'s answer for the file, from the caller,
// which has usually asked git already.
export function activeLevel(config, { kind, git }) {
  if (!git || kind !== 'personal' || config?.enabled !== true) return null;
  const level = config.through ?? 'commit';
  return LEVELS.includes(level) ? level : null;
}

// What each level does, in the words the user is told.
const PLAIN = {
  commit: 'save each finished change as a version',
  push: 'save each finished change and upload it to the online copy of the project',
  pr: 'save each finished change, upload it to the online copy of the project, and open it for review',
  merge: 'save each finished change and add it to the main version once its checks pass',
};

export function standingLine(level, base = 'main', { compact = false } = {}) {
  const n = LEVELS.indexOf(level);
  const steps = [
    `commit it on a work branch (never on ${base} itself; reuse the branch for the same piece of work)`,
    n >= 1 ? 'push the branch' : null,
    n >= 2 ? `open a pull request against ${base} if the branch has none yet (a later push updates it)` : null,
    n >= 3 ? `wait for its checks, merge it, and update the local ${base}` : null,
  ].filter(Boolean);
  const list = steps.length > 1 ? `${steps.slice(0, -1).join(', ')}, then ${steps.at(-1)}` : steps[0];
  return `Autoship is set to "${level}" in this project. When you have finished what the user ` +
    `asked and the checks pass, ${list} - without asking. Never ask "should I commit?", ` +
    '"should I push?" or "should I open a pull request?" for a step this level covers: do it, ' +
    // In plain words: a user testing 1.1.2 found replies full of terms, and this line asked for
    // a branch name in every report.
    'and report it in one plain line the user understands: what happened to their work (saved, ' +
    'uploaded, open for review, or added to the main version), only what you confirmed' +
    (n >= 2 ? ', with the pull request link' : '') + '. Do not name the branch, ' +
    'commands or commit ids unless they ask. ' +
    (n >= 2 ? 'Before you open a pull request or merge, have the easyclaude-diff-reviewer ' +
      'subagent read the branch diff once, and fix what it finds. ' : '') +
    'Stop and ask instead when a check fails, when the change touches sign-in, payments or a ' +
    'database migration, or when the user said to wait.' +
    (n < LEVELS.length - 1 ? ` Steps past "${level}" still need the user's yes.` : '') +
    (compact ? '' : ' Add one plain line to your first reply: what you will now do without asking ' +
      `(${PLAIN[level]}), and that /easyclaude:autoship off turns it off.`);
}
