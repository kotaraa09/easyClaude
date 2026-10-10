#!/usr/bin/env node
// Does the way a request is written change the result, and does easyClaude close the gap
// between a beginner and someone who writes prompts well?
//
//   node scripts/prompt-gap.mjs --runs 3 --max-cost-usd 40   run every level, both arms, then report
//   node scripts/prompt-gap.mjs --report                     the table again, from the saved runs
//   node scripts/prompt-gap.mjs --levels expert-spec,beginner-terse --runs 1   a quick look
//
// Each level in evals/prompt-levels/ words the same outcome tasks another way; its README has
// the rule for writing one. This runs scripts/bench.mjs --prompts <level> once per level, so
// each level gets both arms, the hidden-test grading and the bench's own cost ceiling. Then it
// pools the two beginner levels and the two expert levels, and compares the gap between them
// with easyClaude and without.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { levelPrompt, NOT_STARTED, USAGE_LIMIT } from './bench.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = join(root, 'evals', 'results');
export const LEVELS = ['beginner', 'beginner-terse', 'expert-checklist', 'expert-spec'];
export const SIDES = { beginner: ['beginner', 'beginner-terse'], expert: ['expert-checklist', 'expert-spec'] };

// The 95% Wilson interval of k successes in n runs, as two rates. It stays inside 0..1 and
// is honest about small samples, where k/n alone looks more certain than it is.
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

// One arm of one level's bench result: { ok, n, asked, cost } over every run of every task.
// A run a usage limit stopped measured nothing, so it is left out of n and counted on its
// own: the first full run counted 52 of them as failures.
export function tally(arm) {
  const t = { ok: 0, n: 0, asked: 0, cost: 0, limited: 0, tasks: {} };
  for (const c of arm?.cases ?? []) {
    const name = c.name.replace(/^outcome-/, '');
    const task = (t.tasks[name] ??= { ok: 0, n: 0, asked: 0 });
    for (const r of c.runs) {
      t.cost += r.costUsd ?? 0;
      if (r.limited ?? (USAGE_LIMIT.test(r.reply ?? '') || NOT_STARTED.test(`${r.error ?? ''}\n${r.reply ?? ''}`))) {
        t.limited++;
        continue;
      }
      t.n++; task.n++;
      if (r.success) { t.ok++; task.ok++; }
      if (r.asked) { t.asked++; task.asked++; }
    }
  }
  return t;
}

const add = (a, b) => ({ ok: a.ok + b.ok, n: a.n + b.n, asked: a.asked + b.asked, cost: a.cost + b.cost });
const ZERO = { ok: 0, n: 0, asked: 0, cost: 0 };

// The newest saved run of each level: evals/results/outcome-<date>-prompts-<level>/result.json.
export function latestResults(dir = RESULTS) {
  const found = {};
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir).sort()) {
    const m = /^outcome-.*-prompts-(.+)$/.exec(name);
    const file = join(dir, name, 'result.json');
    if (m && LEVELS.includes(m[1]) && existsSync(file)) found[m[1]] = { name, ...JSON.parse(readFileSync(file, 'utf8')) };
  }
  return found;
}

const pct = (k, n) => (n ? `${Math.round((100 * k) / n)}%` : '-');
const range = (k, n) => {
  const [lo, hi] = wilson(k, n);
  return n ? `${Math.round(lo * 100)}-${Math.round(hi * 100)}%` : '-';
};
const money = (n) => `$${n.toFixed(2)}`;

export function report(results) {
  const levels = LEVELS.filter((l) => results[l]);
  const cell = {};
  for (const l of levels) cell[l] = { with: tally(results[l].with), without: tally(results[l].without) };
  const lines = [
    `Prompt levels - ${results[levels[0]]?.version ?? '?'}, ${results[levels[0]]?.opts?.model ?? '?'}` +
      (results[levels[0]]?.opts?.shell ? ', shell allowed' : ', no shell'),
    '',
    '| level | works, with easyClaude | works, without | stopped to ask, with | stopped to ask, without | cost, with | cost, without |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const l of levels) {
    const w = cell[l].with;
    const wo = cell[l].without;
    lines.push(`| ${l} | ${w.ok}/${w.n} | ${wo.ok}/${wo.n} | ${w.asked} | ${wo.asked} | ${money(w.cost)} | ${money(wo.cost)} |`);
  }
  const side = (s, arm) => SIDES[s].filter((l) => cell[l]).reduce((acc, l) => add(acc, cell[l][arm]), ZERO);
  const B = { with: side('beginner', 'with'), without: side('beginner', 'without') };
  const E = { with: side('expert', 'with'), without: side('expert', 'without') };
  const rate = (t) => (t.n ? t.ok / t.n : 0);
  lines.push('', '| side | with easyClaude | 95% range | without | 95% range |', '|---|---|---|---|---|');
  for (const [name, t] of [['beginner (both levels)', B], ['expert (both levels)', E]]) {
    lines.push(`| ${name} | ${t.with.ok}/${t.with.n} (${pct(t.with.ok, t.with.n)}) | ${range(t.with.ok, t.with.n)} | ` +
      `${t.without.ok}/${t.without.n} (${pct(t.without.ok, t.without.n)}) | ${range(t.without.ok, t.without.n)} |`);
  }
  // A side with no runs has no rate: its gap is not measured, never -100 points.
  const gap = (e, b) => (e.n && b.n ? rate(e) - rate(b) : null);
  const gapWith = gap(E.with, B.with);
  const gapWithout = gap(E.without, B.without);
  const pts = (x) => (x === null ? 'not measured' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)} points`);
  lines.push('',
    `Gap, expert minus beginner: ${pts(gapWith)} with easyClaude, ${pts(gapWithout)} without.`,
    `A beginner with easyClaude: ${pct(B.with.ok, B.with.n)}. An expert without it: ${pct(E.without.ok, E.without.n)}.`);

  const tasks = [...new Set(levels.flatMap((l) => Object.keys(cell[l].with.tasks)))].sort();
  lines.push('', `| task | ${levels.map((l) => `${l}, with / without`).join(' | ')} |`, `|---|${levels.map(() => '---|').join('')}`);
  for (const task of tasks) {
    lines.push(`| ${task} | ${levels.map((l) => {
      const w = cell[l].with.tasks[task];
      const wo = cell[l].without.tasks[task];
      return `${w ? `${w.ok}/${w.n}` : '-'} / ${wo ? `${wo.ok}/${wo.n}` : '-'}`;
    }).join(' | ')} |`);
  }
  // Every run must have been sent its level's words. The bench saves what the runner sent.
  const wrong = [];
  for (const l of levels) {
    for (const arm of ['with', 'without']) {
      for (const c of results[l][arm]?.cases ?? []) {
        if (c.prompt != null && c.prompt.replace(/\r\n/g, '\n').trim() !== levelPrompt(l, c.name)) wrong.push(`${l} ${arm} ${c.name}`);
      }
    }
  }
  if (wrong.length) lines.push('', `WORDS DIFFER: these runs were not sent their level's words: ${wrong.join(', ')}. Do not use these figures.`);
  if (levels.some((l) => results[l].with?.partial || results[l].without?.partial)) {
    const stopped = levels.reduce((s, l) => s + cell[l].with.limited + cell[l].without.limited, 0);
    lines.push('', `PARTIAL: a cost ceiling or a usage limit stopped a run${stopped ? `; ${stopped} run(s) a usage limit stopped are left out of the counts` : ''}. Do not publish these figures.`);
  }
  const spent = levels.reduce((s, l) => s + cell[l].with.cost + cell[l].without.cost, 0);
  lines.push('', `These runs cost ${money(spent)} at list price, counting the no-easyClaude runs each level reused from the cache.`);
  return { text: lines.join('\n'), gapWith, gapWithout, beginner: B, expert: E, wrong };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

function main() {
  if (!process.argv.includes('--report')) {
    const levels = arg('--levels', LEVELS.join(',')).split(',').filter(Boolean);
    for (const l of levels) if (!LEVELS.includes(l)) throw new Error(`--levels: no level ${l}; the levels are ${LEVELS.join(', ')}`);
    const budget = Number(arg('--max-cost-usd', 40));
    const passOn = ['--runs', '--model', '-j', '--case'].flatMap((f) => (arg(f, null) === null ? [] : [f, arg(f)]));
    if (process.argv.includes('--shell')) passOn.push('--shell');
    let spent = 0;
    for (const [i, level] of levels.entries()) {
      // Each level gets an even share of what is left; the bench stops a run at its share.
      const share = (budget - spent) / (levels.length - i);
      if (share <= 0.5) throw new Error(`the budget of $${budget} is spent; stopped before ${level}`);
      console.log(`\n=== ${level}: up to $${share.toFixed(2)} ===`);
      const r = spawnSync(process.execPath, [join(root, 'scripts', 'bench.mjs'), '--prompts', level,
        '--max-cost-usd', String((share / 2).toFixed(2)), ...passOn], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`bench.mjs --prompts ${level} failed (exit ${r.status})`);
      const latest = latestResults()[level];
      spent += (latest?.with?.costUsd ?? 0) + (latest?.without?.costUsd ?? 0);
    }
  }
  const { text } = report(latestResults());
  console.log(`\n${text}`);
  mkdirSync(RESULTS, { recursive: true });
  const file = join(RESULTS, `prompt-gap-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  writeFileSync(file, `${text}\n`);
  console.log(`\nSaved: ${file}`);
}

if (process.argv[1]?.endsWith('prompt-gap.mjs')) {
  try { main(); } catch (e) { console.error(`prompt-gap: ${e.message}`); process.exit(1); }
}
