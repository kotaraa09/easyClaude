// Tests for the harness itself.
//
// The harness is checking machinery now, so the rule that applies to everything else in
// this repo applies to it: something has to notice when it stops checking.
//
// It nearly did. A killed child reports its exit code as null, and `error.code ?? 0` read
// that as a clean exit - while sixteen of the twenty assertions in this suite are "must
// exit 0". One hung script would have turned the whole suite green with nothing run. That
// is the exact failure the suite exists to catch, one level up, and nothing was watching
// this level.
import {
  test, assert, assertMatch, run, workspace, projectDir, repoRoot,
  readText, writeText, replaceOnce, exists,
} from './harness.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Writes a throwaway script and returns its path, so these cases do not depend on the
// behaviour of any real script in this repo.
function scriptSaying(body) {
  const dir = projectDir();
  const path = join(dir, 'fixture.mjs');
  writeFileSync(path, body);
  return path;
}

// --- the harness must never read a hang as a pass -----------------------------
test('harness: a process killed on a timeout is a failure, not exit 0', async () => {
  const script = scriptSaying('setTimeout(() => {}, 60_000);\n');
  const r = await run(script, { timeoutMs: 500 });
  assert(r.code !== 0,
    'a hung script reported a clean exit. Every "must exit 0" case in this suite would ' +
    'then pass while nothing ran.');
  assert(r.killed === true, 'a killed process must be marked as killed.');
  assertMatch(r.out, /did not exit on its own/,
    'a failing case must say the process was killed, or its report is empty and unreadable.');
});

test('harness: a script that cannot be started is a failure', async () => {
  const r = await run(join(projectDir(), 'no-such-file.mjs'));
  assert(r.code !== 0, 'a script that does not exist must not report a clean exit.');
});

// --- and must report an ordinary exit faithfully -------------------------------
test('harness: an ordinary exit code is passed through', async () => {
  const zero = await run(scriptSaying('process.exit(0);\n'));
  assert(zero.code === 0, `a clean exit must report 0, got ${zero.code}.`);
  assert(zero.killed === false, 'a process that exited on its own is not killed.');

  const two = await run(scriptSaying('process.exit(2);\n'));
  assert(two.code === 2, `exit 2 must report 2, got ${two.code}.`);
});

test('harness: both output streams are captured', async () => {
  const r = await run(scriptSaying(
    'process.stdout.write("on stdout"); process.stderr.write("on stderr");\n'));
  assertMatch(r.stdout, /on stdout/, 'stdout must be captured.');
  assertMatch(r.stderr, /on stderr/, 'stderr must be captured.');
  assertMatch(r.out, /on stdout/, 'the combined output must carry stdout.');
  assertMatch(r.out, /on stderr/, 'the combined output must carry stderr.');
});

test('harness: stdin is closed, so a script reading it does not hang', async () => {
  const r = await run(scriptSaying(
    'let n = 0; process.stdin.on("data", (d) => { n += d.length; });\n' +
    'process.stdin.on("end", () => { process.stdout.write("read " + n); });\n'),
  { input: '{"hello":1}' });
  assert(r.code === 0, `it must finish rather than wait forever:\n${r.out}`);
  assertMatch(r.out, /read 11/, 'the input must reach the script.');
});

// --- a mutation that changes nothing must be refused ---------------------------
// A mutation that silently no-ops leaves the validator passing, which reads as a real
// finding about the validator - the loudest possible false alarm.
test('harness: replaceOnce refuses a target that is not there', async () => {
  const dir = await workspace();
  let threw = null;
  try {
    replaceOnce(dir, 'README.md', 'a phrase that is certainly not in this file', 'x');
  } catch (e) {
    threw = e;
  }
  assert(threw !== null, 'a mutation that would change nothing must throw, not pass quietly.');
  assertMatch(threw.message, /mutation target not found/, 'it must say what it could not find.');
});

test('harness: replaceOnce changes only the first occurrence', () => {
  const dir = projectDir();
  writeText(dir, 'f.txt', 'aa bb aa');
  replaceOnce(dir, 'f.txt', 'aa', 'zz');
  assert(readText(dir, 'f.txt') === 'zz bb aa',
    `it must replace once, got ${JSON.stringify(readText(dir, 'f.txt'))}.`);
});

// --- copies must be independent ------------------------------------------------
// The cases run concurrently. If two of them shared a directory, one mutation would leak
// into another's run and both results would be meaningless.
test('harness: each workspace is a separate copy', async () => {
  const a = await workspace();
  const b = await workspace();
  assert(a !== b, 'two workspaces must not be the same directory.');

  writeText(a, 'README.md', 'mutated in a');
  assert(readText(b, 'README.md') !== 'mutated in a',
    'a mutation in one workspace leaked into another.');
});

test('harness: a workspace is a full copy that the validator can run', async () => {
  const dir = await workspace();
  for (const needed of ['scripts/validate.mjs', 'hooks/hooks.json', 'skills/kickoff/SKILL.md']) {
    assert(exists(dir, needed), `the copy is missing ${needed}, so the validator cannot run in it.`);
  }
  assert(!exists(dir, '.git'), 'the copy must not carry .git - nothing here reads history.');
});

// The time budget in scripts/test.mjs. A budget of 0 makes any run go over it.
test('harness: a run over the time budget warns, on GitHub too, and still passes', async () => {
  const over = await run(join(repoRoot, 'scripts', 'test.mjs'), {
    cwd: repoRoot, args: ['providers'], env: { EASYCLAUDE_TEST_BUDGET_S: '0', GITHUB_ACTIONS: 'true' },
  });
  assert(over.code === 0, `a slow run is a warning, not a failure:\n${over.out}`);
  assertMatch(over.out, /WARN {2}the tests took .* over the 0s budget/, 'the run must say it is over budget.');
  assertMatch(over.out, /::warning title=Slow tests::/, 'on GitHub the warning must reach the pull request.');
  const under = await run(join(repoRoot, 'scripts', 'test.mjs'), {
    cwd: repoRoot, args: ['providers'], env: { EASYCLAUDE_TEST_BUDGET_S: '600', GITHUB_ACTIONS: '' },
  });
  assert(!/WARN/.test(under.out), `a run within the budget must not warn:\n${under.out}`);
});
