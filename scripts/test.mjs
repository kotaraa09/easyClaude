#!/usr/bin/env node
// Runs the test suite for this repo's own checking machinery.
//
//   node scripts/test.mjs            all suites
//   node scripts/test.mjs validate   only suites whose name contains "validate"
//
// The point of this file is that it runs locally. The tests used to live as bash inside
// the CI workflow, which meant nobody could run them while editing the thing they cover -
// so a check that stopped checking was only ever found after a push, if at all.
import { runAll, cleanup } from '../tests/harness.mjs';

const SUITES = [
  // The harness first: if it reports a hung script as a clean exit, every other suite
  // here goes green while nothing runs.
  ['harness', () => import('../tests/harness.test.mjs')],
  ['validate', () => import('../tests/validate.test.mjs')],
  ['verify', () => import('../tests/verify.test.mjs')],
  ['scripts', () => import('../tests/scripts.test.mjs')],
  ['connect', () => import('../tests/connect.test.mjs')],
];

const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const chosen = SUITES.filter(([name]) => !filter.length || filter.some((f) => name.includes(f)));

if (!chosen.length) {
  console.error(`no suite matches ${filter.join(', ')}. Available: ${SUITES.map(([n]) => n).join(', ')}`);
  process.exit(1);
}

for (const [, load] of chosen) await load();

console.log(`running ${chosen.map(([n]) => n).join(', ')}`);
let ok = false;
try {
  ok = await runAll();
} finally {
  cleanup();
}
process.exit(ok ? 0 : 1);
