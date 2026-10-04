// Tests for the other scripts this repo ships.
//
// These were bash steps inside the CI workflow. They are ported here so they run on a
// laptop before a push, not only after one - which is the whole reason the checking
// machinery kept breaking without anyone seeing it.
import { test, assert, assertMatch, run, repoRoot, projectDir } from './harness.mjs';
import { readEnv } from '../scripts/env.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = (name) => join(repoRoot, 'scripts', name);

// --- every entry point still starts ------------------------------------------
// `node --check` in the validator catches syntax and nothing else, so a bad import path
// or a missing export passed every check and shipped. Actually invoking each entry point
// is the cheapest thing that would have caught it.
for (const [name, args] of [
  ['connect.mjs', ['--list']],
  ['connect.mjs', ['--form']],
  ['connect.mjs', ['--status']],
  ['gen/generate.mjs', ['--list']],
  ['verify.mjs', ['--list']],
  ['session-start.mjs', ['--text']],
  ['prompt-check.mjs', []],
  ['validate.mjs', []],
  ['bench.mjs', ['--help']],
]) {
  test(`entry point: node scripts/${name} ${args.join(' ')} runs`, async () => {
    const r = await run(script(name), { cwd: repoRoot, args });
    assert(r.code === 0, `it exited ${r.code}:\n${r.out}`);
  });
}

// --- the .env reader ----------------------------------------------------------
// There were two readers and they disagreed. An indented key was present to one and
// missing to the other, and both folded a trailing comment into the secret - so a
// corrupted key went into the user's config and failed later, somewhere unrelated.
test('env: every form of a line is read the same way', () => {
  const dir = projectDir();
  writeFileSync(join(dir, '.env'), [
    'PLAIN=abc123',
    '  INDENTED=def456',
    'export EXPORTED=ghi789',
    'COMMENTED=jkl012 # this is a note, not part of the key',
    'QUOTED="mno345 # inside quotes"',
    'HASH_IN_VALUE=postgres://u:p#w@localhost:5432/db',
    'BLANK=',
    'PLACEHOLDER=<your key here>',
    '',
  ].join('\n'));

  const { values, exists } = readEnv(dir);
  assert(exists, 'the reader must see the file it was pointed at.');

  for (const [key, want] of Object.entries({
    PLAIN: 'abc123',
    INDENTED: 'def456',
    EXPORTED: 'ghi789',
    COMMENTED: 'jkl012',
    QUOTED: 'mno345 # inside quotes',
    HASH_IN_VALUE: 'postgres://u:p#w@localhost:5432/db',
  })) {
    assert(values.get(key) === want,
      `${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(values.get(key))}`);
  }

  // An unfilled line must read as absent, or --status reports a literal placeholder as a key.
  for (const key of ['BLANK', 'PLACEHOLDER']) {
    assert(!values.has(key), `${key} must be treated as unset, not as a value.`);
  }
});

test('env: a missing .env is an absence, not an error', () => {
  const { values, exists } = readEnv(projectDir());
  assert(exists === false, 'it must report the file as absent.');
  assert(values.size === 0, 'it must return no values.');
});

// --- the connector form is the template ---------------------------------------
// They are the same text in two places, so adding a provider silently staled the template
// that every fork starts from.
test('connect: the generated form still matches template/.env.example', async () => {
  const MARK = '--- easyClaude connectors';
  const from = (text) => {
    const at = text.indexOf(MARK);
    assert(at !== -1, `the "${MARK}" marker is missing - it is what joins these two files.`);
    return text.slice(at).trimEnd();
  };
  const r = await run(script('connect.mjs'), { cwd: repoRoot, args: ['--form'] });
  assert(r.code === 0, `connect.mjs --form exited ${r.code}:\n${r.out}`);
  const generated = from(r.stdout);
  const shipped = from(readFileSync(join(repoRoot, 'template', '.env.example'), 'utf8'));
  assert(generated === shipped,
    'template/.env.example is stale. Regenerate it with: node scripts/connect.mjs --form');
});

// The Postgres connector was removed on 2026-10-04. Anyone who wired it still has it, and
// their DATABASE_URL now does nothing, so the script has to say so - by name, never value.
test('connect: a key for a removed connector is named with the way to take it out', async () => {
  const dir = projectDir();
  const secret = 'postgres://u:hunter2@localhost:5432/shop';
  writeFileSync(join(dir, '.env'), `DATABASE_URL=${secret}\n`);
  for (const args of [['--status'], ['--apply', '--dry-run']]) {
    const r = await run(script('connect.mjs'), { cwd: dir, args });
    assertMatch(r.out, /claude mcp remove postgres -s local/, `${args.join(' ')} must name the way out.`);
    assert(!r.out.includes('hunter2'), `${args.join(' ')} printed the value of a key:\n${r.out}`);
  }
  writeFileSync(join(dir, '.env'), 'CONTEXT7_API_KEY=abc\n');
  const quiet = await run(script('connect.mjs'), { cwd: dir, args: ['--status'] });
  assert(!/postgres/.test(quiet.out), `with no DATABASE_URL there is nothing to say:\n${quiet.out}`);
});

// --- a connector's one-time local step is actually shown ----------------------
// graft is wired as an MCP server, but its tools return nothing until `graft build` has
// run once in the project. That step lives in the catalog as `note`. A note nobody prints
// is the same as no note: the server gets added, every tool answers empty, and it looks
// like the connector is broken. So pin that both the place a connector is chosen and the
// place it is wired say the step out loud.
for (const args of [['--list'], ['--apply', '--dry-run']]) {
  test(`connect: ${args.join(' ')} prints the one-time step a connector needs`, async () => {
    const r = await run(script('connect.mjs'), { cwd: repoRoot, args });
    assert(r.code === 0, `connect.mjs ${args.join(' ')} exited ${r.code}:
${r.out}`);
    assertMatch(r.stdout, /graft@[\d.]+ build/,
      'the graft entry carries a note naming the one-time build, and this output drops it.');
    assertMatch(r.stdout, /DO_NOT_TRACK/,
      'graft sends a usage ping. The catalog says so, and this output must not hide it.');
    // inspo is wired to its 9-tool profile rather than its 15-tool one. That is a default
    // this framework chose, not one upstream ships, so the output has to say both that it
    // was chosen and how to undo it - otherwise six tools are missing and nothing explains it.
    assertMatch(r.stdout, /INSPO_PROFILE=full/,
      'inspo is wired to the smaller tool set. The way back to the full one must be printed.');
  });
}

// --- the generator cannot write outside the project ---------------------------
// It resolved --out against cwd and used it unchecked, so it wrote outside the project and
// into .git - past the Edit(./.git/**) rule this repo ships. A guardrail routed around by
// one of its own scripts is worse than no guardrail.
const tryOut = (cwd, out) => run(script('gen/generate.mjs'), {
  cwd,
  args: ['--kind', 'image', '--prompt', 'p', '--out', out, '--dry-run'],
});

// The case variants are not padding. Windows and macOS mount case-insensitive
// filesystems, so ".GIT/hooks/pre-commit" reached the real .git while the guard compared
// the exact string ".git". A nested ".git" is a submodule's, and is refused for the same
// reason as the one at the root.
for (const out of [
  '../../escaped.png',
  'sub/../../escaped.png',
  '.git/hooks/pre-commit',
  '.GIT/hooks/pre-commit',
  '.Git/hooks/pre-commit',
  'public/../.git/x.png',
  'vendor/lib/.git/config',
]) {
  test(`generate: --out ${out} is refused`, async () => {
    const r = await tryOut(projectDir(), out);
    assertMatch(r.out, /^error:/m,
      `--out "${out}" was accepted. It writes outside the project, or past a guardrail.`);
  });
}

for (const out of ['public/hero.png', 'assets/deep/nested/img.webp']) {
  test(`generate: --out ${out} is accepted`, async () => {
    const r = await tryOut(projectDir(), out);
    assert(!/^error:/m.test(r.out),
      `--out "${out}" was refused. An ordinary path inside the project must work:\n${r.out}`);
  });
}

// --- the skill scanner gate ---------------------------------------------------
// /easyclaude:skills hands people other people's repositories and tells them to install
// one, so a scanner runs in front of it. These pin the three ways that gate can lie.
import { verdict, present, run as spawnRunner, runners } from '../scripts/skillscan.mjs';

// The bug this was written for. On Windows a missing command gives ENOENT, the shell
// fallback retries it through cmd.exe, and cmd.exe answers "not recognized" with exit
// status 1 and no error object. Status 1 is SkillSpector's own code for "scored above 50",
// so a machine with no scanner installed was told its skill was dangerous. A gate that
// invents findings when it is absent teaches people the verdict is noise.
test('skillscan: a missing command on Windows is absent, not a failing scan', () => {
  const spawn = (bin, argv, opts) => (opts?.shell
    ? { status: 1, stdout: '', stderr: `'${bin}' is not recognized as an internal or external command,\n` }
    : { error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) });
  const r = spawnRunner('skillspector', ['--version'], { platform: 'win32', spawn });
  assert(r.launched === true, 'cmd.exe did answer, so the call did launch - that part is real');
  assert(present(r) === false,
    'a shell saying "not recognized" must read as absent. Reading it as a scan result is how ' +
    'a machine with no scanner got told its skill was dangerous.');
});

test('skillscan: a real scanner answering --version reads as present', () => {
  const spawn = () => ({ status: 0, stdout: 'skillspector 1.2.3\n', stderr: '' });
  assert(present(spawnRunner('skillspector', ['--version'], { spawn })) === true,
    'exit 0 with output is the only shape that counts as installed.');
});

// SkillSpector's contract, not one invented here: 0 is scored 50 or less, 1 is above 50,
// 2 is could-not-scan. Exit 2 must never read as a clean bill - that is the scanner
// failing, which is the exact case this gate exists for.
for (const [name, input, ok, label] of [
  ['a clean report', { status: 0, stdout: '{"risk_assessment":{"recommendation":"SAFE","risk_score":4}}' }, true, 'SAFE'],
  ['a caution report', { status: 0, stdout: '{"risk_assessment":{"recommendation":"CAUTION","risk_score":31}}' }, true, 'CAUTION'],
  ['a refusal', { status: 1, stdout: '{"risk_assessment":{"recommendation":"DO_NOT_INSTALL","risk_score":74}}' }, false, 'DO NOT INSTALL'],
  ['a scanner error', { status: 2, stdout: 'Traceback (most recent call last):' }, false, 'SCAN FAILED'],
]) {
  test(`skillscan: ${name} reads as ${label}`, () => {
    const v = verdict(input);
    assert(v.label === label, `expected ${label}, got ${v.label}`);
    assert(v.ok === ok, `expected ok=${ok} for ${label}, got ${v.ok}`);
  });
}

test('skillscan: SKILLSPECTOR_BIN is tried before anything on PATH', () => {
  const list = runners({ SKILLSPECTOR_BIN: '/opt/venv/bin/skillspector' });
  assert(list[0].bin === '/opt/venv/bin/skillspector',
    'a named binary must win, or a virtualenv install is unreachable.');
  assert(runners({})[0].bin === 'skillspector', 'with no override, PATH comes first.');
});

// Fails closed. A gate that waves things through when it cannot see them is decoration,
// so "no scanner" must not exit 0 unless the user said so in the command line.
test('skillscan: no scanner refuses, and says how to get one', async () => {
  const r = await run(script('skillscan.mjs'), { cwd: repoRoot, args: ['./skills/slopmonster'] });
  assert(r.code !== 0, `it exited 0 with no scanner present:\n${r.out}`);
  assertMatch(r.out, /uv tool install/, 'refusing without naming the fix leaves people stuck.');
});

test('skillscan: --allow-unscanned passes, and says it was not scanned', async () => {
  const r = await run(script('skillscan.mjs'), {
    cwd: repoRoot, args: ['./skills/slopmonster', '--allow-unscanned'],
  });
  assert(r.code === 0, `the documented override did not pass:\n${r.out}`);
  assertMatch(r.out, /NOT SCANNED/, 'an unscanned install must say so, not go quiet.');
});

// --- the session opener -------------------------------------------------------
// It was a prompt hook that Claude Code refuses on SessionStart, so for every release up
// to 0.1.2 no session opened the way the README says. Each branch is pinned here, because
// the branch it takes is now decided by this script and nothing else.
const opener = async (files, args = ['--text']) => {
  const dir = projectDir();
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return run(script('session-start.mjs'), { cwd: dir, args, env: { CLAUDE_PROJECT_DIR: dir } });
};
// Makes dir a git repository and commits everything in it, as a cloned repo would arrive.
const commitAll = (dir) => {
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'from the repo');
};
const writeAll = (dir, files) => {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
};
const STATE = [
  '# State', '', '## Now', '- [ ] Add the contact form', '', '## Next',
  '### Gallery', '- [x] Pick a layout', '- [ ] Upload photos', '', '## Blocked', 'none', '',
  '## Debt', '<!-- a comment, not an entry -->', '- Images are not resized', '- No alt text', '',
  '## Done', '- Set up the project', '',
].join('\n');

test('session-start: an empty folder goes straight to kickoff', async () => {
  const r = await opener({});
  assert(r.code === 0, `it exited ${r.code}:\n${r.out}`);
  assertMatch(r.out, /Invoke the `kickoff` skill/, 'a new project must reach setup on its own.');
});

test('session-start: a fresh template fork goes to kickoff, not the opener', async () => {
  const stub = readFileSync(join(repoRoot, 'template', 'docs', 'STATE.md'), 'utf8');
  const r = await opener({ 'docs/STATE.md': stub, 'CLAUDE.md': '# x', 'design/tokens.md': '' });
  assertMatch(r.out, /Invoke the `kickoff` skill/,
    'the template ships a state file, and only the marker says it was never set up.');
});

test('session-start: code with no state offers adopt mode, and does not start the interview', async () => {
  const r = await opener({ 'package.json': '{}' });
  assertMatch(r.out, /adopt mode/, 'an existing codebase must be offered adopt mode.');
  assertMatch(r.out, /Do not start its interview unless/, 'the interview must wait for a yes.');
});

test('session-start: a set-up project opens with its state, read by the script', async () => {
  const r = await opener({ 'docs/STATE.md': STATE, 'index.html': '' });
  assertMatch(r.out, /\*\*Now:\*\* Add the contact form/, 'Now must be the task in progress.');
  assertMatch(r.out, /\*\*Next:\*\* Upload photos/, 'Next must skip ticked tasks and headings.');
  assertMatch(r.out, /\*\*Blocked:\*\* none/, 'Blocked must read back as written.');
  assertMatch(r.out, /\*\*Debt:\*\* 2 items/, 'a comment inside Debt is not an entry.');
  assert(!/kickoff/.test(r.out), `a set-up project must not be sent to kickoff:\n${r.out}`);
});

test('session-start: no debt means no Debt line', async () => {
  const r = await opener({ 'docs/STATE.md': STATE.replace(/## Debt[\s\S]*?## Done/, '## Debt\n\n## Done') });
  assert(!/\*\*Debt:\*\*/.test(r.out), `an empty Debt section still printed a line:\n${r.out}`);
});

test('session-start: armed cheap mode and autoship are both announced', async () => {
  const r = await opener({
    'docs/STATE.md': STATE,
    '.claude/cheap-session': '2026-09-23',
    '.claude/cheap-contract.md': 'Smallest fix that works.',
    '.claude/autoship.json': JSON.stringify({ enabled: true, through: 'pr' }),
  });
  assertMatch(r.out, /cheap mode is on[\s\S]*Smallest fix that works/, 'the contract must ride along.');
  assertMatch(r.out, /Autoship is armed through "pr"/, 'a session that can push must say so.');
});

// After a compaction Claude is mid-task, often mid-turn. "Start your first reply with"
// there put the Now/Next block in the middle of the work.
test('session-start: after a compaction only the standing rules come back', async () => {
  const dir = projectDir();
  const files = {
    'docs/STATE.md': STATE,
    '.claude/cheap-session': '2026-09-23',
    '.claude/cheap-contract.md': 'Smallest fix that works.',
    '.claude/autoship.json': JSON.stringify({ enabled: true, through: 'pr' }),
  };
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  const r = await run(script('session-start.mjs'), {
    cwd: dir, env: { CLAUDE_PROJECT_DIR: dir }, input: JSON.stringify({ session_id: 's1', source: 'compact' }),
  });
  const context = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert(!/first reply/.test(context), `a compaction asked for a first-reply line:\n${context}`);
  assert(!/\*\*Now:\*\*/.test(context), `a compaction repeated the opener:\n${context}`);
  assertMatch(context, /Smallest fix that works/, 'the cheap contract must survive the compaction.');
  assertMatch(context, /language of the user's own messages/, 'the language rule must survive the compaction.');
});

test('session-start: a disabled autoship says nothing', async () => {
  const r = await opener({
    'docs/STATE.md': STATE, '.claude/autoship.json': JSON.stringify({ enabled: false, through: 'merge' }),
  });
  assert(!/Autoship/.test(r.out), `a disabled autoship was announced:\n${r.out}`);
});

// .gitignore keeps these files out of an honest owner's commits, but a repository can still
// ship them. A copy that came with the code is not this user's choice. See personal.mjs.
const PERSONAL = {
  '.claude/cheap-session': '2026-09-23',
  '.claude/cheap-contract.md': 'Smallest fix that works.',
  '.claude/autoship.json': JSON.stringify({ enabled: true, through: 'merge' }),
};
const openIn = (dir) => run(script('session-start.mjs'), { cwd: dir, args: ['--text'], env: { CLAUDE_PROJECT_DIR: dir } });

test('session-start: autoship and cheap files the repo commits arm nothing, and the user is told', async () => {
  const dir = projectDir();
  writeAll(dir, { 'docs/STATE.md': STATE, ...PERSONAL });
  commitAll(dir);
  const r = await openIn(dir);
  assert(!/Autoship is armed/.test(r.out), `a committed autoship.json armed autoship:\n${r.out}`);
  assert(!/cheap mode is on|Smallest fix that works/.test(r.out),
    `a committed contract rode along as standing instructions:\n${r.out}`);
  assertMatch(r.out, /ignored these files: \.claude\/autoship\.json, \.claude\/cheap-session, \.claude\/cheap-contract\.md/,
    'the user must hear that the files were ignored.');
  assertMatch(r.out, /git rm --cached/, 'and how to make them their own again.');
});

test('session-start: the same files, untracked in a git repo, still arm', async () => {
  const dir = projectDir();
  writeAll(dir, { 'docs/STATE.md': STATE });
  commitAll(dir);
  writeAll(dir, PERSONAL);
  const r = await openIn(dir);
  assertMatch(r.out, /Autoship is armed through "merge"/, "the user's own autoship.json must still arm.");
  assertMatch(r.out, /cheap mode is on[\s\S]*Smallest fix that works/, 'and their own cheap session.');
  assert(!/ignored these files/.test(r.out), `nothing here came with the repo:\n${r.out}`);
});

test('session-start: a committed autoship.json that is off is not worth a line', async () => {
  const dir = projectDir();
  writeAll(dir, { 'docs/STATE.md': STATE, '.claude/autoship.json': JSON.stringify({ enabled: false }) });
  commitAll(dir);
  const r = await openIn(dir);
  assert(!/ignored these files|Autoship/.test(r.out), `it would have armed nothing:\n${r.out}`);
});

// Only git's own "no" counts as untracked. A refused repository or a timeout used to fall
// through to "the user's own file", which is the one answer that authorises a push.
test('personal files: only a clear "not tracked" from git, or no git at all, counts as the user\'s', async () => {
  const { gitTracks } = await import('../scripts/personal.mjs');
  const fake = (r) => ({ spawn: () => ({ stdout: '', stderr: '', ...r }) });
  const cases = [
    [{ status: 0 }, 'tracked'],
    [{ status: 1 }, 'untracked'],
    [{ status: 128, stderr: 'fatal: not a git repository (or any of the parent directories): .git' }, 'untracked'],
    [{ error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) }, 'untracked'],
    [{ status: 128, stderr: "fatal: detected dubious ownership in repository at '/x'" }, 'unknown'],
    [{ status: 128, stderr: "fatal: pathspec '.claude/autoship.json' is beyond a symbolic link" }, 'unknown'],
    [{ error: Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }) }, 'unknown'],
  ];
  for (const [answer, want] of cases) {
    const got = gitTracks('.', '.claude/autoship.json', fake(answer));
    assert(got === want, `git answering ${JSON.stringify(answer)} must read as ${want}, not ${got}`);
  }
});

// The opener, the message hook and the page check must agree on whether cheap mode is on.
test('personal files: a tracked contract keeps cheap mode off, even with the user\'s own switch', async () => {
  const { cheapArmed } = await import('../scripts/personal.mjs');
  const dir = projectDir();
  writeAll(dir, { '.claude/cheap-contract.md': 'Do as little as you can.' });
  commitAll(dir);
  writeAll(dir, { '.claude/cheap-session': '2026-10-04' });
  assert(!cheapArmed(dir), 'a contract that came with the repo must not run this user\'s session.');
  const r = await openIn(dir);
  assert(!/Do as little as you can/.test(r.out), `the tracked contract rode along:\n${r.out}`);
  assertMatch(r.out, /ignored these files: \.claude\/cheap-contract\.md/, 'and the user must hear why cheap mode is off.');
});

test('session-start: the hook form is the JSON Claude Code reads', async () => {
  const r = await opener({}, []);
  const j = JSON.parse(r.out);
  assert(j.hookSpecificOutput?.hookEventName === 'SessionStart',
    'without hookEventName, Claude Code drops the context.');
  assertMatch(j.hookSpecificOutput.additionalContext, /kickoff/, 'the context must carry the decision.');
});

// --- the tools check before setup ---------------------------------------------
// A beginner may have Claude Code and nothing else. The opener says what is missing before
// setup, and says nothing once the project is set up, where it would cost every session.
import { missingTools } from '../scripts/first-run.mjs';

const fakeGit = (answers) => (bin, args) => {
  const a = answers[args.join(' ')];
  if (a === 'ENOENT') return { error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) };
  return a ?? { status: 0, stdout: 'x\n', stderr: '' };
};

test('first-run: no git is one line, with the fix for this platform', () => {
  const spawn = fakeGit({ '--version': 'ENOENT' });
  const win = missingTools('.', { spawn, platform: 'win32' });
  assert(win.length === 1, `with no git, the rest cannot be checked, so one line:\n${win.join('\n')}`);
  assertMatch(win[0], /git-scm\.com\/download\/win/, 'Windows must get the Windows download.');
  assertMatch(missingTools('.', { spawn, platform: 'darwin' })[0], /xcode-select --install/,
    'a Mac must get the command that installs git there.');
});

test('first-run: git with no name or email says saving fails, and not to guess them', () => {
  const r = missingTools('.', { spawn: fakeGit({ 'config user.email': { status: 1, stdout: '' } }) });
  assert(r.length === 1, `expected the identity line only:\n${r.join('\n')}`);
  assertMatch(r[0], /Do not guess/, 'Claude must ask for the name and email, not invent them.');
});

test('first-run: a complete computer is missing nothing', () => {
  assert(missingTools('.', { spawn: fakeGit({}) }).length === 0, 'nothing is missing here.');
});

test('session-start: before setup, a computer with no git hears it; after setup, nothing', async () => {
  // An empty folder as the whole PATH. Windows spells it Path, and either may win.
  const noGit = projectDir();
  const env = (dir) => ({ CLAUDE_PROJECT_DIR: dir, PATH: noGit, Path: noGit });
  const fresh = projectDir();
  const before = await run(script('session-start.mjs'), { cwd: fresh, args: ['--text'], env: env(fresh) });
  assert(before.code === 0, `it exited ${before.code}:\n${before.out}`);
  assertMatch(before.out, /Tools check: this computer is missing[\s\S]*Git is not installed/,
    'with git off the PATH, the opener must say git is missing.');

  const setUpDir = projectDir();
  mkdirSync(join(setUpDir, 'docs'), { recursive: true });
  writeFileSync(join(setUpDir, 'docs', 'STATE.md'), STATE);
  const after = await run(script('session-start.mjs'), { cwd: setUpDir, args: ['--text'], env: env(setUpDir) });
  assert(!/Tools check/.test(after.out), `a set-up project must not pay for the check:\n${after.out}`);
});

test('session-start: with everything installed, the check says so, for kickoff to read', async () => {
  const r = await opener({});
  assertMatch(r.out, /Tools check:/, 'kickoff reads this line as proof that Node.js runs.');
});

// --- the cost fingerprint -----------------------------------------------------
// It warns that docs/cost.json is stale. A skill's body loads only when the skill runs, so
// an edit there must not trip it - it did, on the first edit to the deploy skill - and an
// edit to the description, which rides on every turn, must.
test('cost fingerprint: a skill body edit is ignored, a description edit is not', async () => {
  const { costFingerprint } = await import('../scripts/cost-inputs.mjs');
  const { workspace, editText } = await import('./harness.mjs');
  const dir = workspace();
  const before = costFingerprint(dir);
  editText(dir, 'skills/deploy/SKILL.md', (t) => `${t}\nOne more step.\n`);
  assert(costFingerprint(dir) === before, 'a body edit changed the fingerprint.');
  editText(dir, 'skills/deploy/SKILL.md', (t) => t.replace(/^description: /m, 'description: Now '));
  assert(costFingerprint(dir) !== before, 'a description edit left the fingerprint unchanged.');
});

// --- the prompt hook ------------------------------------------------------------
// Every step of a turn re-reads the conversation, and a long one cost several times a
// short one for the same task. These pin when the hook speaks, and that it stays quiet
// otherwise - it runs on every prompt, and it costs tokens only when it prints.
const transcript = (sizes) => {
  const dir = projectDir();
  const file = join(dir, 'session.jsonl');
  writeFileSync(file, sizes.map((n, i) => JSON.stringify({
    type: 'assistant', isSidechain: false, uuid: `u${i}`,
    message: { usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: n - 2 } },
  })).join('\n') + '\n');
  return { dir, file };
};
const promptHook = (dir, file, prompt, session = `s-${Math.random()}`) =>
  run(script('prompt-check.mjs'), {
    cwd: dir, env: { CLAUDE_PROJECT_DIR: dir },
    input: JSON.stringify({ prompt, transcript_path: file, session_id: session }),
  });

test('prompt hook: history is the growth past the smallest request, so /compact resets it', async () => {
  const { historyTokens } = await import('../scripts/prompt-check.mjs');
  assert(historyTokens(transcript([30_000, 45_000, 70_000]).file) === 40_000, 'growth from the first request');
  assert(historyTokens(transcript([30_000, 90_000, 33_000]).file) === 3_000,
    'after /compact the context shrinks in the same file, and the history must shrink with it.');
});

test('prompt hook: cheap mode in a long conversation holds the task and asks for /clear or /compact', async () => {
  const { dir, file } = transcript([30_000, 80_000]);
  const r = await promptHook(dir, file, '/easyclaude:cheap add a counter');
  assertMatch(r.out, /Do not start the task/, 'a long conversation must hold the cheap task.');
  assertMatch(r.out, /\/clear[\s\S]*\/compact/, 'both ways out must be named.');
});

test('prompt hook: cheap mode in a short conversation says nothing', async () => {
  const { dir, file } = transcript([30_000, 35_000]);
  const r = await promptHook(dir, file, '/easyclaude:cheap add a counter');
  assert(r.out.trim() === '', `a short conversation needs no advice:\n${r.out}`);
});

test('prompt hook: an armed cheap session holds any prompt once the conversation is long', async () => {
  const { dir, file } = transcript([30_000, 80_000]);
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'cheap-session'), '2026-09-24');
  const r = await promptHook(dir, file, 'add a counter');
  assertMatch(r.out, /Do not start the task/, 'the armed session is cheap mode too.');
});

// In a long conversation cheap mode holds every task, so a committed cheap-session file
// would stop work in every clone. See personal.mjs.
test('prompt hook: a cheap-session file the repo commits does not arm cheap mode', async () => {
  const { dir, file } = transcript([30_000, 80_000]);
  writeAll(dir, { '.claude/cheap-session': '2026-09-24' });
  commitAll(dir);
  const r = await promptHook(dir, file, 'add a counter');
  assert(!/Do not start the task/.test(r.out), `a committed cheap-session held the task:\n${r.out}`);
});

test('prompt hook: a very long normal conversation gets the /clear advice once', async () => {
  const { dir, file } = transcript([30_000, 150_000]);
  const session = `advice-${Date.now()}-${Math.random()}`;
  const first = await promptHook(dir, file, 'add a counter', session);
  assertMatch(first.out, /\/clear makes every step cheaper/, 'the advice must come once.');
  assert(!/Do not start/.test(first.out), 'outside cheap mode the task goes ahead.');
  const second = await promptHook(dir, file, 'and a footer', session);
  assert(second.out.trim() === '', `the advice must not repeat in one session:\n${second.out}`);
});

// /clear and /compact keep the session. A user who took the advice on 2026-09-30 never
// heard it again, because "once" meant once per session.
test('prompt hook: after /clear the advice comes back once the conversation is long again', async () => {
  const { dir, file } = transcript([30_000, 150_000]);
  const session = `advice-${Date.now()}-${Math.random()}`;
  const grow = (sizes) => writeFileSync(file, sizes.map((n, i) => JSON.stringify({
    type: 'assistant', isSidechain: false, uuid: `u${i}`,
    message: { usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: n - 2 } },
  })).join('\n') + '\n');
  assertMatch((await promptHook(dir, file, 'add a counter', session)).out, /\/clear makes/, 'first long stretch');
  grow([30_000, 150_000, 31_000]);
  const fresh = await promptHook(dir, file, 'and a footer', session);
  assert(!/\/clear makes/.test(fresh.out), `right after /clear there is nothing to advise:\n${fresh.out}`);
  grow([30_000, 150_000, 31_000, 125_000]);
  assertMatch((await promptHook(dir, file, 'and a header', session)).out, /\/clear makes/,
    'a second long stretch after /clear must get the advice again.');
});

test('prompt hook: a calendar, a map or a chart gets the library line; code does not', async () => {
  const { dir, file } = transcript([30_000, 35_000]);
  for (const prompt of ['add a booking calendar', 'show the shop on a map', 'เพิ่มปฏิทินจองคิว']) {
    assertMatch((await promptHook(dir, file, prompt)).out, /open-source libraries/, `"${prompt}" must get the library line.`);
  }
  for (const prompt of ['array.map is slow here', 'fix the sitemap']) {
    assert(!/open-source libraries/.test((await promptHook(dir, file, prompt)).out), `"${prompt}" is not a library question.`);
  }
});

// --- the cost notices ---------------------------------------------------------
// Claude Code reports what reopening or switching will re-send, before it is sent. The
// notices show that to the user only when it is worth /clear, and never to Claude.
const noticeRun = (name, dir, payload) => run(script(name), {
  cwd: dir, env: { CLAUDE_PROJECT_DIR: dir }, input: JSON.stringify(payload),
});
const BIG = { context_tokens: 182_340, estimated_cache_write_usd: 1.1396, pricing: 'catalog' };
const SMALL = { context_tokens: 12_000, estimated_cache_write_usd: 0.07, pricing: 'catalog' };

test('cost notice: reopening a big conversation with an expired copy shows the figure', async () => {
  const dir = projectDir();
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'STATE.md'), STATE);
  const r = await noticeRun('session-start.mjs', dir,
    { session_id: 'r1', source: 'resume', prompt_cache_likely_expired: true, ...BIG });
  const j = JSON.parse(r.out);
  assertMatch(j.systemMessage ?? '', /about 182k tokens, about \$1\.14.*\/clear.*docs\/STATE\.md/s,
    'the user must see the cost and the cheaper way before the first message.');
  assert(!/182k/.test(j.hookSpecificOutput.additionalContext),
    'the figure is for the user; telling Claude costs tokens on the request it warns about.');
});

test('cost notice: no line for a new session, a warm copy, or a small conversation', async () => {
  const dir = projectDir();
  for (const payload of [
    { source: 'startup', prompt_cache_likely_expired: true, ...BIG },
    { source: 'resume', prompt_cache_likely_expired: false, ...BIG },
    { source: 'resume', prompt_cache_likely_expired: true, ...SMALL },
  ]) {
    const j = JSON.parse((await noticeRun('session-start.mjs', dir, { session_id: 'r2', ...payload })).out);
    assert(!j.systemMessage, `this needed no notice: ${JSON.stringify(payload)}\n${j.systemMessage}`);
  }
});

test('cost notice: a model switch in a big warm conversation shows the figure, and never blocks', async () => {
  const dir = projectDir();
  const warm = await noticeRun('model-switch.mjs', dir, { prompt_cache_warm: true, ...BIG });
  assert(warm.code === 0, `the switch hook must never block (exit ${warm.code}).`);
  const j = JSON.parse(warm.out);
  assertMatch(j.systemMessage, /182k tokens.*\/clear first/s, 'the switch must show its cost.');
  assert(!j.hookSpecificOutput && !j.decision,
    'an "ask" is a refusal in /config and for fast mode, so this hook must only add a line.');
});

test('cost notice: a cold or small switch says nothing, and bad input lets it through', async () => {
  const dir = projectDir();
  for (const payload of [{ prompt_cache_warm: false, ...BIG }, { prompt_cache_warm: true, ...SMALL }]) {
    const r = await noticeRun('model-switch.mjs', dir, payload);
    assert(r.code === 0 && r.out.trim() === '', `this needed no notice: ${JSON.stringify(payload)}\n${r.out}`);
  }
  const bad = await run(script('model-switch.mjs'), { cwd: dir, input: 'not json' });
  assert(bad.code === 0 && bad.out.trim() === '',
    `a hook that fails on this event blocks the switch, so bad input must exit 0 quietly:\n${bad.out}`);
});

test('cost notice: with no price, tokens decide, and the figure says so', async () => {
  const { switchNotice } = await import('../scripts/cost-notice.mjs');
  assert(switchNotice({ prompt_cache_warm: true, context_tokens: 60_000 }, false),
    'no price must not mean no notice.');
  assertMatch(switchNotice({ prompt_cache_warm: true, context_tokens: 90_000,
    estimated_cache_write_usd: 0.5, pricing: 'default' }, false), /roughly \$0\.50/,
    'an assumed price must not read as a known one.');
});

// --- the bug-report line -------------------------------------------------------
// scripts/bench.mjs found that with easyClaude loaded, a one-line bug fix shipped with no
// test in two runs of three. This line is what fixed it, so its reach is pinned both ways.
test('prompt hook: a bug report gets the debug line, other requests do not', async () => {
  const { looksLikeBug } = await import('../scripts/prompt-check.mjs');
  for (const p of ['the checkout breaks when there is no code', 'The tests keep failing',
    "it doesn't work", 'there is an error on the cart page', 'หน้าเช็คเอาท์พัง', 'ปุ่มจ่ายเงินใช้ไม่ได้']) {
    assert(looksLikeBug(p), `a bug report was missed: ${p}`);
  }
  for (const p of ['add shipping for orders under $50', 'rename the shop', 'keep going', 'ship it',
    'is this safe to make public?', '/easyclaude:cheap fix the error']) {
    assert(!looksLikeBug(p), `this is not a bug report, or it is a command: ${p}`);
  }
});

// Three false alarms found on 2026-10-04, each one a feature request or a question that was
// sent to the debug skill: an error message the user asked for, ค้าง in its sense of
// "still to do", and a helper's report that reached the hook as if the user had typed it.
const WRAPPED_REPORT = '<system-reminder>\n<agent-message from="a1">[Subagent hand-back] Nothing ' +
  'fails here. Finish the rest later.</agent-message>\n</system-reminder>';

test('prompt hook: an error the user asks for is a feature, not a bug report', async () => {
  const { looksLikeBug } = await import('../scripts/prompt-check.mjs');
  for (const p of ['add an error message when the email field is empty', 'show an error if the code is wrong',
    'Handle errors from the payment API.', 'Also add a clear error message for a bad email.',
    'I want you to add an error when the cart is empty', 'Could you please add validation errors to the form?',
    'ให้แสดง error เมื่ออีเมลว่าง', 'เพิ่มข้อความ error เมื่ออีเมลว่าง']) {
    assert(!looksLikeBug(p), `this asks for an error message, it does not report one: ${p}`);
  }
  // The reviewer's cases: a button named with a verb is still the subject of a bug report.
  for (const p of ['it shows an error when I pay', 'The checkout crashes. Show an error instead.',
    'Add to cart gives an error', 'Log in fails with an error', 'Create account throws an error',
    'มันแสดงข้อผิดพลาดตอนจ่ายเงิน', 'แสดงข้อผิดพลาดตอนจ่ายเงิน']) {
    assert(looksLikeBug(p), `an error the user hit was missed: ${p}`);
  }
});

test('prompt hook: ค้าง as pending work is not a bug, ค้าง as a hang is', async () => {
  const { looksLikeBug } = await import('../scripts/prompt-check.mjs');
  assert(!looksLikeBug('งานที่ค้างอยู่มีอะไรบ้าง'), 'asking for the pending work is not a bug report.');
  assert(!looksLikeBug('มีงานค้างไว้กี่อัน'), 'งานค้าง is pending work.');
  assert(looksLikeBug('หน้าเว็บค้างตอนกดจ่ายเงิน'), 'a page that hangs is a bug report.');
});

test('prompt hook: a helper report wrapped by Claude Code is not the user speaking', async () => {
  const { looksLikeBug, asksToFinishSeveral, leavesWorkForLater, userWords } = await import('../scripts/prompt-check.mjs');
  assert(!looksLikeBug(WRAPPED_REPORT), 'the report says "fails", the user did not.');
  assert(!asksToFinishSeveral(WRAPPED_REPORT), 'the report says "finish the rest", the user did not.');
  assert(!leavesWorkForLater(WRAPPED_REPORT), 'the report says "later", the user did not.');
  assert(userWords(`${WRAPPED_REPORT}\nthe checkout breaks`) === 'the checkout breaks',
    'what the user typed beside the report must survive.');
  const { dir, file } = transcript([30_000, 31_000]);
  const r = await promptHook(dir, file, WRAPPED_REPORT);
  assert(!r.out.trim(), `a wrapped report must add no line at all:\n${r.out}`);
  // In an armed cheap session with a long history, a user prompt is held for /clear. A
  // report is not the user asking for anything, so it must not be held.
  const long = transcript([30_000, 80_000]);
  mkdirSync(join(long.dir, '.claude'), { recursive: true });
  writeFileSync(join(long.dir, '.claude', 'cheap-session'), '2026-10-04');
  const held = await promptHook(long.dir, long.file, WRAPPED_REPORT);
  assert(!held.out.trim(), `a report in a long cheap session must not be held:\n${held.out}`);
});

test('prompt hook: the debug line rides with the long-conversation advice', async () => {
  const { dir, file } = transcript([30_000, 150_000]);
  const r = await promptHook(dir, file, 'the checkout breaks', `bug-${Date.now()}-${Math.random()}`);
  const context = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert(/debug skill/.test(context) && /\/clear makes every step cheaper/.test(context),
    `both lines must arrive together:\n${context}`);
});

// The Thai bug-fix task in the outcome benchmark: with the English debug line added, two
// runs of three wrote English notes to a Thai user between steps.
test('prompt hook: a Thai bug report gets the language line, an English one does not', async () => {
  const { dir, file } = transcript([30_000, 31_000]);
  const th = await promptHook(dir, file, 'ถ้าไม่ใส่โค้ดส่วนลด หน้าชำระเงินจะพัง ช่วยแก้ให้หน่อย');
  const thContext = JSON.parse(th.out).hookSpecificOutput.additionalContext;
  assert(/debug skill/.test(thContext) && /language of the user's message/.test(thContext),
    `a Thai bug report needs both lines:\n${thContext}`);
  const en = await promptHook(dir, file, 'the checkout breaks when there is no code');
  assert(!/language of the user's message/.test(en.out),
    `an English message must get no language line, which once read as "reply in another language":\n${en.out}`);
  const plain = await promptHook(dir, file, 'เปลี่ยนชื่อร้านเป็น Green Corner');
  assert(!plain.out.trim(), `a message with no other line stays silent, and costs nothing:\n${plain.out}`);
  const { writesNonLatin } = await import('../scripts/prompt-check.mjs');
  assert(writesNonLatin('เปลี่ยนชื่อร้านจาก Plant Corner เป็น Green Corner'), 'Thai naming English words');
  assert(!writesNonLatin('Megjavítottam a hibát a pénztárban'), 'accented Latin is still Latin');
});

test('prompt hook: cheap mode gets no debug line', async () => {
  const { dir, file } = transcript([30_000, 31_000]);
  const r = await promptHook(dir, file, '/easyclaude:cheap the checkout breaks');
  assert(!/debug skill/.test(r.out), `cheap mode asks for the smallest fix, not a test:\n${r.out}`);
});

// "Put the labels into the user's language" read as "the user's language is not English",
// and a third of English requests in the outcome benchmark got a reply in another language.
test('session-start: the opener keeps English as it is for an English user', async () => {
  const r = await opener({ 'docs/STATE.md': STATE, 'index.html': '' });
  assertMatch(r.out, /If they write in English, keep the lines exactly as they are/,
    'translation must be conditional on the user writing in another language.');
  assert(!/Put the labels and any English placeholder into the user's language/.test(r.out),
    'the old wording told Claude to translate whatever the user wrote in.');
});

// --- the work-left-for-later line ---------------------------------------------
// The two-session benchmark: "just do the first one, we'll do the rest tomorrow" left the
// other four requests unwritten in one run of three, and below older tasks in the others.
test('prompt hook: work left for later is caught, in English and Thai, and nothing else is', async () => {
  const { leavesWorkForLater } = await import('../scripts/prompt-check.mjs');
  for (const p of ["just do the first one, we'll do the rest tomorrow", 'finish it later',
    'ทำอันแรกก่อน ที่เหลือพรุ่งนี้', 'ที่เหลือไว้ทำทีหลัง']) {
    assert(leavesWorkForLater(p), `work left for later was missed: ${p}`);
  }
  for (const p of ['add shipping', 'keep going', 'the checkout breaks', '/easyclaude:cheap later']) {
    assert(!leavesWorkForLater(p), `nothing is being left for later here: ${p}`);
  }
});

test('prompt hook: the later line asks for dated items at the top of Next, only with a state file', async () => {
  const { dir, file } = transcript([30_000, 31_000]);
  const without = await promptHook(dir, file, "do the rest tomorrow");
  assert(!/## Next/.test(without.out), `no docs/STATE.md, so nothing to write to:\n${without.out}`);
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'STATE.md'), '# State\n');
  const r = await promptHook(dir, file, "do the rest tomorrow");
  const context = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert(/top of ## Next/.test(context) && /\(asked \d{4}-\d{2}-\d{2}\)/.test(context),
    `the items must go first, and carry the date they were asked:\n${context}`);
});

// Day two of the benchmark: "finish the rest" got one task and "want me to continue?".
test('prompt hook: finishing several is caught, one thing and cheap mode are not', async () => {
  const { asksToFinishSeveral } = await import('../scripts/prompt-check.mjs');
  for (const p of ['Please finish the rest of the things I asked for yesterday.', 'do all of them',
    'finish everything', 'ทำที่เหลือให้เสร็จ']) {
    assert(asksToFinishSeveral(p), `a request to finish several was missed: ${p}`);
  }
  for (const p of ['add shipping', 'keep going', 'finish the footer', 'the rest is fine']) {
    assert(!asksToFinishSeveral(p), `this asks for one thing, or nothing: ${p}`);
  }
  const { dir, file } = transcript([30_000, 31_000]);
  const cheap = await promptHook(dir, file, '/easyclaude:cheap finish the rest');
  assert(!/finish several tasks/.test(cheap.out), `cheap mode does one thing a turn on purpose:\n${cheap.out}`);
});
