#!/usr/bin/env node
// Runs the project's verify contract (.claude/verify.json).
//
// One source of truth, two callers:
//   node verify.mjs            people and skills - prints a table, exits 0 (pass) or 1 (fail)
//   node verify.mjs --hook     the Stop hook    - reads hook JSON on stdin, exits 0 or 2
//   node verify.mjs --list     print the contract without running anything
//
// This replaced a prompt-type Stop hook. That hook cost a model call on every
// source-touching turn, and it asked the model to confirm that its own tests had
// passed - the one claim it has the least standing to make. Exit codes cannot be
// talked out of a block.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const HOOK = args.includes('--hook');
const LIST = args.includes('--list');

// Read the hook payload first, since it carries the project root. Only when something
// is actually piped in - reading fd 0 from a terminal would sit there waiting for EOF.
let payload = {};
if (HOOK && !process.stdin.isTTY) {
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { /* not JSON, carry on */ }
}

// CLAUDE_PROJECT_DIR is set for hooks and is the most reliable; the payload's cwd is
// the fallback when it isn't; process.cwd() covers every non-hook caller.
const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
const CONFIG = join(root, '.claude', 'verify.json');

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LINES = 60;
const MAX_OUTPUT_CHARS = 4000;

// Changes that cannot break a build. If a turn touched nothing outside these, the
// contract is not worth the wall clock - and build-task rewrites docs/STATE.md on
// every single turn, so without this the gate would run the suite for a state edit.
// Deliberately narrow: `*.md` is root-level only, because markdown deeper in a tree
// is often content the build actually consumes. Override with "docsOnly".
const DEFAULT_DOCS_ONLY = [
  'docs/**', 'design/**', '.claude/**', '*.md', 'LICENSE', '.gitignore', '.env.example',
];

// --- glob --------------------------------------------------------------------
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else { re += '.*'; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}
const matchesAny = (p, patterns) => patterns.some((g) => globToRegExp(g).test(p));

// --- what changed ------------------------------------------------------------
// Returns an array of paths, or null when git cannot tell us (no repo, no git).
// null means "run the contract" - not knowing is not a reason to skip.
function changedPaths() {
  const r = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=normal'], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) return null;
  const records = r.stdout.split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    paths.push(rec.slice(3));
    // With -z, a rename or copy emits the source path as its own following record.
    if (rec[0] === 'R' || rec[0] === 'C') i++;
  }
  return paths;
}

// --- contract ----------------------------------------------------------------
function loadConfig() {
  if (!existsSync(CONFIG)) return null;
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG, 'utf8'));
  } catch (e) {
    return { error: `.claude/verify.json is not valid JSON - ${e.message}` };
  }
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  for (const s of steps) {
    if (!s || typeof s.cmd !== 'string' || !s.cmd.trim()) {
      return { error: '.claude/verify.json has a step with no "cmd"' };
    }
  }
  const fallback = Number(raw.timeoutMs) > 0 ? Number(raw.timeoutMs) : DEFAULT_TIMEOUT_MS;
  return {
    steps: steps.map((s, i) => ({
      name: s.name || `step ${i + 1}`,
      cmd: s.cmd,
      timeoutMs: Number(s.timeoutMs) > 0 ? Number(s.timeoutMs) : fallback,
    })),
    docsOnly: Array.isArray(raw.docsOnly) ? raw.docsOnly : DEFAULT_DOCS_ONLY,
  };
}

// --- running -----------------------------------------------------------------
// Three outcomes, not two. "The command is not installed" is a different fact from
// "the code is broken", and blocking the turn on it would wedge every session on a
// machine that is simply missing a toolchain.
const PASS = 'pass', FAIL = 'fail', UNRUNNABLE = 'unrunnable';

// Shells disagree on both the exit code and the wording for "that command does not
// exist" - cmd.exe returns 1 here as often as 9009 - so neither signal is enough
// alone. Requiring a short output as well keeps a real test failure that happens to
// print one of these phrases from being downgraded to a warning.
const NOT_FOUND = /(command not found|not recognized as (an internal|the name of)|:\s*not found\b)/i;
const looksUnrunnable = (status, output) =>
  status === 127 || status === 9009 ||
  (status !== 0 && NOT_FOUND.test(output) && output.split(/\r?\n/).filter((l) => l.trim()).length <= 3);

function runStep(step) {
  const started = Date.now();
  const r = spawnSync(step.cmd, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    timeout: step.timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    // CI=1 stops watch-mode runners (vitest, jest) sitting there until the timeout.
    // FORCE_COLOR=0 keeps ANSI escapes out of the text fed back to the model.
    env: { CI: '1', ...process.env, FORCE_COLOR: '0' },
  });
  const ms = Date.now() - started;
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();

  if (r.error?.code === 'ETIMEDOUT' || (r.error && r.signal)) {
    const secs = (step.timeoutMs / 1000).toFixed(step.timeoutMs % 1000 ? 1 : 0);
    return { ...step, ms, output, result: FAIL, why: `timed out after ${secs}s - fix the hang, or raise "timeoutMs"` };
  }
  if (r.error) {
    return { ...step, ms, output, result: UNRUNNABLE, why: r.error.message };
  }
  if (looksUnrunnable(r.status, output)) {
    return { ...step, ms, output, result: UNRUNNABLE, why: `command not found (exit ${r.status})` };
  }
  return {
    ...step, ms, output,
    result: r.status === 0 ? PASS : FAIL,
    why: `exit ${r.status}`,
  };
}

function tail(text) {
  if (!text) return '(no output)';
  let lines = text.split(/\r?\n/);
  let trimmed = false;
  if (lines.length > MAX_OUTPUT_LINES) { lines = lines.slice(-MAX_OUTPUT_LINES); trimmed = true; }
  let out = lines.join('\n');
  if (out.length > MAX_OUTPUT_CHARS) { out = out.slice(-MAX_OUTPUT_CHARS); trimmed = true; }
  return (trimmed ? `[trimmed to the last ${MAX_OUTPUT_LINES} lines]\n` : '') + out;
}

const skipRequested = /^(1|true|yes)$/i.test(process.env.EASYCLAUDE_SKIP_VERIFY ?? '');

// --- hook mode ---------------------------------------------------------------
// Exit 0 allows the stop. Exit 2 blocks it and hands stderr back to the model.
//
// Deliberately does NOT bail out on stop_hook_active. That guard exists because a
// prompt hook can block for a reason that never resolves; this one blocks only on a
// command that actually exited non-zero, so re-checking after a fix is the point.
// Claude Code's own consecutive-block cap is the backstop, and an unrunnable step
// warns instead of blocking - so neither failure mode wedges a session.
if (HOOK) {
  const allow = (systemMessage) => {
    if (systemMessage) process.stdout.write(JSON.stringify({ systemMessage }));
    process.exit(0);
  };

  if (skipRequested) allow();

  const cfg = loadConfig();
  if (!cfg) allow('No verify contract in this project - run the kickoff skill to add one.');
  if (cfg.error) allow(`easyClaude: ${cfg.error}`);
  if (!cfg.steps.length) allow('.claude/verify.json has no steps - nothing to verify against.');

  const changed = changedPaths();
  if (changed && (changed.length === 0 || changed.every((p) => matchesAny(p, cfg.docsOnly)))) {
    process.exit(0);
  }

  const results = cfg.steps.map(runStep);
  const failed = results.filter((r) => r.result === FAIL);
  const unrunnable = results.filter((r) => r.result === UNRUNNABLE);

  if (!failed.length) {
    allow(unrunnable.length
      ? `Verify step(s) could not run: ${unrunnable.map((r) => `${r.name} (${r.why})`).join(', ')}. ` +
        'Everything else passed. Fix the contract or install the toolchain.'
      : undefined);
  }

  const report = [
    `Verification failed. ${failed.length} of ${results.length} step(s) in .claude/verify.json did not pass.`,
    '',
    ...failed.map((r) => [
      `[${r.name}] ${r.cmd} - ${r.why}`,
      tail(r.output),
      '',
    ].join('\n')),
    `Fix the cause and re-run: node "${process.argv[1]}"`,
    'Do not describe this work as done, working, or complete while a step fails.',
    'If the cause is not obvious, use the debug skill rather than trying edits until one sticks.',
    'If it genuinely cannot pass here, say exactly what is failing and what you tried, and stop.',
  ].join('\n');

  process.stderr.write(report);
  process.exit(2);
}

// --- human mode --------------------------------------------------------------
const cfg = loadConfig();
if (!cfg) {
  console.log('No .claude/verify.json in this project.');
  console.log('Run the kickoff skill to establish a verify contract.');
  process.exit(0);
}
if (cfg.error) {
  console.log(`  ERROR  ${cfg.error}`);
  process.exit(1);
}
if (!cfg.steps.length) {
  console.log('.claude/verify.json has no steps - nothing to verify against.');
  process.exit(0);
}

const width = Math.max(...cfg.steps.map((s) => s.name.length));
const pad = (s) => s.padEnd(width);

if (LIST) {
  console.log(`verify contract - ${cfg.steps.length} step(s)\n`);
  for (const s of cfg.steps) console.log(`  ${pad(s.name)}  ${s.cmd}`);
  process.exit(0);
}

console.log(`verify contract - ${cfg.steps.length} step(s)\n`);
const results = [];
for (const step of cfg.steps) {
  const r = runStep(step);
  results.push(r);
  const mark = r.result === PASS ? 'ok  ' : r.result === UNRUNNABLE ? 'skip' : 'FAIL';
  const note = r.result === PASS ? '' : `  ${r.why}`;
  console.log(`  ${mark}  ${pad(r.name)}  ${r.cmd}  (${(r.ms / 1000).toFixed(1)}s)${note}`);
}

const failed = results.filter((r) => r.result === FAIL);
const unrunnable = results.filter((r) => r.result === UNRUNNABLE);

for (const r of failed) {
  console.log(`\n--- ${r.name} ---\n${tail(r.output)}`);
}
for (const r of unrunnable) {
  console.log(`\n${r.name}: could not run - ${r.why}. Install it, or take the step out of the contract.`);
}

console.log(failed.length
  ? `\nFAIL - ${failed.length} of ${results.length} step(s) failed`
  : `\nOK - ${results.length - unrunnable.length} of ${results.length} step(s) passed` +
    (unrunnable.length ? `, ${unrunnable.length} could not run` : ''));

process.exit(failed.length ? 1 : 0);
