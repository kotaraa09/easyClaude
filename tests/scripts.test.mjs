// Tests for the other scripts this repo ships.
//
// These were bash steps inside the CI workflow. They are ported here so they run on a
// laptop before a push, not only after one - which is the whole reason the checking
// machinery kept breaking without anyone seeing it.
import { test, assert, assertMatch, run, repoRoot, projectDir } from './harness.mjs';
import { readEnv } from '../scripts/env.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  ['validate.mjs', []],
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
