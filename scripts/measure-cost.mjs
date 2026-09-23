#!/usr/bin/env node
// Measures what easyClaude adds to every turn, by asking Claude Code rather than estimating.
//
//   node measure-cost.mjs            measure and print the table
//   node measure-cost.mjs --write    also save the figures to docs/cost.json
//   node measure-cost.mjs --runs 3   repeat each case 3 times (default 2)
//
// Needs a logged-in `claude`, and spends real money: about $0.50 to $1 a run. That is why
// CI does not run it. CI checks that the README quotes docs/cost.json exactly, and warns
// when the files that set the cost changed after the last measurement.
//
// Method: send "hi" in five projects, each one adding one part, and read the input tokens
// Claude Code reports. Each difference is what that part costs on every turn, because
// everything in the first request stays in the context of every later one.
//
// MCP servers are off (--strict-mcp-config). They connect in the background, and a
// connector that finished before the first request added ~1.7k tokens to that case and
// not the next - one run measured the rules at minus 1,293. They are the user's cost,
// not the plugin's. With them off, repeated runs agree within a few tokens, and the
// script refuses a result where they do not, or where any part comes out negative.
//
// Why this exists: the README said ~958 tokens per turn, from a chars/4 estimate that left
// out the CLAUDE.md kickoff writes. Measured, a set-up project cost ~2,300.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, rmSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { COST_FILE, costFingerprint } from './cost-inputs.mjs';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const RUNS = Number(args[args.indexOf('--runs') + 1]) || 2;
// Runs of one case that differ by more than this mean the environment moved, not the plugin.
const SPREAD = 50;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'cost-project.json'), 'utf8')).files;

// shell on Windows, where npm puts `claude` on PATH as a .cmd shim. Every argument below is
// a plain word or a path with no spaces from mkdtemp, so nothing needs quoting.
const claude = (argv, cwd) => spawnSync('claude', argv, {
  cwd, encoding: 'utf8', timeout: 300_000, shell: process.platform === 'win32',
});

const version = claude(['--version']).stdout?.trim();
if (!version) {
  console.error('measure-cost: `claude` is not installed.');
  process.exit(1);
}
// An installed copy of easyClaude would load in every case, the baseline included, and
// every difference would come out near zero - a result that looks like good news.
let installed = [];
try { installed = JSON.parse(claude(['plugin', 'list', '--json']).stdout); } catch { /* none */ }
if (installed.some((p) => /^easyclaude@/.test(p.id) && p.enabled)) {
  console.error('measure-cost: easyClaude is installed and enabled for your user, so it would load in ' +
    'the baseline too. Disable it for the run: claude plugin disable easyclaude@easyclaude');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'ec-cost-'));
const settings = join(work, 'settings.json');
// The user's own output style changes how Claude answers "hi", not what the plugin costs.
writeFileSync(settings, JSON.stringify({ outputStyle: 'default' }));

function project(name, files) {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}
const rules = (dir) => {
  mkdirSync(join(dir, '.claude', 'rules'), { recursive: true });
  for (const f of readdirSync(join(root, 'rules')).filter((f) => f.endsWith('.md'))) {
    cpSync(join(root, 'rules', f), join(dir, '.claude', 'rules', f));
  }
  return dir;
};

const { 'docs/STATE.md': state, 'CLAUDE.md': claudeMd, 'index.html': html } = fixture;
const CASES = [
  // [name, what it adds, directory, load the plugin]
  ['baseline', 'Claude Code alone', project('baseline', { 'index.html': html }), false],
  ['plugin', 'skills, agent and hooks', project('plugin', { 'index.html': html }), true],
  ['state', 'docs/STATE.md read back by the opener', project('state', { 'index.html': html, 'docs/STATE.md': state }), true],
  ['claudeMd', 'the CLAUDE.md kickoff writes', project('claudeMd', { 'index.html': html, 'docs/STATE.md': state, 'CLAUDE.md': claudeMd }), true],
  ['rules', 'the rules kickoff copies in', rules(project('rules', { 'index.html': html, 'docs/STATE.md': state, 'CLAUDE.md': claudeMd })), true],
];

let spent = 0;
let model = null;
const tokens = {};
for (const [name, , dir, withPlugin] of CASES) {
  const seen = [];
  for (let i = 0; i < RUNS; i++) {
    const r = claude([
      '-p', 'hi', ...(withPlugin ? ['--plugin-dir', root] : []), '--settings', settings,
      '--strict-mcp-config',
      '--disallowedTools', 'Bash', 'Read', 'Glob', 'Grep', '--output-format', 'json',
    ], dir);
    let j;
    try { j = JSON.parse(r.stdout); } catch {
      console.error(`measure-cost: case "${name}" returned no JSON:\n${r.stdout}${r.stderr}`);
      process.exit(1);
    }
    if (j.is_error) {
      console.error(`measure-cost: case "${name}" failed: ${j.result}`);
      process.exit(1);
    }
    // More than one request means Claude used a tool, and the second request carries the
    // first one's output - the case would measure a conversation, not a turn.
    if (j.num_turns !== 1) {
      console.error(`measure-cost: case "${name}" took ${j.num_turns} turns, so it measured more than one request.`);
      process.exit(1);
    }
    const u = j.usage;
    seen.push(u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens);
    spent += j.total_cost_usd ?? 0;
    model ??= Object.keys(j.modelUsage ?? {})[0] ?? null;
  }
  tokens[name] = Math.min(...seen);
  process.stdout.write(`${name.padEnd(9)} ${seen.join(', ')}\n`);
  if (Math.max(...seen) - tokens[name] > SPREAD) {
    console.error(`measure-cost: the runs of "${name}" differ by ${Math.max(...seen) - tokens[name]} ` +
      `tokens, more than ${SPREAD}. Something outside the plugin changed between runs, so ` +
      'nothing was saved. Run it again.');
    process.exit(1);
  }
}
rmSync(work, { recursive: true, force: true });

const parts = {
  plugin: tokens.plugin - tokens.baseline,
  state: tokens.state - tokens.plugin,
  claudeMd: tokens.claudeMd - tokens.state,
  rules: tokens.rules - tokens.claudeMd,
};
const total = tokens.rules - tokens.baseline;
const negative = Object.entries(parts).filter(([, n]) => n < 0);
if (negative.length) {
  console.error(`measure-cost: ${negative.map(([k, n]) => `${k} ${n}`).join(', ')} came out negative, ` +
    'which a part that only adds text cannot do. Nothing was saved. Run it again.');
  process.exit(1);
}

console.log('\nAdded to every turn:');
CASES.slice(1).forEach(([name, what]) => console.log(`  ${String(parts[name]).padStart(5)}  ${what}`));
console.log(`  ${String(total).padStart(5)}  total, in a set-up project\n`);
console.log(`${version}, ${model}, ${RUNS} runs a case, $${spent.toFixed(2)} spent`);

if (WRITE) {
  const out = {
    _about: 'Written by scripts/measure-cost.mjs --write. The README quotes these figures, ' +
      'and validate.mjs warns when "inputs" no longer matches the files that set the cost.',
    measured: new Date().toISOString().slice(0, 10),
    claude: version,
    model,
    runs: RUNS,
    total,
    parts,
    inputs: costFingerprint(root),
  };
  writeFileSync(join(root, COST_FILE), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${COST_FILE}`);
}
