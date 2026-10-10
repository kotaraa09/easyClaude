#!/usr/bin/env node
// The outcome benchmark: does a beginner get working software more often with easyClaude
// than without it?
//
//   node scripts/bench.mjs                   run both arms, print the table, save the result
//   node scripts/bench.mjs --with-only       run only the easyClaude arm (reuses no baseline)
//   node scripts/bench.mjs --fresh-baseline  re-run the no-easyClaude arm even if cached
//   node scripts/bench.mjs --runs 1          quick look while iterating - not for publishing
//   node scripts/bench.mjs --case 'outcome-fix*' --model claude-opus-5-5 --max-cost-usd 5
//   node scripts/bench.mjs --prompts expert-spec   the tasks in the words of evals/prompt-levels/
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

// 'tests/**' matches everything under tests/, '**/' any folders or none, '*' any part of one
// name. Anything else is an exact path. Before '*' worked, '**/DECISIONS.md' matched no file
// at all, so a check that it was absent could never fail.
export const matchesGlob = (file, glob) => new RegExp(`^${glob
  .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
  .replace(/\*\*\/|\/\*\*$|\*/g, (m) => (m === '**/' ? '(?:.*/)?' : m === '/**' ? '/.*' : '[^/]*'))}$`).test(file);

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
  return spawnSync('claude', quoted, {
    encoding: 'utf8', shell: win, maxBuffer: 256 * 1024 * 1024, env: benchEnv(), ...opts,
  });
}

// Every setup.sh runs through `bash`. From a PowerShell terminal on Windows, the first
// `bash` on PATH is C:\Windows\System32\bash.exe, the WSL launcher, which fails with no
// readable message when no Linux is installed. The first run from PowerShell built no sample
// project three times of three, while the same command from Git Bash worked. So Git for
// Windows' own bash goes first. Its folder is found from git itself, so any install
// location works.
export function gitBashDir({ platform = process.platform, spawn = spawnSync, exists = existsSync } = {}) {
  if (platform !== 'win32') return null;
  const r = spawn('git', ['--exec-path'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  // <git>/mingw64/libexec/git-core -> <git>/bin
  const dir = join(r.stdout.trim(), '..', '..', '..', 'bin');
  return exists(join(dir, 'bash.exe')) ? dir : null;
}
let env = null;
function benchEnv() {
  if (env) return env;
  env = { ...process.env };
  const dir = gitBashDir();
  if (dir) {
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'Path';
    env[key] = `${dir};${env[key] ?? ''}`;
  }
  return env;
}

function hashTree(dir, h) {
  for (const f of walkFiles(dir).filter((f) => !f.startsWith('results/')).sort()) {
    h.update(f);
    h.update(readFileSync(join(dir, f)));
  }
}

// A task asked in English needs a reply in English. The first full run found a
// third of easyClaude's replies in Hungarian, Slovak or Spanish, and no check noticed,
// because every check looked at files. A beginner who cannot read the answer did not get
// one. Common English words make up a fifth or more of English prose and almost none of
// those languages; "a" is left out because Hungarian uses it too.
//
// A share of common English words alone failed a short, correct English reply ("Updated
// `index.html` - page title, header, footer copyright...") that is mostly nouns. So it
// asks two questions instead. Does the text use letters English does not - accents, or
// another script? And does it use more small words of another language than of English?
const ENGLISH = new Set(['the', 'and', 'to', 'is', 'it', 'you', 'of', 'in', 'that', 'now', 'was',
  'this', 'with', 'for', 'if', 'are', 'not', 'all', 'so', 'your', 'be', 'on', 'or', 'but']);
const FOREIGN = new Set([
  'el', 'la', 'los', 'las', 'que', 'del', 'una', 'por', 'para', 'con', 'pero', // es
  'az', 'egy', 'hogy', 'nem', 'és', 'is', // hu - "is" counts for English too, and cancels out
  'som', 'na', 'je', 'sa', 'pre', 'ako', 'aby', // sk, cs
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', // de
  'les', 'des', 'est', 'pas', 'une', 'avec', // fr
  'che', 'non', 'della', 'uma', 'não', 'os', // it, pt
]);
export function isEnglish(text) {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  const unusual = letters.filter((l) => !/[a-z]/i.test(l)).length;
  if (unusual / letters.length > 0.02) return false;
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const en = words.filter((w) => ENGLISH.has(w)).length;
  const other = words.filter((w) => FOREIGN.has(w) && !ENGLISH.has(w)).length;
  return en > 0 && en >= other;
}
// Thai: most of the letters outside code are Thai. File names, function names and the
// shop's own English name are Latin in any Thai reply, so text in backticks is left out
// first, and 30% is enough (see below). It also looks at each paragraph: the first Thai run passed a
// reply that opened with a full English paragraph, and a beginner who cannot read English
// stops at the first one. A paragraph fails only when it is almost all Latin. Half was
// tried first, and failed a Thai line naming "title, header, footer" and both shop names.
const thaiShare = (prose) => {
  const thai = (prose.match(/\p{Script=Thai}/gu) ?? []).length;
  const other = (prose.match(/\p{L}/gu) ?? []).filter((l) => !/\p{Script=Thai}/u.test(l)).length;
  return { thai, other };
};
export function isThai(text) {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  // 30%, not half: a Thai reply naming both shop names, the page parts and two email
  // addresses is under half Thai, and English with a Thai line at the end is near 10%.
  const all = thaiShare(prose);
  if (!all.thai || all.thai < 0.3 * (all.thai + all.other)) return false;
  return prose.split(/\n\s*\n/).every((p) => {
    const { thai, other } = thaiShare(p);
    return thai + other < 30 || thai >= 0.2 * (thai + other);
  });
}

// A task asks in English unless its check.mjs exports `language`. Every task was English
// until 0.2.0, so a bug that showed only in Thai - the language most users write in -
// would have passed unseen.
const LANGUAGES = {
  en: { name: 'the reply is in English, like the request', test: isEnglish },
  th: { name: 'the reply is in Thai, like the request', test: isThai },
};
export async function caseLanguage(name) {
  const file = join(OUTCOMES, name, 'check.mjs');
  if (!existsSync(file)) return LANGUAGES.en;
  const { language = 'en' } = await import(pathToFileURL(file).href);
  if (!LANGUAGES[language]) throw new Error(`${name}/check.mjs: no language check for "${language}"`);
  return LANGUAGES[language];
}

// Applied at report time, to fresh and cached runs alike, so a baseline cached before this
// check existed is judged the same way as a new run.
async function withLanguageCheck(arm) {
  for (const c of arm?.cases ?? []) {
    const lang = await caseLanguage(c.name);
    for (const r of c.runs) {
      if (!r.checks.some((k) => k.name === lang.name)) {
        r.checks.push({ name: lang.name, passed: lang.test(r.reply ?? ''), why: (r.reply ?? '').slice(0, 60) });
      }
      r.success = r.checks.every((k) => k.passed);
    }
  }
  return arm;
}

// How readable the final reply is to someone who does not read code. Two plain counts, not
// a verdict: they are compared between two runs of the same tasks, such as with and without
// an output style, and a task that scores lower matters more than either count.
//   length     letters and digits outside code, so a long code block does not hide as prose
//   code terms things a beginner cannot act on: anything in backticks, and outside them file
//              names, camelCase names and a.b.c property paths
export function replyMeasures(text) {
  const ticks = (text.match(/```[\s\S]*?```|`[^`\n]+`/g) ?? []).length;
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]+`/g, ' ');
  const bare = (prose.match(/\b[\w-]+(?:\/[\w.-]+)*\.(?:m?js|cjs|ts|tsx|jsx|html|css|json|md|py)\b/g) ?? []).length +
    (prose.match(/\b[a-z]+[A-Z]\w*\b/g) ?? []).length +
    (prose.match(/\b[a-z_]\w*\.[a-z_]\w*\.[a-z_]\w*\b/gi) ?? []).length;
  return { length: (prose.match(/[\p{L}\p{M}\p{N}]/gu) ?? []).length, codeTerms: ticks + bare };
}

// --style <name>: the easyClaude arm with one of its output styles on, as kickoff sets it
// when the user says yes. An eval run loads no project settings, so an outputStyle written
// into the sample project was ignored, and the trace said "default". A style that keeps the
// coding instructions is Claude Code's instructions plus the style's text, so this adds the
// text the same way, with the case field the runner does honour. It runs a copy of the
// plugin, so the case files in the repo are never touched.
export function stylePlugin(style) {
  return variantPlugin({ style });
}

// --prompts <level>: every task asked in the words of evals/prompt-levels/<level>/<task>.md
// instead of its own prompt.md, to measure how much the way a request is written changes the
// result, with easyClaude and without. A task the level does not word is left out of the copy,
// so it never runs under the level's name in its usual words.
export const PROMPT_LEVELS = join(root, 'evals', 'prompt-levels');
export function levelPrompt(level, name) {
  const file = join(PROMPT_LEVELS, level, `${name}.md`);
  return existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

// Rewrites the tasks of a copied suite, under <dir>/evals/outcomes, for a style and a level.
export function applyVariant(dir, { style = null, prompts = null } = {}) {
  let body = null;
  if (style) {
    const file = join(root, 'output-styles', `${style}.md`);
    if (!existsSync(file)) throw new Error(`--style ${style}: no output-styles/${style}.md`);
    body = readFileSync(file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  }
  if (prompts && !existsSync(join(PROMPT_LEVELS, prompts))) throw new Error(`--prompts ${prompts}: no evals/prompt-levels/${prompts}/`);
  const outcomes = join(dir, 'evals', 'outcomes');
  let worded = 0;
  for (const name of readdirSync(outcomes)) {
    const prompt = join(outcomes, name, 'prompt.md');
    if (!existsSync(prompt)) continue;
    let text = readFileSync(prompt, 'utf8');
    if (prompts) {
      const words = levelPrompt(prompts, name);
      if (words === null) {
        rmSync(join(outcomes, name), { recursive: true, force: true });
        continue;
      }
      const head = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
      if (!head) throw new Error(`--prompts ${prompts}: ${name}/prompt.md has no frontmatter`);
      text = `${head[0]}\n${words}\n`;
      worded++;
    }
    if (body !== null) {
      const styled = text.replace(/^(---\r?\n[\s\S]*?)(\r?\n---\r?\n)/,
        (_, head, end) => `${head}\nappend_system_prompt: ${JSON.stringify(body)}${end}`);
      if (styled === text || /\nappend_system_prompt:[\s\S]*\nappend_system_prompt:/.test(styled)) {
        throw new Error(`--style ${style}: could not add the style to ${name}/prompt.md`);
      }
      text = styled;
    }
    writeFileSync(prompt, text);
  }
  if (prompts && !worded) throw new Error(`--prompts ${prompts}: the level words none of the tasks`);
}

// A copy of the plugin with its tasks rewritten, so the case files in the repo are never touched.
export function variantPlugin(variant) {
  const dir = mkdtempSync(join(tmpdir(), 'easyclaude-variant-'));
  cpSync(root, dir, {
    recursive: true,
    filter: (src) => !/^(\.git|node_modules|evals[\\/]results)([\\/]|$)/.test(relative(root, src)),
  });
  try {
    applyVariant(dir, variant);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return dir;
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
function runEval(label, pluginDir, tag, caseGlob, opts) {
  const out = join(mkdtempSync(join(tmpdir(), 'easyclaude-bench-')), 'result.json');
  const args = [
    'plugin', 'eval', pluginDir, '--tag', tag, '--ablation', 'none', '--scaffold', '--keep-temp',
    '--trust-plugin', '--no-publish', '--model', opts.model, '--runs', String(opts.runs),
    '--max-cost-usd', String(opts.maxCost), '--json', out, '-j', String(opts.concurrency),
    '--allow-tools', 'Edit', 'Write', ...(opts.shell ? ['Bash'] : []),
    ...(caseGlob ? ['--case', caseGlob] : []),
  ];
  console.log(`\n${label}: claude ${args.join(' ')}`);
  const r = claude(args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (!existsSync(out)) throw new Error(`${label}: the runner wrote no result (exit ${r.status})`);
  return JSON.parse(readFileSync(out, 'utf8'));
}

export const globToRegex = (glob) =>
  new RegExp(`^${glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

// A case with a "<name>-day1" sibling runs over two sessions. Day one runs first, tagged
// outcome-seed so no normal run picks it up, and each run's project - git history and all
// - is saved where the day-two case's setup.sh claims one per run. Nothing else carries
// over: not the conversation, not any memory outside the project. Returns what day one
// cost per case, so the table charges it to the task it belongs to.
async function runSeeds(label, pluginDir, seedsRoot, opts) {
  const dependents = readdirSync(OUTCOMES)
    .filter((n) => existsSync(join(OUTCOMES, `${n}-day1`)))
    .filter((n) => !opts.case || globToRegex(opts.case).test(n));
  const cost = {};
  for (const name of dependents) {
    const result = runEval(`${label}, day one of ${name}`, pluginDir, 'outcome-seed', `${name}-day1`, opts);
    cost[name] = result.costUsd ?? 0;
    const runs = result.cases.find((c) => c.name === `${name}-day1`)?.arms?.with ?? [];
    runs.forEach((run, i) => {
      const kept = run.tracePath ? dirname(dirname(run.tracePath)) : null;
      try {
        const workspace = kept && join(kept, 'home', 'cwd');
        if (workspace && existsSync(workspace)) cpSync(workspace, join(seedsRoot, name, String(i + 1)), { recursive: true });
        const saved = join(opts.saveDir, `${label.replace(/\W+/g, '-')}-${name}-day1-${i + 1}`);
        if (run.tracePath && existsSync(run.tracePath)) {
          mkdirSync(saved, { recursive: true });
          cpSync(run.tracePath, join(saved, 'trace.jsonl'));
        }
      } finally {
        if (kept) rmSync(kept, { recursive: true, force: true });
      }
    });
  }
  return cost;
}

async function runArm(label, pluginDir, opts) {
  const seedsRoot = join(pluginDir, 'evals', 'results', 'seeds');
  rmSync(seedsRoot, { recursive: true, force: true });
  let result;
  let dayOne;
  try {
    dayOne = await runSeeds(label, pluginDir, seedsRoot, opts);
    result = runEval(label, pluginDir, 'outcome', opts.case, opts);
  } finally {
    rmSync(seedsRoot, { recursive: true, force: true });
  }
  const cases = [];
  let limited = 0;
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
      const traceText = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
      const reply = lastReply(traceText);
      // A run the account's usage limit stopped measured nothing. The first Thai run of
      // the no-easyClaude arm stopped this way three times, and was cached as 0/3.
      // A run that never started measured nothing either: no sample project, or no login.
      // Both reached the table as 0/3 on 2026-09-29, one marked as a full result.
      if (USAGE_LIMIT.test(reply) || NOT_STARTED.test(`${run.error ?? ''}\n${reply}`)) limited++;
      // Changed no file and ended on a question: it asked instead of acting. The benchmark
      // sends one message, so a run that asks fails here, though a person could answer it.
      const changed = (run.graders ?? []).find((g) => g.name === 'changed-files')?.passed;
      runs.push({
        success: checks.every((k) => k.passed), checks, reply, ...replyMeasures(reply),
        asked: changed === false && /\?/.test(reply.slice(-600)),
        saved: relative(root, saved),
        // Day one's cost, spread over the day-two runs it seeded.
        costUsd: (run.costUsd ?? 0) + (dayOne[c.name] ?? 0) / Math.max(1, c.arms.with.length),
        turns: run.turns ?? 0, error: run.error ?? null,
      });
    }
    // The words the runner sent, from its own result: the trace does not carry them, and a
    // prompt level has to be able to show which words each of its runs got.
    cases.push({ name: c.name, prompt: c.promptMarkdown ?? null, runs });
  }
  const seedCost = Object.values(dayOne).reduce((s, n) => s + n, 0);
  if (limited) console.log(`\n${label}: ${limited} run(s) stopped at a usage limit or never started. Nothing from this arm is cached.`);
  return {
    claudeVersion: result.claudeVersion, costUsd: (result.costUsd ?? 0) + seedCost,
    partial: Boolean(result.partial || limited), cases,
  };
}

export const USAGE_LIMIT = /you'?ve hit your [\w ]*limit|usage limit reached/i;
export const NOT_STARTED = /scaffold failed|failed to authenticate|oauth [\w ]*expired/i;

// What a task's no-easyClaude result depends on: the Claude Code version, the run
// settings, the task's own files, its day one if it has one, and the shared sample
// project. Nothing about easyClaude, which that arm never loads.
export function caseKey(name, version, opts) {
  const h = createHash('sha256');
  h.update(JSON.stringify({ version, model: opts.model, runs: opts.runs, shell: Boolean(opts.shell) }));
  // A level's words are part of the task: the same task asked another way is another result.
  if (opts.prompts) h.update(`prompts:${opts.prompts}:${levelPrompt(opts.prompts, name) ?? ''}`);
  for (const dir of [name, `${name}-day1`]) {
    if (existsSync(join(OUTCOMES, dir))) { h.update(dir); hashTree(join(OUTCOMES, dir), h); }
  }
  hashTree(join(root, 'evals', '_fixture'), h);
  return h.digest('hex').slice(0, 16);
}

// { <task>: { key, date, runs } }. A file in the old one-key format is read as empty,
// which costs one re-run of that arm and nothing else.
function readBaselineCache() {
  try {
    const c = JSON.parse(readFileSync(BASELINE_CACHE, 'utf8'));
    return c.format === 2 ? c.cases : {};
  } catch { return {}; }
}

// A copy of the suite beside an empty plugin: same cases, same fixture, nothing loaded.
function baselinePlugin(variant = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'easyclaude-baseline-'));
  mkdirSync(join(dir, '.claude-plugin'));
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'no-plugin-baseline', version: '0.0.0', description: 'An empty plugin.' }));
  writeFileSync(join(dir, '.bench-baseline'), 'evals/_fixture/setup.sh builds a project nobody set up\n');
  cpSync(OUTCOMES, join(dir, 'evals', 'outcomes'), { recursive: true });
  cpSync(join(root, 'evals', '_fixture'), join(dir, 'evals', '_fixture'), { recursive: true });
  // The level's words, never a style: the no-easyClaude arm has no easyClaude style to add.
  if (variant.prompts) applyVariant(dir, { prompts: variant.prompts });
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
      length: n ? Math.round(c.runs.reduce((s, r) => s + (r.length ?? replyMeasures(r.reply ?? '').length), 0) / n) : 0,
      codeTerms: n ? c.runs.reduce((s, r) => s + (r.codeTerms ?? replyMeasures(r.reply ?? '').codeTerms), 0) / n : 0,
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
    // --style plain: the easyClaude arm runs with that output style on, as kickoff sets it
    // when the user says yes. Compare with a run without it, on the same tasks.
    style: arg('--style', null),
    // --prompts <level>: the tasks in the words of evals/prompt-levels/<level>/, in both arms.
    prompts: arg('--prompts', null),
    saveDir: join(RESULTS, `outcome-${new Date().toISOString().replace(/[:.]/g, '-')}` +
      `${arg('--style', null) ? `-${arg('--style')}` : ''}${arg('--prompts', null) ? `-prompts-${arg('--prompts')}` : ''}`),
  };
  if (opts.shell && process.platform === 'win32') {
    throw new Error('--shell needs a sandbox, and native Windows has none. Run this under WSL2 or Linux.');
  }

  const version = claude(['--version']).stdout?.trim() ?? 'unknown';
  let withArm;
  const styled = opts.style || opts.prompts ? variantPlugin({ style: opts.style, prompts: opts.prompts }) : null;
  try {
    withArm = await runArm('with easyClaude', styled ?? root, opts);
  } finally {
    if (styled) rmSync(styled, { recursive: true, force: true });
  }

  let without = null;
  if (!flag('--with-only')) {
    // Cached per task. One key over every task meant that rewording one prompt re-ran the
    // no-easyClaude arm of all of them, which is most of what a run costs.
    const cache = readBaselineCache();
    const wanted = withArm.cases.map((c) => c.name);
    const keys = Object.fromEntries(wanted.map((n) => [n, caseKey(n, version, opts)]));
    const stale = wanted.filter((n) => flag('--fresh-baseline') || cache[n]?.key !== keys[n]);
    const fresh = [];
    let spent = 0;
    let partial = false;
    if (stale.length) {
      const dir = baselinePlugin({ prompts: opts.prompts });
      try {
        for (const name of stale) {
          const arm = await runArm('without easyClaude', dir, { ...opts, case: name });
          spent += arm.costUsd;
          partial ||= Boolean(arm.partial);
          fresh.push(...arm.cases);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      if (!partial) {
        const date = new Date().toISOString();
        for (const c of fresh) cache[c.name] = { key: keys[c.name], date, runs: c.runs };
        mkdirSync(RESULTS, { recursive: true });
        writeFileSync(BASELINE_CACHE, JSON.stringify({ format: 2, cases: cache }, null, 2));
      }
    }
    const reused = wanted.filter((n) => !stale.includes(n));
    if (reused.length) console.log(`\nwithout easyClaude: reusing ${reused.join(', ')} (nothing they depend on changed)`);
    without = {
      costUsd: spent, partial,
      cases: wanted.map((n) => fresh.find((c) => c.name === n) ?? { name: n, runs: cache[n]?.runs ?? [] }),
    };
  }

  await withLanguageCheck(withArm);
  await withLanguageCheck(without);
  const w = summarise(withArm);
  const wo = summarise(without);
  const lines = [
    `Outcome benchmark - ${version}, ${opts.model}, ${opts.runs} run(s) per case` +
      (opts.shell ? ', shell allowed' : ', no shell (see the note below)') +
      (opts.style ? `, easyClaude with the "${opts.style}" output style` : '') +
      (opts.prompts ? `, tasks worded as "${opts.prompts}"` : ''),
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
  // The final reply, averaged per run: letters outside code, and code terms in it.
  lines.push('', '| task | reply length, with | code terms, with | reply length, without | code terms, without |',
    '|---|---|---|---|---|');
  for (const [name, s] of w) {
    const b = wo.get(name);
    lines.push(`| ${name.replace(/^outcome-/, '')} | ${s.length} | ${s.codeTerms.toFixed(1)} | ${b ? b.length : '-'} | ${b ? b.codeTerms.toFixed(1) : '-'} |`);
  }
  if (!opts.shell) {
    lines.push('', 'No shell: neither arm could run commands. easyClaude\'s verify gate still ran the ' +
      'tests, because it is a hook, so this favours easyClaude. Use --shell under Linux or WSL2 for the fair figure.');
  }
  if (withArm.partial || without?.partial) {
    lines.push('', 'PARTIAL: the cost ceiling or a usage limit stopped a run. Do not publish these figures.');
  }
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
  writeFileSync(file, JSON.stringify({ version, opts, with: withArm, without }, null, 2));
  console.log(`\nSaved: ${relative(root, file)}`);
}

// Run as a script; imported by the tests for gradeWorkspace.
if (process.argv[1]?.endsWith('bench.mjs')) {
  main().catch((e) => { console.error(`bench: ${e.message}`); process.exit(1); });
}
