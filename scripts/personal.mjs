// Files that hold one person's choice, and what to do when one arrives with the code.
//
// .claude/autoship.json lets a session commit, push and merge on one person's behalf.
// .claude/cheap-session and .claude/cheap-contract.md lower the standard of every turn, and
// the contract is read into every session as standing instructions. kickoff, autoship and
// cheap-session all add these to .gitignore, because committing one hands that person's
// choice to everyone who clones the repo. But .gitignore only stops an honest owner from
// committing them by accident. A repository can still ship them, and before this file every
// script that read them took them at their word: clone a repo with autoship.json in it, and
// the session was told it could push.
//
// So a file counts only while git says it does not track it. A tracked one came with the
// code, not from the person at the keyboard, and it authorises nothing. Without git, or
// outside a repository, there is nothing to ask, and a file the user's own commands wrote is
// the normal case, so it counts. Any other answer from git - a refused repository, a path
// behind a symbolic link, a timeout - is not a "no", and it authorises nothing either.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const PERSONAL_FILES = ['.claude/autoship.json', '.claude/cheap-session', '.claude/cheap-contract.md'];

// 'tracked', 'untracked', or 'unknown'. --error-unmatch exits 0 when the path is in the
// index and 1 when it is not; 128 is a fatal error, which is "unknown" unless the folder
// simply is not a repository. Five seconds, because prompt-check.mjs runs this inside a hook
// that Claude Code stops at ten.
export function gitTracks(root, rel, { spawn = spawnSync } = {}) {
  const r = spawn('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, encoding: 'utf8', timeout: 5_000 });
  if (r.error?.code === 'ENOENT') return 'untracked';
  if (r.error) return 'unknown';
  if (r.status === 0) return 'tracked';
  if (r.status === 1) return 'untracked';
  return /not a git repository/i.test(r.stderr ?? '') ? 'untracked' : 'unknown';
}

// 'absent', 'personal', or 'ignored' (tracked, or git could not say). git is asked only
// when the file exists, so a project without these files pays nothing.
export function personalFile(root, rel, opts) {
  if (!existsSync(join(root, rel))) return 'absent';
  return gitTracks(root, rel, opts) === 'untracked' ? 'personal' : 'ignored';
}

// Cheap mode is on only when the switch is this user's and the contract it runs under is
// not one the repository supplied. Every script asks here, so they cannot disagree.
export function cheapArmed(root, opts) {
  return personalFile(root, '.claude/cheap-session', opts) === 'personal' &&
    personalFile(root, '.claude/cheap-contract.md', opts) !== 'ignored';
}

// The note for Claude when any of them was ignored. Plain facts, and the one command that
// turns a file back into the user's own setting: --cached leaves it on disk.
export function ignoredNotice(files) {
  if (!files.length) return null;
  return `easyClaude ignored these files: ${files.join(', ')}. Each one holds one person's ` +
    'choice, and git tracks it, so it came with the code, or git could not say. Nothing they ' +
    'would switch on is on. In your first reply, tell the user in one plain sentence. If the ' +
    'user says the files are their own, `git rm --cached <file>` keeps each one on disk and ' +
    'makes it theirs again.';
}
