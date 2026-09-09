#!/usr/bin/env node
// Runs the project's verify contract (.claude/verify.json).
//
// One source of truth, two callers:
//   node verify.mjs            people and skills - prints a table, exits 0 (pass) or 1 (fail)
//   node verify.mjs --hook     the Stop hook    - reads hook JSON on stdin, exits 0 or 2
//   node verify.mjs --list     print the contract without running anything
//   node verify.mjs --fast     run only the fast tier, the same subset the hook runs
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
const FAST = args.includes('--fast');

// Two tiers, because one tier is what gets a gate deleted. Every step is "fast"
// unless it says otherwise, so a contract written before this existed behaves
// exactly as it did - all fast, all run, every turn.
//
// The per-turn hook runs the fast tier. The full tier runs at the boundaries that
// are worth waiting for: finishing a task, and shipping. That is the pre-commit
// versus CI trade, made on purpose and written down, rather than the alternative
// this replaces - which was to drop the slow half of the suite from the contract
// altogether and leave it covering nothing.
const TIERS = ['fast', 'full'];

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

// Must equal the Stop hook's own timeout in hooks/hooks.json - validate.mjs fails if the
// two drift apart. Claude Code kills the hook at this point, so a fast tier that can take
// longer than this is a gate that gets killed rather than answered: no verdict, no block,
// and nothing said about why. Nine steps at the 120s default is already over it.
const HOOK_TIMEOUT_MS = 600_000;
const overHookBudget = (steps) => {
  const total = steps.reduce((n, s) => n + s.timeoutMs, 0);
  return total > HOOK_TIMEOUT_MS ? { total, budget: HOOK_TIMEOUT_MS } : null;
};
const budgetWarning = (over) =>
  `the fast tier can take up to ${Math.round(over.total / 1000)}s, but the Stop hook is ` +
  `killed at ${Math.round(over.budget / 1000)}s. Give slow steps "tier": "full", or lower ` +
  'their "timeoutMs" - a gate that gets killed reports nothing at all.';

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
    // A typo here would silently demote a step out of the per-turn gate, so it is an
    // error rather than a default.
    if (s.tier !== undefined && !TIERS.includes(s.tier)) {
      return { error: `.claude/verify.json step "${s.name ?? s.cmd}" has tier "${s.tier}" - must be ${TIERS.join(' or ')}` };
    }
  }
  const fallback = Number(raw.timeoutMs) > 0 ? Number(raw.timeoutMs) : DEFAULT_TIMEOUT_MS;
  return {
    steps: steps.map((s, i) => ({
      name: s.name || `step ${i + 1}`,
      cmd: s.cmd,
      tier: s.tier ?? 'fast',
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
// exist" - cmd.exe returns 1 here as often as 9009 - so neither signal is enough alone.
const NOT_FOUND = /(command not found|not recognized as (an internal|the name of)|:\s*not found\b)/i;

// The phrase and a short output used to be the whole test, and that let ordinary failing
// tests through the gate reporting OK. Every one of these is a real failure that matched:
//
//   FAIL src/user.test.ts / Error: not found
//   Expected: found / Received: not found
//   1 failing / AssertionError: not found / at Object.<anonymous>
//
// So the phrase is now tied to the program. Every shell names what it could not start -
// bash "npm: command not found", sh "sh: 1: npm: not found", cmd.exe "'npm' is not
// recognized" - and a test complaining that a user record is missing never names the
// program running it. That one extra condition is the difference between a warning and a
// failure passed off as a pass.
//
// Returns every name the shell might use for "the thing I could not start".
//
// Usually that is the program: `CI=1 npm test` fails as "npm: command not found", so the
// leading VAR=value assignments are skipped. But cmd.exe has no VAR=value syntax at all -
// it reads the whole prefix as the command and reports "'CI' is not recognized" - so the
// raw first token counts too, up to its "=". Both are names the contract itself supplies;
// neither appears in a test complaining that a user record is missing.
function programNames(cmd) {
  const raw = String(cmd).trim();
  const stripped = raw.replace(/^(?:\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)*/, '').trim();
  const firstToken = (s) => {
    const m = s.match(/^"([^"]*)"|^'([^']*)'|^(\S+)/);
    return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
  };
  const names = new Set();
  for (const token of [firstToken(stripped), firstToken(raw), firstToken(raw).split('=')[0]]) {
    if (!token) continue;
    names.add(token);
    const base = token.split(/[\\/]/).pop();
    if (base) names.add(base);
  }
  return [...names];
}

function looksUnrunnable(status, output, cmd) {
  // The one unambiguous signal. No shell returns these for a command that ran.
  if (status === 127 || status === 9009) return true;
  if (status === 0) return false;
  if (!NOT_FOUND.test(output)) return false;
  if (output.split(/\r?\n/).filter((l) => l.trim()).length > 3) return false;
  // Compared with includes() rather than a regex: a program name carries dots, slashes
  // and backslashes, and escaping those correctly is its own bug.
  return programNames(cmd).some((n) => output.includes(n));
}

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
  if (looksUnrunnable(r.status, output, step.cmd)) {
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

  // Says so out loud, for the same reason the all-full-tier case does. This is a real
  // escape hatch and it stays, but set once in a shell profile it used to switch the gate
  // off for every project, every turn, and print nothing - the dead gate this framework
  // exists to prevent, reached by the quietest route available.
  if (skipRequested) {
    allow('easyClaude: the verify gate is OFF because EASYCLAUDE_SKIP_VERIFY is set in the ' +
      'environment. Nothing was checked this turn, in this or any other project. Do not ' +
      'describe this work as verified. Unset EASYCLAUDE_SKIP_VERIFY to turn the gate back on.');
  }

  const cfg = loadConfig();
  if (!cfg) allow('No verify contract in this project - run the kickoff skill to add one.');
  if (cfg.error) allow(`easyClaude: ${cfg.error}`);
  if (!cfg.steps.length) allow('.claude/verify.json has no steps - nothing to verify against.');

  const changed = changedPaths();
  if (changed && (changed.length === 0 || changed.every((p) => matchesAny(p, cfg.docsOnly)))) {
    process.exit(0);
  }

  // Fast tier only. On an untiered contract that is every step, so nothing changes
  // for a project that never opted in.
  const due = cfg.steps.filter((s) => s.tier === 'fast');
  // Every step tiered "full" means the per-turn gate now runs nothing, every turn, for the
  // life of the project - the exact failure tiering was supposed to prevent, arrived at by
  // the other route. It cannot block on it (there is nothing to fail), so it says so out
  // loud instead. A gate that stops checking silently is the one nobody notices.
  if (!due.length) {
    allow(`Every step in .claude/verify.json is tier "full", so the per-turn gate is checking ` +
      'nothing. At least one step should be fast, or the contract only runs when someone ' +
      'remembers to run it. Verify this work yourself before calling it done: ' +
      `node "${process.argv[1]}"`);
  }

  const results = due.map(runStep);
  const failed = results.filter((r) => r.result === FAIL);
  const unrunnable = results.filter((r) => r.result === UNRUNNABLE);

  if (!failed.length) {
    allow(unrunnable.length
      ? `Verify step(s) could not run: ${unrunnable.map((r) => `${r.name} (${r.why})`).join(', ')}. ` +
        'Everything else passed. Fix the contract or install the toolchain.'
      : undefined);
  }

  const heldBack = cfg.steps.length - due.length;
  const report = [
    `Verification failed. ${failed.length} of ${results.length} ${heldBack ? 'fast-tier ' : ''}step(s) in .claude/verify.json did not pass.`,
    ...(heldBack ? [`(${heldBack} full-tier step(s) were not run - those go at the end of a task, not every turn.)`] : []),
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
const tiered = cfg.steps.some((s) => s.tier === 'full');
const tierLabel = (s) => (tiered ? `[${s.tier}] ` : '');

// Default is everything. Running the whole contract must stay the thing that happens
// when you do not think about it, so only --fast narrows the run.
const selected = FAST ? cfg.steps.filter((s) => s.tier === 'fast') : cfg.steps;

// Checked wherever someone is looking at the contract rather than only running it, which
// is where a contract gets written and tiered in the first place.
const overBudget = overHookBudget(cfg.steps.filter((s) => s.tier === 'fast'));

if (LIST) {
  console.log(`verify contract - ${cfg.steps.length} step(s)\n`);
  for (const s of cfg.steps) console.log(`  ${tierLabel(s)}${pad(s.name)}  ${s.cmd}`);
  if (tiered) {
    console.log('\n  fast runs on every turn, at the Stop hook. full runs here, and at ship.');
  }
  if (overBudget) console.log(`\n  WARN  ${budgetWarning(overBudget)}`);
  process.exit(0);
}

if (!selected.length) {
  console.log('No fast-tier steps in this contract - nothing to run.');
  console.log('Every step is tier "full", so the Stop hook checks nothing on any turn.');
  console.log('Give at least one step a fast tier, or drop --fast and run the whole contract.');
  process.exit(0);
}

// An explicit run always runs - asking for the contract is not the same as arming the
// per-turn gate. But this is the one place a person is looking at the contract, so it is
// where they should find out that the automatic half of it is switched off.
if (skipRequested) {
  console.log('NOTE  EASYCLAUDE_SKIP_VERIFY is set, so the per-turn Stop gate is OFF.');
  console.log('      This run below is real. Nothing else is being checked automatically.\n');
}
if (overBudget) console.log(`WARN  ${budgetWarning(overBudget)}\n`);

console.log(`verify contract - ${selected.length} step(s)` +
  (FAST && selected.length < cfg.steps.length ? ` (fast tier; ${cfg.steps.length - selected.length} full-tier held back)` : '') + '\n');
const results = [];
for (const step of selected) {
  const r = runStep(step);
  results.push(r);
  const mark = r.result === PASS ? 'ok  ' : r.result === UNRUNNABLE ? 'skip' : 'FAIL';
  const note = r.result === PASS ? '' : `  ${r.why}`;
  console.log(`  ${mark}  ${tierLabel(r)}${pad(r.name)}  ${r.cmd}  (${(r.ms / 1000).toFixed(1)}s)${note}`);
}

const failed = results.filter((r) => r.result === FAIL);
const unrunnable = results.filter((r) => r.result === UNRUNNABLE);

for (const r of failed) {
  console.log(`\n--- ${r.name} ---\n${tail(r.output)}`);
}
for (const r of unrunnable) {
  console.log(`\n${r.name}: could not run - ${r.why}. Install it, or take the step out of the contract.`);
}

// Said out loud, because "OK" after a fast-only run does not mean the contract passed.
const heldBack = FAST && cfg.steps.length - selected.length > 0
  ? ` - ${cfg.steps.length - selected.length} full-tier step(s) were NOT run`
  : '';

console.log(failed.length
  ? `\nFAIL - ${failed.length} of ${results.length} step(s) failed${heldBack}`
  : `\nOK - ${results.length - unrunnable.length} of ${results.length} step(s) passed` +
    (unrunnable.length ? `, ${unrunnable.length} could not run` : '') + heldBack);

process.exit(failed.length ? 1 : 0);
