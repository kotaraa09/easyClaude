// Behaviour tests for scripts/verify.mjs, the Stop gate.
//
// The gate is the product. Everything else in this framework is advice; this is the one
// piece that stops a turn ending on broken code. It has failed open three ways already -
// it reported OK on failing tests, it let an all-full contract check nothing every turn,
// and a shell phrase in ordinary test output was read as a missing toolchain - so its
// behaviour is pinned here rather than described in a comment.
//
// These run the real scripts/verify.mjs against throwaway project directories. Nothing
// here needs the plugin installed, and nothing writes to this repo.
import { test, assert, assertMatch, projectDir, runVerify } from './harness.mjs';

// Exit codes in hook mode, from Claude Code's hook contract:
const ALLOW = 0;   // the turn may end
const BLOCK = 2;   // the turn is blocked and stderr goes back to the model

// Commands chosen to behave the same under bash and cmd.exe, since the gate runs steps
// through whichever shell the machine has.
const PASSES = 'node -e "process.exit(0)"';
const FAILS = 'node -e "console.error(\'3 tests failed\'); process.exit(1)"';
const MISSING = 'definitely-not-a-real-command-xyz --version';

const hook = (contract, env) => runVerify(projectDir(contract), ['--hook'], env);
const human = (contract, args = []) => runVerify(projectDir(contract), args);

// --- the gate blocks -----------------------------------------------------------
test('gate: a failing step blocks the turn', async () => {
  const r = await hook({ steps: [{ name: 'test', cmd: FAILS }] });
  assert(r.code === BLOCK,
    `a failing contract must block the turn (exit ${BLOCK}), got exit ${r.code}:\n${r.out}`);
  assertMatch(r.stderr, /Verification failed/, 'the block must say why.');
  assertMatch(r.stderr, /\[test\]/, 'the block must name the step that failed.');
  assertMatch(r.stderr, /3 tests failed/, "the block must carry the step's own output back.");
});

test('gate: a passing step allows the turn', async () => {
  const r = await hook({ steps: [{ name: 'test', cmd: PASSES }] });
  assert(r.code === ALLOW, `a passing contract must allow the turn, got exit ${r.code}:\n${r.out}`);
});

test('gate: one failure among passes still blocks', async () => {
  const r = await hook({ steps: [
    { name: 'lint', cmd: PASSES },
    { name: 'test', cmd: FAILS },
    { name: 'build', cmd: PASSES },
  ] });
  assert(r.code === BLOCK, `one failing step must block the turn, got exit ${r.code}:\n${r.out}`);
  assertMatch(r.stderr, /1 of 3/, 'the block must count the failures against the steps run.');
});

// --- a failing test is not a missing toolchain ---------------------------------
// The gate has three outcomes, and the third one was reachable by accident. "Cannot run"
// exists so a missing toolchain does not wedge a session, and it was decided from a phrase
// plus a short output - which ordinary test failures match. Four of the first five below
// passed the gate while it printed OK.
//
// Both directions are asserted, because a fix that blocks on a missing toolchain is a
// different bug, not a fix.
const printsThenFails = (text) =>
  `node -e "process.stderr.write('${text}'); process.exit(1)"`;

// The first five are real failures whose output contains a shell's phrase for a missing
// command. The last three are the second wave: tying the phrase to the program name was
// right, but comparing it as a plain substring was not - "node" sits inside node_modules
// and nodemon, so an ordinary stack trace still passed the gate.
for (const output of [
  'FAIL  src/user.test.ts\\nError: not found',
  'Expected: found\\nReceived: not found',
  '1 failing\\n  AssertionError: not found\\n    at Object.<anonymous>',
  'AssertionError: not found',
  'Error: user not found',
  'FAIL src/a.test.js\\n  at node_modules/lib/x.js: not found',
  'Error in nodemon config: not found',
  '1 failing\\n  module node_modules/foo: not found',
]) {
  test(`gate: blocks on a real failure reading "${output.split('\\n')[0]}"`, async () => {
    const r = await hook({ steps: [{ name: 'test', cmd: printsThenFails(output) }] });
    assert(r.code === BLOCK,
      `this is a failing test, not a missing command. It must block (exit ${BLOCK}), ` +
      `got exit ${r.code}:\n${r.out}`);
  });
}

// The other direction. A machine simply missing a toolchain must not have every session
// wedged, so these warn. The last one only ever failed on Windows: cmd.exe has no
// VAR=value syntax and reports the prefix rather than the program, which is why the check
// reads both names.
for (const cmd of [
  'definitely-not-a-real-command-xyz',
  'definitely-not-a-real-command-xyz --version',
  'npx-not-real run build',
  'CI=1 definitely-not-a-real-command-xyz test',
]) {
  test(`gate: warns instead of blocking on a missing toolchain (${cmd})`, async () => {
    const r = await human({ steps: [{ name: 'step', cmd }] });
    assert(r.code === 0,
      `a missing toolchain must warn, not block. Got exit ${r.code}:\n${r.out}`);
  });
}

test('gate: an unrunnable step is reported rather than passed over', async () => {
  const r = await hook({ steps: [{ name: 'test', cmd: MISSING }] });
  assert(r.code === ALLOW,
    `a missing toolchain must not wedge the session - it warns. Got exit ${r.code}:\n${r.out}`);
  assertMatch(r.out, /could not run/, 'an unrunnable step must be named, not silently skipped.');
});

// --- tiers ---------------------------------------------------------------------
test('gate: a full-tier failure is held back from the per-turn gate', async () => {
  const contract = { steps: [
    { name: 'lint', cmd: PASSES, tier: 'fast' },
    { name: 'e2e', cmd: FAILS, tier: 'full' },
  ] };
  const gate = await hook(contract);
  assert(gate.code === ALLOW,
    `a full-tier step must not run on every turn. Got exit ${gate.code}:\n${gate.out}`);

  const full = await human(contract);
  assert(full.code !== 0,
    `a full run must catch the same failure the per-turn gate held back:\n${full.out}`);
});

test('gate: a contract with every step full says so instead of checking nothing', async () => {
  const r = await hook({ steps: [{ name: 'e2e', cmd: PASSES, tier: 'full' }] });
  assert(r.code === ALLOW, `it cannot block on an empty fast tier. Got exit ${r.code}:\n${r.out}`);
  assertMatch(r.out, /checking nothing/,
    'a gate that runs nothing every turn must announce itself, or nobody notices it is off.');
});

test('gate: an unknown tier is reported rather than silently demoting a step', async () => {
  const r = await hook({ steps: [{ name: 'test', cmd: FAILS, tier: 'smoke' }] });
  // The gate reports through a JSON systemMessage, so the quotes arrive escaped.
  assertMatch(r.out, /tier \\?"smoke/, 'a mistyped tier must be named, not defaulted.');
});

// --- the escape hatch is loud ---------------------------------------------------
test('gate: the skip switch allows the turn and announces itself', async () => {
  const r = await hook({ steps: [{ name: 'test', cmd: FAILS }] }, { EASYCLAUDE_SKIP_VERIFY: '1' });
  assert(r.code === ALLOW, `the skip switch must allow the turn. Got exit ${r.code}:\n${r.out}`);
  assertMatch(r.out, /EASYCLAUDE_SKIP_VERIFY/,
    'switching the gate off silently is the dead gate this framework exists to prevent.');
  assertMatch(r.out, /Do not describe this work as verified/,
    'the model must be told the work was not checked.');
});

// --- a broken or absent contract never wedges a session -------------------------
test('gate: no contract allows the turn and says how to get one', async () => {
  const r = await hook(undefined);
  assert(r.code === ALLOW, `a project with no contract must not be blocked. Got exit ${r.code}.`);
  assertMatch(r.out, /kickoff/, 'it must point at the skill that writes a contract.');
});

test('gate: a contract that is not valid JSON is reported, not thrown', async () => {
  const dir = projectDir({ steps: [] });
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  writeFileSync(join(dir, '.claude', 'verify.json'), '{ "steps": [ }}}');
  const r = await runVerify(dir, ['--hook']);
  assert(r.code === ALLOW, `a malformed contract must not block every turn. Got exit ${r.code}.`);
  assertMatch(r.out, /not valid JSON/, 'it must say the contract is malformed.');
  assert(!/SyntaxError|at JSON\.parse/.test(r.out), `it must report, not throw:\n${r.out}`);
});

test('gate: a step with no command is reported', async () => {
  const r = await hook({ steps: [{ name: 'test' }] });
  assert(r.code === ALLOW, 'a malformed contract must not block every turn.');
  assertMatch(r.out, /no \\?"cmd/, 'it must say which part of the contract is wrong.');
});

// --- human mode -----------------------------------------------------------------
test('gate: a human run exits non-zero on failure and zero on success', async () => {
  const bad = await human({ steps: [{ name: 'test', cmd: FAILS }] });
  assert(bad.code !== 0, `a failing contract must exit non-zero for a human run:\n${bad.out}`);

  const good = await human({ steps: [{ name: 'test', cmd: PASSES }] });
  assert(good.code === 0, `a passing contract must exit zero for a human run:\n${good.out}`);
});

test('gate: --fast runs the fast tier and says what it held back', async () => {
  const r = await human({ steps: [
    { name: 'lint', cmd: PASSES, tier: 'fast' },
    { name: 'e2e', cmd: FAILS, tier: 'full' },
  ] }, ['--fast']);
  assert(r.code === 0, `--fast must not run the full tier. Got exit ${r.code}:\n${r.out}`);
  assertMatch(r.out, /e2e|full/, '--fast must say that something was held back.');
});

test('gate: --list names the steps without running them', async () => {
  const r = await human({ steps: [{ name: 'unique-step-name', cmd: FAILS }] }, ['--list']);
  assert(r.code === 0, `--list must not run the steps. Got exit ${r.code}:\n${r.out}`);
  assertMatch(r.out, /unique-step-name/, '--list must name the steps.');
});
