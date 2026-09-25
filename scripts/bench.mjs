#!/usr/bin/env node
// The outcome benchmark: does a beginner get working software more often with easyClaude
// than without it?
//
//   node scripts/bench.mjs                   run both arms, print the table, save the result
//   node scripts/bench.mjs --with-only       run only the easyClaude arm (reuses no baseline)
//   node scripts/bench.mjs --fresh-baseline  re-run the no-easyClaude arm even if cached
//   node scripts/bench.mjs --runs 1          quick look while iterating - not for publishing
//   node scripts/bench.mjs --case 'outcome-fix*' --model claude-opus-5-5 --max-cost-usd 5
//
// The trigger suite in evals/ proves which skill answers a sentence. It cannot say whether
// the answer helped: on four of seven cases, Claude without the plugin scored the same.
// This asks the question a beginner cares about, with four tasks in their words, and grades
// what is left on disk, not what the reply says.
//
// How it is kept cheap, since it costs money or plan usage on every run:
//   - No judge model. Every check is a hidden test or a pattern over a file, so grading is
//     free and gives the same verdict every time.
//   - Sonnet by default, not the session's model. Half the price, and the question is the
//     difference between the arms, which a pinned model keeps fair.
//   - The no-easyClaude arm does not change when easyClaude does. It is cached under a key
//     of the Claude Code version, the model, the run count and the case files, and re-run
//     only when one of those changes. After the first run, each run costs one arm.
//   - Small tasks in a small project, a turn cap on each, and a --max-cost-usd ceiling.
//
// How the arms differ: the easyClaude arm runs in the sample project as kickoff leaves it,
// with the plugin loaded. The other runs the same code and git history with no docs/,
// no CLAUDE.md and no .claude/, and no plugin. See evals/_fixture/setup.sh.
//
// Grading runs code Claude wrote. It runs on a copy with no .git, under Node's permission
// model: it may read the copy and nothing else, may not write, and may not start a
// process. The runner's work folders are deleted once graded.
//
// On native Windows the runner refuses to grant a shell, because it has no sandbox there,
// so neither arm can run commands. easyClaude's verify gate still runs its tests, because
// it is a hook and not a tool. That favours easyClaude, and the result says so. Run under
// Linux or WSL2 with --shell for the fair figure.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, cpSync, readdirSync, statSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTCOMES = join(root, 'evals', 'outcomes');
const RESULTS = join(root, 'evals', 'results');
const BASELINE_CACHE = join(RESULTS, 'outcome-baseline.json');

// --- grading --------------------------------------------------------------------------

function walkFiles(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules' || entry === '.bench') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkFiles(p, base, out);
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

const copyWithoutGit = (from, to) => cpSync(from, to, {
  recursive: true,
  filter: (src) => !relative(from, src).split(/[\\/]/).some((p) => p === '.git' || p === 'node_modules'),
});

// 'tests/**' matches everything under tests/; anything else is an exact path.
const matchesGlob = (file, glob) =>
  glob.endsWith('/**') ? file.startsWith(glob.slice(0, -2)) : file === glob;

const isTestFile = (f) => /(^|\/)[^/]*\.test\.[cm]?js$/.test(f) || /(^|\/)test\/[^/]+\.[cm]?js$/.test(f);

const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
const ISOLATION = NODE_MAJOR >= 23 ? '--test-isolation=none' : '--experimental-test-isolation=none';

// Runs test files inside `dir` with read access to `dir` only. In-process isolation,
// because the permission model forbids the child processes the default runner starts.
// Paths go in relative: the runner globs each one, and an absolute path makes it stat
// the drive root, which the permission model refuses.
function runTests(dir, files) {
  const r = spawnSync(process.execPath, [
    '--permission', `--allow-fs-read=${dir}`, ISOLATION, '--test',
    ...files.map((f) => relative(dir, f).split(sep).join('/')),
  ], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { passed: r.status === 0, out: out.split('\n').filter((l) => /^(not ok|# (pass|fail))/.test(l)).join('; ') };
}

// Grades one workspace against one case's check.mjs. Returns [{ name, passed, why }].
// The workspace is copied first, without .git: the runner warns that a kept folder is
// agent-written, and nothing here should run git or load configuration from inside it.
export async function gradeWorkspace(caseDir, workspace) {
  const checks = (await import(pathToFileURL(join(caseDir, 'check.mjs')).href)).default;
  const copy = mkdtempSync(join(tmpdir(), 'easyclaude-grade-'));
  try {
    copyWithoutGit(workspace, copy);
    const files = walkFiles(copy);
    const results = [];
    for (const c of checks) {
      if (c.hidden) {
        mkdirSync(join(copy, '.bench'), { recursive: true });
        const target = join(copy, '.bench', basename(c.hidden));
        cpSync(join(caseDir, c.hidden), target);
        const r = runTests(copy, [target]);
        results.push({ name: c.name, passed: r.passed, why: r.out });
      } else if (c.ownTests) {
        const tests = files.filter(isTestFile);
        if (!tests.length) { results.push({ name: c.name, passed: false, why: 'no test files left' }); continue; }
        const r = runTests(copy, tests.map((f) => join(copy, f)));
        results.push({ name: c.name, passed: r.passed, why: r.out });
      } else if (c.catches) {
        // The project's tests, run against the file as it was before Claude touched it. A
        // test that covers the bug fails there. Reading test code for the right call shape
        // was tried first and missed ordinary tests, like a call nested inside another.
        const tests = files.filter(isTestFile);
        const before = mkdtempSync(join(tmpdir(), 'easyclaude-grade-'));
        try {
          cpSync(copy, before, { recursive: true });
          cpSync(join(root, 'evals', '_fixture', 'project', c.catches), join(before, c.catches));
          const r = tests.length ? runTests(before, tests.map((f) => join(before, f))) : { passed: true };
          results.push({ name: c.name, passed: !r.passed, why: `the tests pass against the old ${c.catches}` });
        } finally {
          rmSync(before, { recursive: true, force: true });
        }
      } else if (c.contains) {
        const hits = files.filter((f) => matchesGlob(f, c.contains))
          .some((f) => c.pattern.test(readFileSync(join(copy, f), 'utf8')));
        results.push({ name: c.name, passed: c.absent ? !hits : hits, why: `${c.pattern} in ${c.contains}` });
      } else {
        throw new Error(`${basename(caseDir)}/check.mjs: "${c.name}" has no hidden, ownTests, catches or contains`);
      }
    }
    return results;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

// --- running --------------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(name);

// shell on Windows, where an npm install puts `claude` on PATH as a .cmd shim that
// spawnSync cannot start directly. Every argument is quoted, so a model name or a glob
// passes through cmd.exe unchanged.
function claude(args, opts = {}) {
  const win = process.platform === 'win32';
  const quoted = win ? args.map((a) => `"${String(a).replace(/"/g, '')}"`) : args;
  return spawnSync('claude', quoted, { encoding: 'utf8', shell: win, maxBuffer: 256 * 1024 * 1024, ...opts });
}

function hashTree(dir, h) {
  for (const f of walkFiles(dir).filter((f) => !f.startsWith('results/')).sort()) {
    h.update(f);
    h.update(readFileSync(join(dir, f)));
  }
}

// Every task is asked in English, so the reply must be English. The first full run found a
// third of easyClaude's replies in Hungarian, Slovak or Spanish, and no check noticed,
// because every check looked at files. A beginner who cannot read the answer did not get
// one. Common English words make up a fifth or more of English prose and almost none of
// those languages; "a" is left out because Hungarian uses it too.
const ENGLISH = new Set(['the', 'and', 'to', 'is', 'it', 'you', 'of', 'in', 'that', 'now', 'was', 'this', 'with', 'for']);
export function isEnglish(text) {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  return words.length > 0 && words.filter((w) => ENGLISH.has(w)).length / words.length >= 0.08;
}
const LANGUAGE_CHECK = 'the reply is in English, like the request';
// Applied at report time, to fresh and cached runs alike, so a baseline cached before this
// check existed is judged the same way as a new run.
function withLanguageCheck(arm) {
  for (const c of arm?.cases ?? []) {
    for (const r of c.runs) {
      if (!r.checks.some((k) => k.name === LANGUAGE_CHECK)) {
        r.checks.push({ name: LANGUAGE_CHECK, passed: isEnglish(r.reply ?? ''), why: (r.reply ?? '').slice(0, 60) });
      }
      r.success = r.checks.every((k) => k.passed);
    }
  }
  return arm;
}

// The last thing Claude said, from the run's trace: what a beginner would have read.
function lastReply(trace) {
  let text = '';
  for (const line of trace.split('\n')) {
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    const content = m?.message?.content;
    if (m?.type !== 'assistant' || !Array.isArray(content)) continue;
    const t = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (t) text = t;
  }
  return text;
}

// One arm: run the eval, then grade every run it kept, then delete what it kept. The
// trace and the files Claude changed are saved first, under evals/results/, because a
// failed run with nothing left to read cannot be told apart from a broken check.
async function runArm(label, pluginDir, opts) {
  const out = join(mkdtempSync(join(tmpdir(), 'easyclaude-bench-')), `${label}.json`);
  const args = [
    'plugin', 'eval', pluginDir, '--tag', 'outcome', '--ablation', 'none', '--scaffold', '--keep-temp',
    '--trust-plugin', '--no-publish', '--model', opts.model, '--runs', String(opts.runs),
    '--max-cost-usd', String(opts.maxCost), '--json', out, '-j', String(opts.concurrency),
    '--allow-tools', 'Edit', 'Write', ...(opts.shell ? ['Bash'] : []),
    ...(opts.case ? ['--case', opts.case] : []),
  ];
  console.log(`\n${label}: claude ${args.join(' ')}`);
  const r = claude(args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (!existsSync(out)) throw new Error(`${label}: the runner wrote no result (exit ${r.status})`);
  const result = JSON.parse(readFileSync(out, 'utf8'));
  const cases = [];
  for (const c of result.cases) {
    const caseDir = join(OUTCOMES, c.name);
    const runs = [];
    for (const run of c.arms?.with ?? []) {
      const kept = run.tracePath ? dirname(dirname(run.tracePath)) : null;
      const workspace = kept && join(kept, 'home', 'cwd');
      let checks;
      const saved = join(opts.saveDir, `${label.replace(/\W+/g, '-')}-${c.name}-${runs.length + 1}`);
      try {
        if (workspace && existsSync(workspace)) copyWithoutGit(workspace, join(saved, 'files'));
        if (run.tracePath && existsSync(run.tracePath)) cpSync(run.tracePath, join(saved, 'trace.jsonl'));
        checks = workspace && existsSync(workspace)
          ? await gradeWorkspace(caseDir, workspace)
          : [{ name: 'the run left a workspace', passed: false, why: run.error ?? 'none kept' }];
      } finally {
        if (kept) rmSync(kept, { recursive: true, force: true });
      }
      for (const g of run.graders ?? []) {
        if (g.name !== 'changed-files') checks.push({ name: g.name, passed: g.passed, why: g.explanation });
      }
      const trace = join(saved, 'trace.jsonl');
      runs.push({
        success: checks.every((k) => k.passed), checks,
        reply: existsSync(trace) ? lastReply(readFileSync(trace, 'utf8')) : '',
        saved: relative(root, saved),
        costUsd: run.costUsd ?? 0, turns: run.turns ?? 0, error: run.error ?? null,
      });
    }
    cases.push({ name: c.name, runs });
  }
  return { claudeVersion: result.claudeVersion, costUsd: result.costUsd ?? 0, partial: result.partial, cases };
}

// A copy of the suite beside an empty plugin: same cases, same fixture, nothing loaded.
function baselinePlugin() {
  const dir = mkdtempSync(join(tmpdir(), 'easyclaude-baseline-'));
  mkdirSync(join(dir, '.claude-plugin'));
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'no-plugin-baseline', version: '0.0.0', description: 'An empty plugin.' }));
  writeFileSync(join(dir, '.bench-baseline'), 'evals/_fixture/setup.sh builds a project nobody set up\n');
  cpSync(OUTCOMES, join(dir, 'evals', 'outcomes'), { recursive: true });
  cpSync(join(root, 'evals', '_fixture'), join(dir, 'evals', '_fixture'), { recursive: true });
  return dir;
}

const pct = (n, d) => (d ? `${n}/${d}` : '-');
const money = (n) => `$${n.toFixed(2)}`;
function summarise(arm) {
  const map = new Map();
  for (const c of arm?.cases ?? []) {
    const n = c.runs.length;
    map.set(c.name, {
      ok: c.runs.filter((r) => r.success).length, n,
      cost: n ? c.runs.reduce((s, r) => s + r.costUsd, 0) / n : 0,
    });
  }
  return map;
}

async function main() {
  if (flag('--help')) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n').replace(/^\/\/ ?/gm, ''));
    return;
  }
  if (NODE_MAJOR < 22) throw new Error('grading needs Node 22 or later, for its permission model');
  const opts = {
    model: arg('--model', 'claude-sonnet-5'),
    runs: Number(arg('--runs', 3)),
    maxCost: Number(arg('--max-cost-usd', 15)),
    concurrency: Number(arg('-j', 2)),
    case: arg('--case', null),
    shell: flag('--shell'),
    saveDir: join(RESULTS, `outcome-${new Date().toISOString().replace(/[:.]/g, '-')}`),
  };
  if (opts.shell && process.platform === 'win32') {
    throw new Error('--shell needs a sandbox, and native Windows has none. Run this under WSL2 or Linux.');
  }

  const version = claude(['--version']).stdout?.trim() ?? 'unknown';
  const h = createHash('sha256');
  // No --case in the key: the cache holds every case it has run, and a run of one case
  // takes that case from it rather than paying for the other arm again.
  h.update(JSON.stringify({ version, model: opts.model, runs: opts.runs, shell: opts.shell }));
  hashTree(OUTCOMES, h);
  hashTree(join(root, 'evals', '_fixture'), h);
  const key = h.digest('hex').slice(0, 16);

  const withArm = await runArm('with easyClaude', root, opts);

  let without = null;
  if (!flag('--with-only')) {
    const cached = existsSync(BASELINE_CACHE) ? JSON.parse(readFileSync(BASELINE_CACHE, 'utf8')) : null;
    const wanted = withArm.cases.map((c) => c.name);
    const hit = cached?.key === key && !cached.arm.partial && !flag('--fresh-baseline') &&
      wanted.every((n) => cached.arm.cases.some((c) => c.name === n));
    if (hit) {
      without = { ...cached.arm, costUsd: 0, cases: cached.arm.cases.filter((c) => wanted.includes(c.name)) };
      console.log(`\nwithout easyClaude: reusing the result from ${cached.date} (nothing it depends on changed)`);
    } else {
      const dir = baselinePlugin();
      try { without = await runArm('without easyClaude', dir, opts); } finally { rmSync(dir, { recursive: true, force: true }); }
      if (!without.partial) {
        // Keep the cases this run did not cover, while the key still matches.
        const others = cached?.key === key ? cached.arm.cases.filter((c) => !wanted.includes(c.name)) : [];
        mkdirSync(RESULTS, { recursive: true });
        writeFileSync(BASELINE_CACHE, JSON.stringify({
          key, date: new Date().toISOString(), arm: { ...without, cases: [...others, ...without.cases] },
        }, null, 2));
      }
    }
  }

  withLanguageCheck(withArm);
  withLanguageCheck(without);
  const w = summarise(withArm);
  const wo = summarise(without);
  const lines = [
    `Outcome benchmark - ${version}, ${opts.model}, ${opts.runs} run(s) per case` +
      (opts.shell ? ', shell allowed' : ', no shell (see the note below)'),
    '',
    '| task | works, with easyClaude | works, without | cost per run, with | cost per run, without |',
    '|---|---|---|---|---|',
  ];
  let okW = 0, nW = 0, okWo = 0, nWo = 0;
  for (const [name, s] of w) {
    const b = wo.get(name);
    okW += s.ok; nW += s.n; okWo += b?.ok ?? 0; nWo += b?.n ?? 0;
    lines.push(`| ${name.replace(/^outcome-/, '')} | ${pct(s.ok, s.n)} | ${b ? pct(b.ok, b.n) : '-'} | ${money(s.cost)} | ${b ? money(b.cost) : '-'} |`);
  }
  lines.push(`| **all** | **${pct(okW, nW)}** | **${without ? pct(okWo, nWo) : '-'}** | | |`);
  if (!opts.shell) {
    lines.push('', 'No shell: neither arm could run commands. easyClaude\'s verify gate still ran the ' +
      'tests, because it is a hook, so this favours easyClaude. Use --shell under Linux or WSL2 for the fair figure.');
  }
  if (withArm.partial || without?.partial) lines.push('', 'PARTIAL: the cost ceiling stopped a run. Do not publish these figures.');
  lines.push('', `This run cost ${money(withArm.costUsd + (without?.costUsd ?? 0))} at list price` +
    ' (plan usage, not a charge, when you are signed in with a Claude plan).');

  console.log(`\n${lines.join('\n')}`);
  for (const [label, arm] of [['with', withArm], ['without', without]]) {
    for (const c of arm?.cases ?? []) {
      c.runs.forEach((r, i) => {
        const failed = r.checks.filter((k) => !k.passed);
        if (failed.length) console.log(`  ${label} ${c.name} #${i + 1}: ${failed.map((k) => `${k.name} (${k.why})`).join('; ')}`);
      });
    }
  }
  mkdirSync(opts.saveDir, { recursive: true });
  const file = join(opts.saveDir, 'result.json');
  writeFileSync(file, JSON.stringify({ version, opts, key, with: withArm, without }, null, 2));
  console.log(`\nSaved: ${relative(root, file)}`);
}

// Run as a script; imported by the tests for gradeWorkspace.
if (process.argv[1]?.endsWith('bench.mjs')) {
  main().catch((e) => { console.error(`bench: ${e.message}`); process.exit(1); });
}
