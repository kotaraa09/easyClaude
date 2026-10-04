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
// So a file counts only while git does not track it. A tracked one came with the code, not
// from the person at the keyboard, and it authorises nothing. Without git there is nothing
// to ask, and a file the user's own commands wrote is the normal case, so it counts.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const PERSONAL_FILES = ['.claude/autoship.json', '.claude/cheap-session', '.claude/cheap-contract.md'];

// git exits 0 only when the path is in the index: committed, or staged to be.
export function trackedByGit(root, rel, { spawn = spawnSync } = {}) {
  const r = spawn('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  return !r.error && r.status === 0;
}

// 'absent', 'tracked' (came with the repository, so it counts for nothing), or 'personal'.
// git is asked only when the file exists, so a project without these files pays nothing.
export function personalFile(root, rel, opts) {
  if (!existsSync(join(root, rel))) return 'absent';
  return trackedByGit(root, rel, opts) ? 'tracked' : 'personal';
}

// The note for Claude when any of them is tracked. Plain facts, and the one command that
// turns the file back into the user's own setting: --cached leaves it on disk.
export function trackedNotice(files) {
  if (!files.length) return null;
  return `These files are committed to this repository: ${files.join(', ')}. Each one holds one ` +
    "person's choice, so a copy that came with the code is not this user's choice. easyClaude " +
    'ignores them, and nothing they would switch on is on. In your first reply, tell the user ' +
    'in one plain sentence. If the user says the files are their own, `git rm --cached <file>` ' +
    'keeps each one on disk and makes it theirs again.';
}
