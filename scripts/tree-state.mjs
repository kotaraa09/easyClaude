// What the working tree looks like, and what the gate last saw of it.
//
// The gate should judge a turn by what that turn changed. It used to judge the tree: a
// project with broken edits from before the session got its tests run and failed at the
// end of every turn, including a turn where Claude only asked the user a question. In a
// rescue test, the reply the user saw last was about those tests, and Claude's plan sat
// one message above it.
//
// So session-start.mjs records the tree when a session opens, verify.mjs records it at
// every check, and a Stop that finds the tree as it was last recorded skips the check -
// that turn changed nothing. Without git there is no cheap way to tell, so the gate runs
// every time, as it did before.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');

// Everything that differs from HEAD: tracked edits by content, untracked files by size
// and time. null without git, or outside a repository.
export function treeFingerprint(root) {
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const diff = git(['diff', 'HEAD', '--no-ext-diff']);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']);
  if (diff.error || diff.status !== 0 || untracked.error || untracked.status !== 0) return null;
  const files = untracked.stdout.split('\0').filter(Boolean).map((p) => {
    try { const s = statSync(join(root, p)); return `${p}:${s.size}:${s.mtimeMs}`; } catch { return p; }
  });
  return sha(`${diff.stdout}\n${files.join('\n')}`);
}

// One small file per project, outside it, so nothing lands in the user's repository.
const memoPath = (root) => join(tmpdir(), `easyclaude-gate-${sha(root).slice(0, 16)}.json`);

// { session, tree, failed } - failed is the step names that failed at that check, or [].
export function lastSeen(root) {
  try { return JSON.parse(readFileSync(memoPath(root), 'utf8')); } catch { return null; }
}

export function remember(root, entry) {
  // An unwritable temp dir means the gate checks every turn, as before - never that it
  // stops checking.
  try { writeFileSync(memoPath(root), JSON.stringify(entry)); } catch { /* see above */ }
}
