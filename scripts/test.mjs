#!/usr/bin/env node
// Runs the test suite for this repo's own checking machinery.
//
//   node scripts/test.mjs            all suites
//   node scripts/test.mjs validate   only suites whose name contains "validate"
//
// Each suite runs in its own process, all at once. In one process, a test that blocks -
// a synchronous copy, git or a child Node - stopped every other test with it, and the
// planning-gate tests, under a second of work each, waited 74 seconds. Apart, the run
// took 306s before and about a third of that after; see harness.mjs for the rest.
//
// The point of this file is that it runs locally. The tests used to live as bash inside
// the CI workflow, which meant nobody could run them while editing the thing they cover -
// so a check that stopped checking was only ever found after a push, if at all.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUITES = [
  // The harness first: if it reports a hung script as a clean exit, every other suite
  // here goes green while nothing runs.
  ['harness', () => import('../tests/harness.test.mjs')],
  ['validate', () => import('../tests/validate.test.mjs')],
  ['verify', () => import('../tests/verify.test.mjs')],
  ['scripts', () => import('../tests/scripts.test.mjs')],
  ['connect', () => import('../tests/connect.test.mjs')],
  ['providers', () => import('../tests/providers.test.mjs')],
  ['bench', () => import('../tests/bench.test.mjs')],
];

const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const chosen = SUITES.filter(([name]) => !filter.length || filter.some((f) => name.includes(f)));

if (!chosen.length) {
  console.error(`no suite matches ${filter.join(', ')}. Available: ${SUITES.map(([n]) => n).join(', ')}`);
  process.exit(1);
}

// One suite, in this process: what each child below runs.
if (process.argv.includes('--one')) {
  const { runAll, cleanup } = await import('../tests/harness.mjs');
  for (const [, load] of chosen) await load();
  let ok = false;
  try {
    ok = await runAll();
  } finally {
    cleanup();
  }
  process.exit(ok ? 0 : 1);
}

console.log(`running ${chosen.map(([n]) => n).join(', ')}`);
const started = Date.now();
const runSuite = (name) => new Promise((done) => {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--one', name], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => {
    const ok = code === 0;
    const count = Number(out.match(/(\d+) tests? passed|of (\d+) tests failed/)?.slice(1).find(Boolean) ?? 0);
    // A passing suite prints one line; a failing one prints everything it said.
    console.log(ok
      ? `  ok    ${name}: ${out.trim().split('\n').pop()}`
      : `\n--- ${name} FAILED ---\n${out.trim()}\n`);
    done({ name, ok, count, out });
  });
});
const results = await Promise.all(chosen.map(([name]) => runSuite(name)));

// The slowest tests of the whole run, from each suite's own list.
const slow = results.flatMap((r) => [...r.out.matchAll(/^\s+([\d.]+)s {2}(.+)$/gm)]
  .map((m) => ({ s: Number(m[1]), line: `${m[1].padStart(5)}s  ${r.name}: ${m[2]}` })));
console.log('\nslowest:');
for (const t of slow.sort((a, b) => b.s - a.s).slice(0, 5)) console.log(`  ${t.line}`);

const failed = results.filter((r) => !r.ok);
const total = results.reduce((n, r) => n + r.count, 0);
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(failed.length
  ? `\nFAIL - ${failed.map((r) => r.name).join(', ')} failed (${total} tests) in ${secs}s`
  : `\nOK - ${total} tests passed in ${secs}s`);

// A time budget, like the token budget in validate.mjs. Tests are added with almost every
// change, and a run that grows slow one test at a time is never noticed until people stop
// running it. A warning, not a failure: CI machines and laptops differ, and a slow run is
// a reason to look, not a broken build. On GitHub it shows on the pull request.
const BUDGET_S = Number(process.env.EASYCLAUDE_TEST_BUDGET_S || 300);
if (Number(secs) > BUDGET_S) {
  const message = `the tests took ${secs}s, over the ${BUDGET_S}s budget. The slowest are listed above: ` +
    'speed them up, or split them, before adding more.';
  console.log(`\nWARN  ${message}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Slow tests::${message}`);
}
process.exit(failed.length ? 1 : 0);
