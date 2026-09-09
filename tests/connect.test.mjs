// Tests for the connector's key handling.
//
// These could not be written before. connect.mjs is a command-line script that reads
// process.argv and exits as it loads, so importing it ran it - and writeSecret, the one
// function here that puts an API key into the user's global config, was unreachable.
//
// It was fixed once for a permission bug found by reading: rename() carries the temp
// file's mode to the destination, so replacing a private config published it to every
// account on the machine, in the operation that had just written a key into it. Nothing
// would have caught that coming back. That is what this file is for.
import { test, assert, assertMatch, projectDir } from './harness.mjs';
import { placeholder, configPathFrom, writeSecret, shellHostile } from '../scripts/connect-core.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

// A stand-in for the config the CLI would have written, with a placeholder where the real
// value goes and other settings around it that must come back untouched.
function configWith(token) {
  const dir = projectDir();
  const file = join(dir, 'claude.json');
  writeFileSync(file, JSON.stringify({
    numStartups: 42,
    projects: { 'D:\\some\\project': { allowedTools: ['Read'] } },
    mcpServers: { context7: { env: { CONTEXT7_API_KEY: token } } },
  }, null, 2) + '\n');
  return { dir, file, said: `Added server context7\nFile modified: ${file}` };
}

const tempsIn = (dir) => readdirSync(dir).filter((f) => f.includes('.easyclaude-'));

// --- the swap ------------------------------------------------------------------
test('connect: the placeholder is replaced with the real value', () => {
  const token = placeholder();
  const { file, said } = configWith(token);
  const r = writeSecret(said, token, 'sk-real-key-value');
  assert(r.ok, `the swap failed: ${r.why}`);

  const after = JSON.parse(readFileSync(file, 'utf8'));
  assert(after.mcpServers.context7.env.CONTEXT7_API_KEY === 'sk-real-key-value',
    'the key was not written into the config.');
  assert(!readFileSync(file, 'utf8').includes(token),
    'the placeholder is still in the file. The connector would fail later, confusingly.');
});

test('connect: the rest of the config is left alone', () => {
  const token = placeholder();
  const { file, said } = configWith(token);
  const before = readFileSync(file, 'utf8');
  assert(writeSecret(said, token, 'v').ok, 'the swap failed.');
  const after = readFileSync(file, 'utf8');
  assert(after === before.replace(token, 'v'),
    'the file changed in more than the one place. This is the user\'s whole config: every ' +
    'project they have opened, their account record, every server they have set up.');
});

// A key with a quote or a backslash in it would break the JSON if pasted in raw, and the
// user would be left with a global config that no longer parses.
test('connect: a value containing quotes and backslashes stays valid JSON', () => {
  const token = placeholder();
  const { file, said } = configWith(token);
  const nasty = 'pa"ss\\word\tand\nmore';
  assert(writeSecret(said, token, nasty).ok, 'the swap failed.');

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`the config no longer parses after writing an awkward value: ${e.message}`);
  }
  assert(parsed.mcpServers.context7.env.CONTEXT7_API_KEY === nasty,
    'the value did not survive the round trip intact.');
});

// --- failures are reported, never half-applied ---------------------------------
test('connect: a placeholder that is not in the file is refused', () => {
  const { said } = configWith(placeholder());
  const r = writeSecret(said, placeholder(), 'sk-key');
  assert(!r.ok, 'writing must fail when the placeholder is not there to replace.');
  assertMatch(r.why, /placeholder was not found/, 'it must say what went wrong.');
});

test('connect: a config that cannot be read is reported, not thrown', () => {
  // A directory where a file is expected: readFileSync throws, and the caller must get a
  // reason back rather than a stack trace.
  const dir = projectDir();
  const notAFile = join(dir, 'claude.json');
  mkdirSync(notAFile);
  const r = writeSecret(`File modified: ${notAFile}`, 'tok', 'sk-key');
  assert(!r.ok, 'an unreadable config must not report success.');
  assertMatch(r.why, /could not read/, 'it must say it could not read the file.');
});

test('connect: no temporary file is left behind, on success or on failure', () => {
  const token = placeholder();
  const { dir, file, said } = configWith(token);
  assert(writeSecret(said, token, 'v').ok, 'the swap failed.');
  assert(tempsIn(dir).length === 0, `a temp file was left beside the config: ${tempsIn(dir)}`);

  writeSecret(said, 'a-token-that-is-not-there', 'v');
  assert(tempsIn(dir).length === 0,
    `a failed write left a temp file holding the config: ${tempsIn(dir)}`);
  assert(readFileSync(file, 'utf8').includes('"v"'), 'the earlier write must still stand.');
});

// --- the secret never widens the file --------------------------------------------
// Windows has no equivalent: permissions there come from the parent directory, and chmod
// is a no-op. This runs on Linux and macOS, which is where the bug was.
if (process.platform !== 'win32') {
  test('connect: replacing the config keeps its original permissions', () => {
    const token = placeholder();
    const { file, said } = configWith(token);
    chmodSync(file, 0o600);
    assert(writeSecret(said, token, 'sk-secret').ok, 'the swap failed.');

    const mode = statSync(file).mode & 0o777;
    assert(mode === 0o600,
      `the config came back as ${mode.toString(8)} instead of 600. rename() carries the ` +
      'temp file\'s permissions across, so this publishes an API key to every account on ' +
      'the machine.');
  });

  test('connect: a config that was group-readable stays exactly as it was', () => {
    // The fix must preserve, not tighten. Silently changing a mode the user chose is a
    // different bug in the other direction.
    const token = placeholder();
    const { file, said } = configWith(token);
    chmodSync(file, 0o644);
    assert(writeSecret(said, token, 'sk-secret').ok, 'the swap failed.');
    const mode = statSync(file).mode & 0o777;
    assert(mode === 0o644, `the mode changed from 644 to ${mode.toString(8)}.`);
  });
}

// --- which file the CLI actually wrote --------------------------------------------
test('connect: the config path is taken from what the CLI reported', () => {
  const { file } = configWith('tok');
  assert(configPathFrom(`Added server foo\nFile modified: ${file}`) === file,
    'it must trust the CLI\'s own report of the file it wrote.');
  assert(configPathFrom(`File modified: ${file} [project]`) === file,
    'a trailing bracket after the path must not be read as part of it.');
});

test('connect: a path the CLI names but that is not there falls back', () => {
  const missing = join(projectDir(), 'nope.json');
  const got = configPathFrom(`File modified: ${missing}`);
  assert(got !== missing, 'a file that does not exist must not be used.');
  assertMatch(got, /\.claude\.json$/, 'it must fall back to the documented local-scope path.');
});

// --- the shell guard ---------------------------------------------------------------
// cmd.exe expands %VAR% even inside the double quotes Node adds, and a bare " ends the
// quoting. Storing a mangled value is worse than not storing one.
test('connect: values cmd.exe would corrupt are refused', () => {
  assert(shellHostile(['-e', 'KEY=%PATH%']), 'a %VAR% value must be refused.');
  assert(shellHostile(['-H', 'Authorization: Bearer a"b']), 'a quote in a value must be refused.');
  assert(!shellHostile(['-s', 'local', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp']),
    'an ordinary argument list must not be refused.');
});

// --- the placeholder itself ----------------------------------------------------------
test('connect: each placeholder is unique and cannot collide with real config text', () => {
  const seen = new Set(Array.from({ length: 200 }, () => placeholder()));
  assert(seen.size === 200, 'placeholders repeated. One run could then overwrite another\'s value.');
  for (const p of seen) {
    assertMatch(p, /^easyclaude_placeholder_[0-9a-f]{24}$/,
      'the placeholder must be long, random and recognisable, or it can match real text.');
    break;
  }
});
