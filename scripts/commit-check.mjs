#!/usr/bin/env node
// The PreToolUse hook on Bash and PowerShell: stops a git commit that would save a secret.
//
//   node commit-check.mjs      the hook - reads hook JSON on stdin; exit 2 holds the command
//
// A key in a saved version is in every copy of the project from then on, and deleting it
// later does not take it back out of history. A beginner cannot spot one in a diff, and
// pushes to a public repository are how API keys get found and billed within minutes. The
// security-check skill finds them after the fact. This stops them before they are saved,
// and costs nothing on any command that is not a commit.
//
// Only the strong patterns from security-check, the ones a real key has and a test value
// almost never does. The loose "password = '...'" pattern cried wolf there, and a check
// that blocks working commits gets switched off. A line that carries the words
// "easyclaude: not a secret" is skipped, for a test value the user has confirmed.
//
// Fails open: if git cannot answer, the commit goes ahead. This is a net, not a gate.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { withLanguage } from './language.mjs';
import { readTurn } from './look-check.mjs';

export const SECRETS = [
  ['an AWS access key', /AKIA[0-9A-Z]{16}/],
  ['an Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['an OpenAI-style API key', /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['a GitHub token', /gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}/],
  ['a Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['a Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['a Replicate token', /r8_[A-Za-z0-9]{30,}/],
  ['a live Stripe key', /(?:sk|rk)_live_[A-Za-z0-9]{20,}/],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

// Files that hold secrets by their nature, whatever is in them.
const SECRET_FILE = /(^|\/)(\.env(\.(?!example$|sample$|template$|dist$)[^/]+)?|id_rsa|id_ed25519|[^/]+\.(pem|key|p12|pfx)|credentials\.json|service[-_]?account[^/]*\.json)$/i;
const ALLOWED = /easyclaude: not a secret/i;

// A commit, in any form Claude writes one: "git commit", "git -c x=y commit", or after
// "git add -A &&" in the same command.
export const isCommit = (cmd) => /\bgit\b[^;&|\n]*?\scommit\b/.test(String(cmd ?? ''));
// Whether the commit will also take changes that are not staged yet.
const takesUnstaged = (cmd) => /\bgit\s+add\b/.test(cmd) || /\scommit\b[^;&|\n]*\s(-[a-zA-Z]*a[a-zA-Z]*|--all)\b/.test(cmd);

const git = (root, args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 32 * 1024 * 1024 });
  return r.error || r.status !== 0 ? null : r.stdout;
};

// [{ file, line, text }] for every added line in a unified diff.
export function addedLines(diff) {
  const out = [];
  let file = null;
  let line = 0;
  for (const l of String(diff ?? '').split('\n')) {
    const f = l.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (f) { file = f[1] === '/dev/null' ? null : f[1]; continue; }
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (h) { line = Number(h[1]); continue; }
    if (l.startsWith('+') && file) { out.push({ file, line, text: l.slice(1) }); line++; }
    else if (!l.startsWith('-') && !l.startsWith('\\')) line++;
  }
  return out;
}

// Shows enough of a value to find it, and not enough to use it.
const masked = (s) => `${s.slice(0, 6)}... (${s.length} characters)`;

export function findSecrets(lines, files) {
  const hits = [];
  for (const f of files) if (SECRET_FILE.test(f)) hits.push(`${f} - a file that holds secrets by its nature`);
  for (const { file, line, text } of lines) {
    if (ALLOWED.test(text)) continue;
    for (const [kind, re] of SECRETS) {
      const m = text.match(re);
      if (m) { hits.push(`${file}:${line} - ${kind}, ${masked(m[0])}`); break; }
    }
  }
  return hits;
}

// What the commit would save: staged changes, and when the command also stages, every
// changed and new file that .gitignore does not exclude.
export function scan(root, cmd) {
  const staged = git(root, ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff']);
  if (staged === null) return [];
  let lines = addedLines(staged);
  let files = (git(root, ['diff', '--cached', '--name-only', '--diff-filter=AM']) ?? '').split('\n').filter(Boolean);
  if (takesUnstaged(cmd)) {
    lines = lines.concat(addedLines(git(root, ['diff', '-U0', '--no-color', '--no-ext-diff'])));
    const fresh = (git(root, ['ls-files', '--others', '--exclude-standard']) ?? '').split('\n').filter(Boolean);
    files = files.concat(fresh);
    for (const f of fresh) {
      try {
        if (statSync(join(root, f)).size > 1024 * 1024) continue;
        const text = readFileSync(join(root, f), 'utf8');
        if (text.includes('\0')) continue;
        text.split(/\r?\n/).forEach((t, i) => lines.push({ file: f, line: i + 1, text: t }));
      } catch { /* unreadable: skip it */ }
    }
  }
  return findSecrets(lines, [...new Set(files)]);
}

export const message = (hits) => 'easyClaude stopped this commit. It would save what looks like a ' +
  'secret, and a saved version keeps it for good: anyone who gets a copy of the project can ' +
  'read it, and deleting it later does not remove it from history.\n\n' +
  hits.map((h) => `- ${h}`).join('\n') + '\n\n' +
  'Do not commit it, and do not show the value. Tell the user in plain words which file it is ' +
  'in and why it must stay out of saved versions. Move the value into .env, which .gitignore ' +
  'keeps out, read it from there, and unstage any secret file (git restore --staged <file>). ' +
  'Then commit again. If the user says it is not a real secret - a test value or an example ' +
  '- add the comment "easyclaude: not a secret" on that line, and only after they say so. ' +
  'If it was already pushed anywhere, tell them to revoke the key with its provider.';

if (process.argv[1]?.endsWith('commit-check.mjs')) {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
  const cmd = payload.tool_input?.command ?? '';
  if (!isCommit(cmd)) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
  const hits = scan(root, cmd);
  if (!hits.length) process.exit(0);
  const userText = payload.transcript_path ? readTurn(payload.transcript_path)?.text : '';
  process.stderr.write(withLanguage(message(hits), userText));
  process.exit(2);
}
