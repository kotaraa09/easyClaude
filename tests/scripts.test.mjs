// Tests for the other scripts this repo ships.
//
// These were bash steps inside the CI workflow. They are ported here so they run on a
// laptop before a push, not only after one - which is the whole reason the checking
// machinery kept breaking without anyone seeing it.
import { test, assert, assertMatch, run, repoRoot, projectDir } from './harness.mjs';
import { readEnv } from '../scripts/env.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

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

test('session-start: the hook form is the JSON Claude Code reads', async () => {
  const r = await opener({}, []);
  const j = JSON.parse(r.out);
  assert(j.hookSpecificOutput?.hookEventName === 'SessionStart',
    'without hookEventName, Claude Code drops the context.');
  assertMatch(j.hookSpecificOutput.additionalContext, /kickoff/, 'the context must carry the decision.');
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

test('prompt hook: a very long normal conversation gets the /clear advice once', async () => {
  const { dir, file } = transcript([30_000, 150_000]);
  const session = `advice-${Date.now()}-${Math.random()}`;
  const first = await promptHook(dir, file, 'add a counter', session);
  assertMatch(first.out, /\/clear makes every step cheaper/, 'the advice must come once.');
  assert(!/Do not start/.test(first.out), 'outside cheap mode the task goes ahead.');
  const second = await promptHook(dir, file, 'and a footer', session);
  assert(second.out.trim() === '', `the advice must not repeat in one session:\n${second.out}`);
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

test('prompt hook: the debug line rides with the long-conversation advice', async () => {
  const { dir, file } = transcript([30_000, 150_000]);
  const r = await promptHook(dir, file, 'the checkout breaks', `bug-${Date.now()}-${Math.random()}`);
  const context = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert(/debug skill/.test(context) && /\/clear makes every step cheaper/.test(context),
    `both lines must arrive together:\n${context}`);
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
