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
import { test, assert, assertMatch, projectDir, runVerify, run, repoRoot } from './harness.mjs';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

// --- a failure blocks once per state of the tree -------------------------------
// The block message tells Claude to stop and report when a step cannot pass. The gate
// used to block that report as well, eight times in one test run, until Claude Code's
// block cap ended the turn with an empty reply. These pin the rule that replaced it.
const repeat = async () => {
  const dir = projectDir({ steps: [{ name: 'test', cmd: FAILS }] });
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  writeFileSync(join(dir, 'app.js'), 'export const x = 1;\n');
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'start');
  writeFileSync(join(dir, 'app.js'), 'export const x = 2;\n');
  const call = (active, session = 's1') => run(join(repoRoot, 'scripts', 'verify.mjs'), {
    cwd: dir, args: ['--hook'],
    env: { CLAUDE_PROJECT_DIR: dir, EASYCLAUDE_SKIP_VERIFY: '' },
    input: JSON.stringify({ session_id: session, stop_hook_active: active }),
  });
  return { dir, call };
};

test('gate: a second block with nothing changed lets the turn end, and says it is not verified', async () => {
  const { call } = await repeat();
  const first = await call(false);
  assert(first.code === BLOCK, `the first failure must block:\n${first.out}`);
  const second = await call(true);
  assert(second.code === ALLOW, `nothing changed, so blocking again cannot help:\n${second.out}`);
  assertMatch(second.out, /still failing.*not verified/s, 'the turn may end, but never quietly.');
});

test('gate: an edit after a block is checked again, and blocks again', async () => {
  const { dir, call } = await repeat();
  await call(false);
  writeFileSync(join(dir, 'app.js'), 'export const x = 3;\n');
  const again = await call(true);
  assert(again.code === BLOCK, `an edit that still fails must be sent back:\n${again.out}`);
});

test('gate: a new session is not let through by an old one', async () => {
  const { call } = await repeat();
  await call(false, 'old');
  const fresh = await call(true, 'new');
  assert(fresh.code === BLOCK, `another session's block must not count:\n${fresh.out}`);
});

// A project already broken when the session opened. In a rescue test, a turn where Claude
// only asked "may I restore last night's version?" was blocked on tests that failed before
// the session began, and the user's last message was about the gate, not the plan.
test('gate: a turn that changed nothing since the session opened is not checked', async () => {
  const { dir, call } = await repeat();
  await run(join(repoRoot, 'scripts', 'session-start.mjs'), {
    cwd: dir, env: { CLAUDE_PROJECT_DIR: dir }, input: JSON.stringify({ session_id: 's1' }),
  });
  const quiet = await call(false);
  assert(quiet.code === ALLOW, `nothing changed since the session opened:\n${quiet.out}`);
  writeFileSync(join(dir, 'app.js'), 'export const x = 4;\n');
  const edited = await call(false);
  assert(edited.code === BLOCK, `an edit in the same session must still be checked:\n${edited.out}`);
});

// Compaction fires SessionStart in the middle of a task. It used to record the tree as the
// session's starting point, so an edit that broke the build before the compaction passed
// the next check as "nothing changed since the session opened".
test('gate: a compaction does not wave through an edit made before it', async () => {
  const { dir, call } = await repeat();
  const start = (source) => run(join(repoRoot, 'scripts', 'session-start.mjs'), {
    cwd: dir, env: { CLAUDE_PROJECT_DIR: dir }, input: JSON.stringify({ session_id: 's1', source }),
  });
  await start('startup');
  writeFileSync(join(dir, 'app.js'), 'export const x = 5;\n');
  await start('compact');
  const after = await call(false);
  assert(after.code === BLOCK, `the edit came before the compaction, and must still be checked:\n${after.out}`);
});

// --- work left for later -------------------------------------------------------
// The two-session benchmark: a gate block on a test pulled the turn away, and day one
// ended with four requests written nowhere. The Stop hook now holds the turn once.
const laterProject = () => {
  const dir = projectDir({ steps: [{ name: 'ok', cmd: 'node -e ""' }] });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'STATE.md'), '# State\n\n## Next\n');
  return dir;
};
const askLater = (dir, session) => run(join(repoRoot, 'scripts', 'prompt-check.mjs'), {
  cwd: dir, env: { CLAUDE_PROJECT_DIR: dir },
  input: JSON.stringify({ prompt: "just the first one, we'll do the rest tomorrow", session_id: session }),
});
const stop = (dir, session) => run(join(repoRoot, 'scripts', 'verify.mjs'), {
  cwd: dir, args: ['--hook'], env: { CLAUDE_PROJECT_DIR: dir, EASYCLAUDE_SKIP_VERIFY: '' },
  input: JSON.stringify({ session_id: session, stop_hook_active: false }),
});

test('gate: work left for later with STATE.md unchanged is held once, then let go', async () => {
  const dir = laterProject();
  const session = `later-${Date.now()}-${Math.random()}`;
  await askLater(dir, session);
  const first = await stop(dir, session);
  assert(first.code === BLOCK, `an unwritten plan must hold the turn:\n${first.out}`);
  assertMatch(first.out, /top of ## Next/, 'the block must say what to write, and where.');
  const second = await stop(dir, session);
  assert(second.code === ALLOW, `once only - a passing mention of "later" must not loop:\n${second.out}`);
});

test('gate: work left for later that STATE.md records is not held', async () => {
  const dir = laterProject();
  const session = `later-${Date.now()}-${Math.random()}`;
  await askLater(dir, session);
  writeFileSync(join(dir, 'docs', 'STATE.md'), '# State\n\n## Next\n- [ ] WELCOME5 takes $5 off (asked 2026-09-26)\n');
  const r = await stop(dir, session);
  assert(r.code === ALLOW, `the plan was written, so nothing to hold:\n${r.out}`);
});

// --- a web page that changed must be looked at --------------------------------
// For a website, a beginner's "done" is "I opened it and it works". The gate holds a turn
// that changed a page and never looked at it, once per message. See look-check.mjs.
const prompt = (text, id = 'p1') => ({ type: 'user', promptId: id, message: { role: 'user', content: text } });
const used = (name, input = {}) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });
const feedback = { type: 'user', promptId: 'p1', message: { role: 'user', content: 'Stop hook feedback:\nVerification failed.' } };

const lookProject = (contract, { web = true, files = {} } = {}) => {
  const dir = projectDir(contract);
  if (web) writeFileSync(join(dir, 'index.html'), '<button id="pay">Pay</button>\n');
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
};
const lookStop = (dir, entries, session = `look-${Date.now()}-${Math.random()}`) => {
  const transcript = join(dir, '..', `${session}.jsonl`);
  writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return run(join(repoRoot, 'scripts', 'verify.mjs'), {
    cwd: dir, args: ['--hook'], env: { CLAUDE_PROJECT_DIR: dir, EASYCLAUDE_SKIP_VERIFY: '' },
    input: JSON.stringify({ session_id: session, transcript_path: transcript, stop_hook_active: false }),
  });
};
const PASSING = { steps: [{ name: 'test', cmd: PASSES }] };

test('look: a changed page nobody looked at is held once, then let go', async () => {
  const dir = lookProject(PASSING);
  const session = `look-${Date.now()}-${Math.random()}`;
  const turn = [prompt('the pay button does nothing'), used('Edit', { file_path: join(dir, 'src', 'checkout.js') })];
  const first = await lookStop(dir, turn, session);
  assert(first.code === BLOCK, `a changed page must be looked at before the turn ends:\n${first.out}`);
  assertMatch(first.stderr, /browser tool/, 'the hold must say how to look.');
  assertMatch(first.stderr, /no browser tool, do not search for one/, 'with no browser, it must not send Claude hunting.');
  assertMatch(first.stderr, /the page is index\.html/, 'the real page must be named: one run sent a beginner to a checkout.html that does not exist.');
  assertMatch(first.stderr, /start it with one\s+line on what you changed/,
    'the reply to the hold is the last message: in the typo case it said only how to open the page, and never which word was fixed.');
  const second = await lookStop(dir, turn, session);
  assert(second.code === ALLOW, `once per message - a turn that cannot look must not loop:\n${second.out}`);
});

test('look: a turn that used a browser tool is not held', async () => {
  const dir = lookProject(PASSING);
  for (const tool of ['mcp__Claude_Browser__computer', 'mcp__playwright__browser_take_screenshot', 'mcp__claude-in-chrome__navigate']) {
    const r = await lookStop(dir, [prompt('fix the button'), used('Edit', { file_path: join(dir, 'index.html') }), used(tool)]);
    assert(r.code === ALLOW, `${tool} looked at the page, so nothing to hold:\n${r.out}`);
  }
});

test('look: gate feedback is not the user, so an edit before it still counts', async () => {
  const dir = lookProject(PASSING);
  const r = await lookStop(dir, [prompt('make the title green'), used('Edit', { file_path: join(dir, 'style.css') }),
    feedback, used('Edit', { file_path: join(dir, 'tests', 'page.test.mjs') })]);
  assert(r.code === BLOCK, `the page changed in this turn, before the gate spoke:\n${r.out}`);
});

test('look: no hold for a test-only edit, a project with no page, "look": false, or cheap mode', async () => {
  const cases = [
    ['a test-only edit', lookProject(PASSING), 'tests/cart.test.mjs'],
    ['a project with no page', lookProject(PASSING, { web: false }), 'src/cart.js'],
    ['"look": false', lookProject({ ...PASSING, look: false }), 'index.html'],
    ['cheap mode', lookProject(PASSING, { files: { '.claude/cheap-session': '2026-09-29' } }), 'index.html'],
  ];
  for (const [what, dir, file] of cases) {
    const r = await lookStop(dir, [prompt('change it'), used('Write', { file_path: join(dir, file) })]);
    assert(r.code === ALLOW, `${what} must not be held:\n${r.out}`);
  }
});

test('look: a cheap-session file the repo commits does not switch the page check off', async () => {
  const dir = lookProject(PASSING, { files: { '.claude/cheap-session': '2026-09-29' } });
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'from the repo');
  writeFileSync(join(dir, 'index.html'), '<button id="pay">Pay now</button>\n');
  const r = await lookStop(dir, [prompt('change it'), used('Write', { file_path: join(dir, 'index.html') })]);
  assert(r.code === BLOCK, `a cheap-session that came with the repo is not this user's cheap mode:\n${r.out}`);
});

test('look: a React project with no index.html is still a web project', async () => {
  const dir = lookProject(PASSING, { web: false, files: { 'package.json': JSON.stringify({ dependencies: { react: '^19' }, scripts: { dev: 'vite' } }) } });
  const r = await lookStop(dir, [prompt('add a footer'), used('Edit', { file_path: join(dir, 'src', 'App.tsx') })]);
  assert(r.code === BLOCK, `a React app is a page too:\n${r.out}`);
  assertMatch(r.stderr, /npm run dev/, 'an app with a dev server is opened through it.');
});

test('look: a plain website with no contract is held too', async () => {
  const r = await lookStop(lookProject(undefined), [prompt('rename the shop'), used('Edit', { file_path: 'index.html' })]);
  assert(r.code === BLOCK, `no contract is where nothing else checks the page:\n${r.out}`);
});

test('look: failing checks report the failure, not the page', async () => {
  const dir = lookProject({ steps: [{ name: 'test', cmd: FAILS }] });
  const r = await lookStop(dir, [prompt('fix the button'), used('Edit', { file_path: join(dir, 'index.html') })]);
  assertMatch(r.stderr, /Verification failed/, 'a broken build comes first.');
  assert(!/nothing looked at the page/.test(r.stderr), `do not ask to look at a page that fails its checks:\n${r.out}`);
});

// Four Thai runs of six on 2026-10-02 got their "how to see it" line in English, and one in
// Japanese, after this hold. Every hold now goes through language.mjs.
test('language: a hold for a Thai user names the language, one for an English user does not', async () => {
  const dir = lookProject(PASSING);
  const th = await lookStop(dir, [prompt('เปลี่ยนชื่อร้านเป็น Green Corner ทุกหน้า'), used('Edit', { file_path: join(dir, 'index.html') })]);
  assert(th.code === BLOCK, `the page changed, so the turn is held:\n${th.out}`);
  assertMatch(th.stderr, /language of the user's message/, 'a Thai user must get the language line with the hold.');
  assertMatch(th.stderr, /begins: "เปลี่ยนชื่อร้าน/, 'the hold must quote the start of the message, so Claude does not guess a language.');
  const en = await lookStop(dir, [prompt('rename the shop to Green Corner'), used('Edit', { file_path: join(dir, 'index.html') })]);
  assert(en.code === BLOCK && !/language of the user's message/.test(en.stderr),
    `an English user gets no language line, which once read as "reply in another language":\n${en.stderr}`);
});

test('language: a failing check is held in the user\'s language too', async () => {
  const dir = projectDir({ steps: [{ name: 'test', cmd: FAILS }] });
  const r = await lookStop(dir, [prompt('ถ้าไม่ใส่โค้ดส่วนลด หน้าชำระเงินจะพัง')]);
  assert(r.code === BLOCK, `a failing step holds the turn:\n${r.out}`);
  assertMatch(r.stderr, /language of the user's message/, 'the failure report must carry the language line.');
});

// The structural half: a hold written straight to stderr skips the language line, which is
// how the page check went out English-only. Only hold() may end a turn with exit 2.
test('language: verify.mjs holds a turn in one place only', () => {
  const src = readFileSync(join(repoRoot, 'scripts', 'verify.mjs'), 'utf8');
  const exits = src.match(/process\.exit\(2\)/g) ?? [];
  const writes = src.match(/process\.stderr\.write\(/g) ?? [];
  assert(exits.length === 1 && writes.length === 1,
    `found ${exits.length} exit(2) and ${writes.length} stderr writes - send every hold through hold(), so it gets the user's language.`);
});
