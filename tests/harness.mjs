// A test harness for the checking machinery itself.
//
// This repo's validator and gate are what everything else rests on, and for a long time
// nothing checked them. Three separate times a check passed while it had stopped checking
// anything: the Stop gate reported OK on failing tests, a reworded heading silently
// switched off the state-template check, and a reversed pair of headings made the recipe
// tier check read an empty string. Each was found by reading the code, which is not a
// process that scales.
//
// The answer is mutation testing. Copy the tree, break exactly one thing, and require the
// validator to notice. A check that stops checking then fails a test instead of going
// quiet, which is the whole point of this directory.
//
// No dependencies and no test framework, matching the rest of the repo: everything here
// runs on a stock Node with `node scripts/test.mjs`.
import { cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- copies ------------------------------------------------------------------
// One pristine copy is made per run and then cloned per test. Copying the working tree
// rather than exporting from git is deliberate: the working tree is what is under review,
// and it means the suite works on an uncommitted change.
const SKIP = new Set(['.git', 'node_modules']);
let pristineDir = null;
const temps = [];

function tempDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

export function cleanup() {
  for (const d of temps.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* a leftover temp dir is not a test failure */ }
  }
}

function pristine() {
  if (pristineDir) return pristineDir;
  pristineDir = join(tempDir('easyclaude-pristine-'), 'plugin');
  cpSync(repoRoot, pristineDir, {
    recursive: true,
    filter: (src) => !SKIP.has(src.slice(repoRoot.length + 1).split(/[\\/]/)[0]),
  });
  return pristineDir;
}

// A fresh, unbroken copy of the plugin. Mutate it freely; nothing here touches the real tree.
export function workspace() {
  const dir = join(tempDir('easyclaude-work-'), 'plugin');
  cpSync(pristine(), dir, { recursive: true });
  return dir;
}

// A bare project directory with a verify contract, for exercising the gate. Not the plugin.
export function projectDir(verifyJson) {
  const dir = tempDir('easyclaude-project-');
  if (verifyJson !== undefined) {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'verify.json'), JSON.stringify(verifyJson, null, 2) + '\n');
  }
  return dir;
}

// --- editing a copy ----------------------------------------------------------
export const readText = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
export const writeText = (dir, rel, text) => writeFileSync(join(dir, rel), text);
export const removeFile = (dir, rel) => rmSync(join(dir, rel), { force: true, recursive: true });
export const exists = (dir, rel) => existsSync(join(dir, rel));

export function editText(dir, rel, fn) {
  writeText(dir, rel, fn(readText(dir, rel)));
}

export function editJson(dir, rel, fn) {
  const obj = JSON.parse(readText(dir, rel));
  const next = fn(obj);
  writeText(dir, rel, JSON.stringify(next === undefined ? obj : next, null, 2) + '\n');
}

// Replaces the first occurrence, and throws if the text is not there. A mutation that
// silently changes nothing would make the validator pass and read as a real finding
// about the validator - the loudest possible false alarm, so it is refused here instead.
export function replaceOnce(dir, rel, find, replaceWith) {
  const before = readText(dir, rel);
  const at = before.indexOf(find);
  if (at === -1) {
    throw new Error(`mutation target not found in ${rel}: ${JSON.stringify(find)}. ` +
      'The file changed; update the mutation rather than deleting it.');
  }
  writeText(dir, rel, before.slice(0, at) + replaceWith + before.slice(at + find.length));
}

// --- running -----------------------------------------------------------------
export function run(script, { cwd, args = [], env = {}, input = '', timeoutMs = 120_000 } = {}) {
  return new Promise((done) => {
    const child = execFile(process.execPath, [script, ...args], {
      cwd: cwd ?? dirname(script),
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      done({
        code: error?.code ?? 0,
        killed: Boolean(error?.killed),
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        out: (stdout ?? '') + (stderr ?? ''),
      });
    });
    child.stdin?.end(input);
  });
}

// The validator resolves its own root from where the file sits, so running the copy's own
// script is what points it at the copy.
export const runValidate = (dir) => run(join(dir, 'scripts', 'validate.mjs'), { cwd: dir });

// The gate reads the project from CLAUDE_PROJECT_DIR. The plugin's own script is used
// unchanged, because the gate is what is under test, not a copy of it.
export const runVerify = (projectPath, args = [], env = {}) =>
  run(join(repoRoot, 'scripts', 'verify.mjs'), {
    cwd: projectPath,
    args,
    env: { CLAUDE_PROJECT_DIR: projectPath, EASYCLAUDE_SKIP_VERIFY: '', ...env },
    input: '{}',
  });

// --- the registry ------------------------------------------------------------
const cases = [];

// `covers` names the check in scripts/validate.mjs that this case proves is alive. The
// coverage test reads those ids back and fails when a check has none, so a new check
// cannot ship untested and an old one cannot quietly lose its only test.
export function test(name, fn, { covers = [] } = {}) {
  cases.push({ name, fn, covers: [].concat(covers) });
}

export const covered = () => new Set(cases.flatMap((c) => c.covers));

export function assert(ok, message) {
  if (!ok) throw new Error(message);
}

export function assertMatch(text, pattern, message) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!re.test(text)) {
    throw new Error(`${message}\n  expected to match: ${re}\n  actual output:\n${indent(text || '(no output)')}`);
  }
}

const indent = (t) => t.split('\n').map((l) => `    | ${l}`).join('\n');

// --- the runner --------------------------------------------------------------
// Cases run concurrently because most of the wall time is node startup: the validator
// spawns `node --check` once per script, so a sequential run is dominated by process
// spawn. The pool is small so a laptop stays usable while it runs.
const POOL = Number(process.env.EASYCLAUDE_TEST_POOL || 4);

export async function runAll() {
  const started = Date.now();
  const results = new Array(cases.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= cases.length) return;
      const c = cases[i];
      const t0 = Date.now();
      try {
        await c.fn();
        results[i] = { name: c.name, ok: true, ms: Date.now() - t0 };
      } catch (e) {
        results[i] = { name: c.name, ok: false, ms: Date.now() - t0, error: e };
      }
      process.stdout.write(results[i].ok ? '.' : 'x');
    }
  };

  await Promise.all(Array.from({ length: Math.min(POOL, cases.length) }, worker));
  process.stdout.write('\n');

  const failed = results.filter((r) => !r.ok);
  for (const r of failed) {
    console.log(`\nFAIL  ${r.name}`);
    console.log(indent(r.error?.message ?? String(r.error)));
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    failed.length
      ? `\nFAIL - ${failed.length} of ${results.length} tests failed in ${secs}s`
      : `\nOK - ${results.length} tests passed in ${secs}s`
  );
  return failed.length === 0;
}
