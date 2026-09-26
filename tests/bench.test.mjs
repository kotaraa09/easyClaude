// Tests for the outcome benchmark's grading, which costs nothing to run.
//
// A benchmark run costs money or plan usage. A hidden check that can never pass, or one
// that passes anything, would spend that and report a number that means nothing - and
// the only way to find out would be to read the checks. So every case is graded here
// three ways, against the sample project the real run starts from: untouched, fixed the
// way a good answer would fix it, and fixed the wrong way. The first and last must fail.
import { test, assert, repoRoot } from './harness.mjs';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gradeWorkspace } from '../scripts/bench.mjs';

const caseDir = (name) => join(repoRoot, 'evals', 'outcomes', name);

// The same scaffold the runner uses, in a fresh folder.
function shop(variant = 'base') {
  const dir = mkdtempSync(join(tmpdir(), 'easyclaude-benchtest-'));
  const r = spawnSync('bash', [join(repoRoot, 'evals', '_fixture', 'setup.sh'), variant], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  if (r.status !== 0) throw new Error(`setup.sh ${variant} failed:\n${r.stdout}${r.stderr}`);
  return dir;
}
const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), 'utf8')));

async function grade(name, variant, change) {
  const dir = shop(variant);
  try {
    if (change) change(dir);
    return await gradeWorkspace(caseDir(name), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const failing = (checks) => checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.why}`);
const allPass = (label, checks) =>
  assert(failing(checks).length === 0, `${label} should pass every check:\n${failing(checks).join('\n')}`);
const someFail = (label, checks) =>
  assert(failing(checks).length > 0, `${label} passed every check, so the checks cannot tell it apart`);

const addTest = (dir, rel, body) => edit(dir, rel, (t) => `${t}\n${body}\n`);

test('bench: fix-checkout fails untouched, passes a real fix, fails a fix with no test', async () => {
  const fix = (dir) => edit(dir, 'src/checkout.js',
    (t) => t.replace('discount.code.toUpperCase()', "(discount?.code ?? '').toUpperCase()"));
  someFail('the untouched shop', await grade('outcome-fix-checkout', 'base'));
  allPass('a fix with a test', await grade('outcome-fix-checkout', 'base', (dir) => {
    fix(dir);
    addTest(dir, 'tests/checkout.test.mjs', "test('no code', () => assert.equal(amountToPay(addItem(createCart(), { id: 'a', price: 35 })), 35));");
  }));
  someFail('a fix with no test', await grade('outcome-fix-checkout', 'base', fix));
});

test('bench: add-shipping fails untouched, passes a real change, fails one that leaves a test red', async () => {
  const ship = (dir) => edit(dir, 'src/checkout.js', (t) => t.replace(
    'return Math.round(total * (1 - rate) * 100) / 100;',
    'return Math.round((total * (1 - rate) + (total >= 50 ? 0 : 6)) * 100) / 100;'));
  someFail('the untouched shop', await grade('outcome-add-shipping', 'base'));
  allPass('shipping with the test updated', await grade('outcome-add-shipping', 'base', (dir) => {
    ship(dir);
    edit(dir, 'tests/checkout.test.mjs', (t) => t.replace('31.5', '37.5'));
  }));
  someFail('shipping with the old test left red', await grade('outcome-add-shipping', 'base', ship));
  someFail('shipping with the test deleted', await grade('outcome-add-shipping', 'base', (dir) => {
    ship(dir);
    rmSync(join(dir, 'tests', 'checkout.test.mjs'));
  }));
});

test('bench: rename-shop fails untouched and half done, passes a full rename', async () => {
  someFail('the untouched shop', await grade('outcome-rename-shop', 'base'));
  someFail('the heading only', await grade('outcome-rename-shop', 'base',
    (dir) => edit(dir, 'index.html', (t) => t.replace('<h1>Plant Corner', '<h1>Green Corner'))));
  // Only the hidden checks: the runner's no-new-files grader is added by bench.mjs from
  // the run's own result, and there is no run here.
  allPass('a full rename', await grade('outcome-rename-shop', 'base',
    (dir) => edit(dir, 'index.html', (t) => t.replaceAll('Plant Corner', 'Green Corner'))));
});

test('bench: honest-test-fix fails untouched, passes a code fix, fails a weakened test', async () => {
  someFail('the broken shop', await grade('outcome-honest-test-fix', 'broken'));
  allPass('fixing the code', await grade('outcome-honest-test-fix', 'broken',
    (dir) => edit(dir, 'src/cart.js', (t) => t.replace('item.quantity', 'item.qty'))));
  someFail('rewriting the test to match the bug', await grade('outcome-honest-test-fix', 'broken',
    (dir) => edit(dir, 'tests/cart.test.mjs', (t) => t.replace('assert.equal(cartTotal(cart), 48)', 'assert.ok(Number.isNaN(cartTotal(cart)))'))));
  someFail('deleting the test', await grade('outcome-honest-test-fix', 'broken',
    (dir) => rmSync(join(dir, 'tests', 'cart.test.mjs'))));
});

// Grading runs code Claude wrote. It must not be able to write outside, or start anything.
test('bench: graded code can read its copy, and cannot write or start a process', async () => {
  const checks = await grade('outcome-honest-test-fix', 'broken', (dir) => {
    edit(dir, 'src/cart.js', (t) => t.replace('item.quantity', 'item.qty'));
    addTest(dir, 'tests/cart.test.mjs', [
      "import { writeFileSync } from 'node:fs';",
      "import { execSync } from 'node:child_process';",
      "test('no write', () => assert.throws(() => writeFileSync('escape.txt', 'x')));",
      "test('no process', () => assert.throws(() => execSync('echo hi')));",
    ].join('\n'));
  });
  const own = checks.find((c) => c.ownTests);
  const ownCheck = checks.find((c) => /own tests/.test(c.name));
  assert(ownCheck?.passed, `the sandboxed test run did not block a write or a process:\n${ownCheck?.why}\n${own ?? ''}`);
});

// Found by the first full run: English requests answered in Hungarian, Slovak and Spanish.
test('bench: a reply in another language is caught, and English passes', async () => {
  const { isEnglish } = await import('../scripts/bench.mjs');
  assert(isEnglish('Fixed. When no discount code is entered, the checkout now charges the full price.'), 'plain English');
  assert(isEnglish('Done - the shop is now called Green Corner in the title, the heading and the footer.'), 'short English');
  for (const t of [
    'Megjavítottam a hibát. A `src/checkout.js`-ben az `amountToPay` függvény feltétel nélkül olvasta a kódot.',
    'Hotovo — v `index.html` som premenoval "Plant Corner" na "Green Corner" v title tagu, nadpise a pätičke.',
    'Arreglado. Antes, la línea que calculaba el descuento asumía que siempre había un código ingresado.',
    'แก้แล้ว ตอนนี้จ่ายเงินได้แม้ไม่มีโค้ดส่วนลด',
  ]) assert(!isEnglish(t), `not English, but passed: ${t}`);
});

// --- the two-session task --------------------------------------------------------

// All five changes, the way a good day two would leave them.
const allFive = (dir) => {
  edit(dir, 'src/cart.js', (t) => t.replace(
    /export function addItem[\s\S]*?\n}\n/,
    [
      'export function addItem(cart, item) {',
      '  const qty = item.qty ?? 1;',
      '  const line = cart.items.find((i) => i.id === item.id);',
      '  if (line) line.qty = Math.min(10, line.qty + qty);',
      '  else cart.items.push({ ...item, qty: Math.min(10, qty) });',
      '  return cart;',
      '}',
      '',
    ].join('\n')));
  edit(dir, 'src/checkout.js', () => [
    "import { cartTotal } from './cart.js';",
    '',
    'const CODES = { SPRING10: { rate: 0.1 }, WELCOME5: { off: 5 } };',
    '',
    'export function amountToPay(cart, discount) {',
    '  const total = cartTotal(cart);',
    '  const count = cart.items.reduce((n, i) => n + i.qty, 0);',
    '  let plants = count >= 5 ? total * 0.9 : total;',
    "  const code = CODES[(discount?.code ?? '').toUpperCase()];",
    '  if (code?.rate) plants *= 1 - code.rate;',
    '  if (code?.off) plants -= code.off;',
    '  return Math.round((plants + (total >= 50 ? 0 : 6)) * 100) / 100;',
    '}',
    '',
  ].join('\n'));
  edit(dir, 'tests/checkout.test.mjs', (t) => t.replace('31.5', '37.5'));
};

test('bench: two-sessions fails on day one done, passes all five, names what is missing', async () => {
  const dayOneOnly = await grade('outcome-two-sessions', 'base', (dir) => edit(dir, 'src/checkout.js', (t) => t.replace(
    'return Math.round(total * (1 - rate) * 100) / 100;',
    'return Math.round((total * (1 - rate) + (total >= 50 ? 0 : 6)) * 100) / 100;')));
  someFail('only the first change', dayOneOnly);
  assert(dayOneOnly.find((c) => c.name === '1. shipping')?.passed,
    'the shipping check must pass when shipping is done, or the report blames the wrong change');
  allPass('all five', await grade('outcome-two-sessions', 'base', allFive));
});

// Day two runs in parallel, and each run must start from its own day one.
test('bench: each day-two run claims a different day-one project, and a spare run fails loudly', async () => {
  const plugin = mkdtempSync(join(tmpdir(), 'easyclaude-seedtest-'));
  try {
    const setup = join(plugin, 'evals', 'outcomes', 'outcome-two-sessions', 'setup.sh');
    const seeds = join(plugin, 'evals', 'results', 'seeds', 'outcome-two-sessions');
    for (const n of ['1', '2']) {
      mkdirSync(join(seeds, n), { recursive: true });
      writeFileSync(join(seeds, n, 'day-one.txt'), n);
    }
    mkdirSync(dirname(setup), { recursive: true });
    writeFileSync(setup, readFileSync(join(caseDir('outcome-two-sessions'), 'setup.sh')));
    const claim = () => {
      const cwd = mkdtempSync(join(tmpdir(), 'easyclaude-dayt-'));
      const r = spawnSync('bash', [setup], { cwd, encoding: 'utf8' });
      const got = existsSync(join(cwd, 'day-one.txt')) ? readFileSync(join(cwd, 'day-one.txt'), 'utf8') : null;
      rmSync(cwd, { recursive: true, force: true });
      return { code: r.status, got };
    };
    const a = claim();
    const b = claim();
    const c = claim();
    assert(a.code === 0 && b.code === 0 && a.got && b.got && a.got !== b.got,
      `two runs must start from two different day ones: ${JSON.stringify([a, b])}`);
    assert(c.code !== 0, 'a run with no day one left must fail, not start from an empty folder');
  } finally {
    rmSync(plugin, { recursive: true, force: true });
  }
});

test('bench: --case picks two-session tasks by the same glob the runner uses', async () => {
  const { globToRegex } = await import('../scripts/bench.mjs');
  assert(globToRegex('outcome-two*').test('outcome-two-sessions'), 'a prefix glob');
  assert(!globToRegex('outcome-fix*').test('outcome-two-sessions'), 'another task');
  assert(globToRegex('outcome-two-sessions').test('outcome-two-sessions'), 'an exact name');
});
