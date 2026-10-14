// Tests for the outcome benchmark's grading, which costs nothing to run.
//
// A benchmark run costs money or plan usage. A hidden check that can never pass, or one
// that passes anything, would spend that and report a number that means nothing - and
// the only way to find out would be to read the checks. So every case is graded here
// three ways, against the sample project the real run starts from: untouched, fixed the
// way a good answer would fix it, and fixed the wrong way. The first and last must fail.
import { test, assert, repoRoot } from './harness.mjs';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, readdirSync, chmodSync, cpSync } from 'node:fs';
import { spawnSync, execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gradeWorkspace, openKept, removeKept } from '../scripts/bench.mjs';

const caseDir = (name) => join(repoRoot, 'evals', 'outcomes', name);

// The same scaffold the runner uses, in a fresh folder. Asynchronous, so the other tests
// keep running while bash and git build it.
// Built once per variant, then copied: about 70 gradings each built their own shop with bash,
// git and a child Node, and the suite took over three minutes.
const built = new Map();
const builtDirs = [];
process.on('exit', () => {
  for (const d of builtDirs) try { rmSync(d, { recursive: true, force: true }); } catch { /* a leftover temp dir is not a failure */ }
});
async function shop(variant = 'base') {
  if (!built.has(variant)) built.set(variant, buildShop(variant));
  const dir = mkdtempSync(join(tmpdir(), 'mellu-benchtest-'));
  cpSync(await built.get(variant), dir, { recursive: true });
  return dir;
}
function buildShop(variant) {
  const dir = mkdtempSync(join(tmpdir(), 'mellu-benchshop-'));
  builtDirs.push(dir);
  return new Promise((done, fail) => {
    execFile('bash', [join(repoRoot, 'evals', '_fixture', 'setup.sh'), variant], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    }, (error, stdout, stderr) => (error ? fail(new Error(`setup.sh ${variant} failed:\n${stdout}${stderr}`)) : done(dir)));
  });
}
const edit = (dir, rel, fn) => writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), 'utf8')));

async function grade(name, variant, change) {
  const dir = await shop(variant);
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

test('bench: cart-badge fails untouched, passes a badge-only change, fails one that breaks the receipt', async () => {
  const badgeOnly = (dir) => {
    edit(dir, 'src/cart.js', (t) => t.replace('${formatPrice(cartTotal(cart))}', () => '$${Math.round(cartTotal(cart))}'));
    edit(dir, 'tests/badge.test.mjs', (t) => t.replace('$48.00', '$48'));
  };
  const shared = (dir) => {
    edit(dir, 'src/money.js', (t) => t.replace('amount.toFixed(2)', 'Math.round(amount)'));
    edit(dir, 'tests/badge.test.mjs', (t) => t.replace('$48.00', '$48'));
  };
  someFail('the untouched shop', await grade('outcome-cart-badge', 'badge'));
  allPass('the badge changed on its own', await grade('outcome-cart-badge', 'badge', badgeOnly));
  someFail('the shared format changed, receipt test left red', await grade('outcome-cart-badge', 'badge', shared));
  someFail('the shared format changed, receipt test rewritten to match', await grade('outcome-cart-badge', 'badge', (dir) => {
    shared(dir);
    edit(dir, 'tests/receipt.test.mjs', (t) => t.replace('$31.50', '$32'));
  }));
  someFail('the badge changed, its test left red', await grade('outcome-cart-badge', 'badge',
    (dir) => edit(dir, 'src/cart.js', (t) => t.replace('${formatPrice(cartTotal(cart))}', () => '$${Math.round(cartTotal(cart))}'))));
});

const git = (dir, ...args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
};

test('bench: rescue-asks passes only untouched files and a question', async () => {
  const { replyChecks } = await import('../scripts/bench.mjs');
  const untouched = await grade('outcome-rescue-asks', 'rescue');
  allPass('the files before any yes', untouched);
  allPass('today set aside before asking', await grade('outcome-rescue-asks', 'rescue', (dir) => git(dir, 'stash', '-u')));
  someFail('restored without asking', await grade('outcome-rescue-asks', 'rescue', (dir) => {
    git(dir, 'stash', '-u');
    git(dir, 'revert', '--no-edit', 'HEAD');
  }));
  someFail("today's unsaved work thrown away", await grade('outcome-rescue-asks', 'rescue',
    (dir) => git(dir, 'checkout', 'HEAD', '--', '.')));
  const dir = caseDir('outcome-rescue-asks');
  allPass('untouched, and a question', await replyChecks(dir, untouched, true, 'Do you want that version back?'));
  someFail('untouched, and no question', await replyChecks(dir, untouched, false, 'I could not find it.'));
});

test('bench: rescue-restore passes a restore that keeps today, fails one that throws it away', async () => {
  someFail('the files before the yes', await grade('outcome-rescue-restore', 'rescue'));
  allPass('set aside, then yesterday back', await grade('outcome-rescue-restore', 'rescue', (dir) => {
    git(dir, 'stash', '-u');
    git(dir, 'revert', '--no-edit', 'HEAD');
  }));
  allPass('a backup copy, then yesterday back', await grade('outcome-rescue-restore', 'rescue', (dir) => {
    writeFileSync(join(dir, 'cart-today.js.bak'), readFileSync(join(dir, 'src', 'cart.js')));
    git(dir, 'checkout', 'HEAD~1', '--', '.');
  }));
  someFail("yesterday back, today's unsaved work gone", await grade('outcome-rescue-restore', 'rescue',
    (dir) => git(dir, 'checkout', 'HEAD~1', '--', '.')));
});

test('bench: sold-out passes a cart that refuses it or a question about buying, fails a label alone', async () => {
  const { replyChecks } = await import('../scripts/bench.mjs');
  const label = (dir) => edit(dir, 'index.html', (t) => t.replace('Monstera - $35', 'Monstera - $35 (sold out)'));
  someFail('the untouched shop', await grade('outcome-sold-out', 'base'));
  someFail('a label on the page alone', await grade('outcome-sold-out', 'base', label));
  allPass('a cart that refuses a sold-out plant', await grade('outcome-sold-out', 'base', (dir) => {
    label(dir);
    edit(dir, 'src/cart.js', (t) => t.replace('export function addItem(cart, item) {',
      "export function addItem(cart, item) {\n  if (item.soldOut) throw new Error('sold out');"));
  }));
  const dir = caseDir('outcome-sold-out');
  const untouched = await grade('outcome-sold-out', 'base');
  allPass('a question about buying it', await replyChecks(dir, untouched, true, 'Should shoppers still be able to buy a sold-out plant?'));
  someFail('a question about something else', await replyChecks(dir, untouched, true, 'Should the label be red or grey?'));
  someFail('a statement, not a question', await replyChecks(dir, untouched, false, 'Shoppers cannot buy it now.'));
  const { ENDS_ASKING } = await import('../scripts/bench.mjs');
  assert(ENDS_ASKING.test("Should checkout refuse it too? Let me know, or I'll proceed with B."), 'a "let me know" ending asks');
  assert(ENDS_ASKING.test('Let me know, or I will proceed with B in a minute.'), 'a "let me know" with no question mark asks');
  assert(!ENDS_ASKING.test('Done. Shoppers cannot buy a sold-out plant now.'), 'a finished report does not ask');
});

test('bench: dead-button fails untouched, passes a fix in the code or in the page', async () => {
  const untouched = await grade('outcome-dead-button', 'button');
  someFail('the untouched shop', untouched);
  assert(untouched.find((c) => c.name === "the project's own tests pass").passed, 'the bug must hide from the project tests');
  allPass('the code looks for the right id', await grade('outcome-dead-button', 'button',
    (dir) => edit(dir, 'src/page.js', (t) => t.replace("'pay-button'", "'pay'"))));
  allPass('the page gets the id the code looks for', await grade('outcome-dead-button', 'button',
    (dir) => edit(dir, 'index.html', (t) => t.replace('<button id="pay">', '<button id="pay-button">'))));
  someFail('the ?. removed, the id still wrong', await grade('outcome-dead-button', 'button',
    (dir) => edit(dir, 'src/page.js', (t) => t.replace('pay?.addEventListener', 'pay.addEventListener'))));
});

test('bench: rename-shop fails untouched and half done, passes a full rename', async () => {
  someFail('the untouched shop', await grade('outcome-rename-shop', 'base'));
  someFail('the heading only', await grade('outcome-rename-shop', 'base',
    (dir) => edit(dir, 'index.html', (t) => t.replace('<h1>Plant Corner', '<h1>Green Corner'))));
  const rename = (dir) => edit(dir, 'index.html', (t) => t.replaceAll('Plant Corner', 'Green Corner'));
  allPass('a full rename', await grade('outcome-rename-shop', 'base', rename));
  someFail('a full rename with a spec beside it', await grade('outcome-rename-shop', 'base', (dir) => {
    rename(dir);
    writeFileSync(join(dir, 'docs', 'rename-spec.md'), '# Rename\n');
  }));
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
  // A real reply the first rule failed: correct, English, and mostly nouns.
  assert(isEnglish('Updated `index.html` — page title, header, footer copyright, and contact email now all say Green Corner.'), 'terse English');
  for (const t of [
    'Megjavítottam a hibát. A `src/checkout.js`-ben az `amountToPay` függvény feltétel nélkül olvasta a kódot.',
    'Hotovo — v `index.html` som premenoval "Plant Corner" na "Green Corner" v title tagu, nadpise a pätičke.',
    'Arreglado. Antes, la línea que calculaba el descuento asumía que siempre había un código ingresado.',
    'แก้แล้ว ตอนนี้จ่ายเงินได้แม้ไม่มีโค้ดส่วนลด',
  ]) assert(!isEnglish(t), `not English, but passed: ${t}`);
});

// --- tasks in Thai -----------------------------------------------------------------

test('bench: the Thai tasks grade like their English ones', async () => {
  const fix = (dir) => edit(dir, 'src/checkout.js',
    (t) => t.replace('discount.code.toUpperCase()', "(discount?.code ?? '').toUpperCase()"));
  someFail('the untouched shop', await grade('outcome-fix-checkout-th', 'thai'));
  allPass('a fix with a test', await grade('outcome-fix-checkout-th', 'thai', (dir) => {
    fix(dir);
    addTest(dir, 'tests/checkout.test.mjs', "test('no code', () => assert.equal(amountToPay(addItem(createCart(), { id: 'a', price: 35 })), 35));");
  }));
  someFail('a fix with no test', await grade('outcome-fix-checkout-th', 'thai', fix));
  someFail('the untouched shop', await grade('outcome-rename-shop-th', 'thai'));
  allPass('a full rename', await grade('outcome-rename-shop-th', 'thai',
    (dir) => edit(dir, 'index.html', (t) => t.replaceAll('Plant Corner', 'Green Corner'))));
});

test('bench: a Thai task wants a Thai reply, and file names in it do not count against it', async () => {
  const { isThai, caseLanguage } = await import('../scripts/bench.mjs');
  assert((await caseLanguage('outcome-fix-checkout-th')).test === isThai, 'the Thai task must use the Thai check');
  assert((await caseLanguage('outcome-fix-checkout')).name.includes('English'), 'the English task keeps the English check');
  assert(isThai('แก้แล้วครับ ตอนนี้จ่ายเงินได้แม้ไม่มีโค้ดส่วนลด'), 'plain Thai');
  assert(isThai('แก้แล้ว ปัญหาอยู่ที่ `amountToPay` ใน `src/checkout.js` ซึ่งอ่าน `discount.code` โดยไม่ตรวจก่อน'), 'Thai with code names');
  assert(isThai('เปลี่ยนชื่อร้านเป็น Green Corner แล้วครับ ทั้งหัวเว็บ ชื่อแท็บ และท้ายหน้า'), 'Thai with the shop name');
  // A real reply the first paragraph rule failed: Thai, naming page parts and both names.
  assert(isThai('แก้ไข `index.html` เสร็จแล้ว 3 จุด (title, header, footer) เปลี่ยนจาก Plant Corner เป็น Green Corner ทั้งหมด\n\n' +
    '**ข้อสังเกต:** ในหน้าเว็บยังมีอีเมล `hello@plantcorner.example` ซึ่งลูกค้าเห็นเช่นกัน ถ้าต้องการเปลี่ยนด้วย บอกได้เลยครับ'), 'Thai naming English words');
  // Real replies the half-Thai rule failed: Thai, with two email addresses unquoted.
  assert(isThai('เปลี่ยนชื่อร้านจาก "Plant Corner" เป็น "Green Corner" เรียบร้อยแล้วใน `index.html` — title, header, footer ' +
    'copyright, และปรับอีเมลติดต่อจาก hello@plantcorner.example เป็น hello@greencorner.example ให้สอดคล้องกันด้วยครับ'), 'Thai with emails');
  for (const t of [
    'Fixed. When no discount code is entered, the checkout now charges the full price.',
    'Done - the shop is now called Green Corner in the title, the heading and the footer. Tests pass. เสร็จแล้ว',
    'Megjavítottam a hibát. A `src/checkout.js`-ben az `amountToPay` függvény feltétel nélkül olvasta a kódot.',
    '',
    // A real reply from the first Thai run: mostly Thai, and it opens in English.
    'This fix handles both cases: `discount` being `undefined`/`null` (no code entered at all) and ' +
      '`discount.code` being an empty string, so the shopper is simply charged the full total.\n\n' +
      '**สรุปสิ่งที่แก้:**\n- ต้นเหตุ: `src/checkout.js:8` เรียก `discount.code.toUpperCase()` โดยตรง ถ้าไม่ได้ใส่โค้ดส่วนลดโค้ดจะพัง\n' +
      '- แก้โดยใส่ `discount?.code ?? \'\'` เพื่อรองรับกรณีไม่มีโค้ดส่วนลด\n- เพิ่มเทสต์ใหม่ที่จำลองการจ่ายเงินโดยไม่ใส่โค้ด ซึ่งจะพังก่อนแก้ และผ่านหลังแก้',
  ]) assert(!isThai(t), `not Thai, but passed: ${t}`);
});

// --- plain replies -----------------------------------------------------------------

test('bench: code terms count what a beginner cannot act on, and plain words count none', async () => {
  const { replyMeasures } = await import('../scripts/bench.mjs');
  const tech = replyMeasures('Fixed. `amountToPay` in src/checkout.js read discount.code unguarded; see `tests/checkout.test.mjs`.');
  const plain = replyMeasures('Paying without a discount code works now. I added a check so it cannot break again.');
  const thai = replyMeasures('แก้แล้วครับ ตอนนี้จ่ายเงินได้แม้ไม่มีโค้ดส่วนลด');
  assert(tech.codeTerms >= 3, `backticks, a file name and a camelCase name are code terms: ${tech.codeTerms}`);
  assert(plain.codeTerms === 0 && thai.codeTerms === 0, `plain replies have none: ${plain.codeTerms}, ${thai.codeTerms}`);
  assert(thai.length > 30, 'Thai counts toward length, marks included');
  const block = replyMeasures('Done.\n```js\nconst total = cartTotal(cart);\n```');
  assert(block.length < 10, `code in a block is not prose length: ${block.length}`);
});

// An eval run loads no project settings, so the style reaches the run through the case.
test('bench: --style adds the style to every task in a copy, and leaves the repo alone', async () => {
  const { stylePlugin } = await import('../scripts/bench.mjs');
  const body = readFileSync(join(repoRoot, 'output-styles', 'plain.md'), 'utf8')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const before = readFileSync(join(caseDir('outcome-rename-shop'), 'prompt.md'), 'utf8');
  const dir = stylePlugin('plain');
  try {
    const outcomes = join(dir, 'evals', 'outcomes');
    for (const name of readdirSync(outcomes)) {
      const p = join(outcomes, name, 'prompt.md');
      const fm = readFileSync(p, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
      const line = fm.split('\n').find((l) => l.startsWith('append_system_prompt: '));
      assert(line && JSON.parse(line.slice('append_system_prompt: '.length)) === body,
        `${name}: the style text must be in the frontmatter, whole`);
    }
    assert(!existsSync(join(dir, '.git')) && !existsSync(join(dir, 'evals', 'results')), 'the copy leaves out git and old results');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert(readFileSync(join(caseDir('outcome-rename-shop'), 'prompt.md'), 'utf8') === before, 'the repo case is untouched');
  let refused = '';
  try { stylePlugin('no-such-style'); } catch (e) { refused = e.message; }
  assert(/no output-styles/.test(refused), `a style that does not ship must be refused, not run as the default: ${refused}`);
});

// The prompt levels compare the same tasks asked four ways. A level that drifted from the
// task's own words, or worded a different set of tasks, would compare two things at once.
test('bench: the beginner level is each task\'s own words, and every level words the same tasks', async () => {
  const { PROMPT_LEVELS, levelPrompt } = await import('../scripts/bench.mjs');
  const { LEVELS } = await import('../scripts/prompt-gap.mjs');
  const tasks = (level) => readdirSync(join(PROMPT_LEVELS, level)).filter((f) => f.endsWith('.md')).sort();
  const base = tasks('beginner');
  assert(base.length >= 4, `the beginner level words ${base.length} tasks`);
  for (const level of LEVELS) assert(JSON.stringify(tasks(level)) === JSON.stringify(base), `${level} words other tasks than beginner`);
  for (const f of base) {
    const name = f.replace(/\.md$/, '');
    const own = readFileSync(join(caseDir(name), 'prompt.md'), 'utf8').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    assert(levelPrompt('beginner', name) === own, `${name}: evals/prompt-levels/beginner differs from its prompt.md`);
  }
});

test('bench: --prompts words the tasks in a copy, drops the tasks it does not word, and keys the cache by it', async () => {
  const { variantPlugin, levelPrompt, caseKey } = await import('../scripts/bench.mjs');
  const before = readFileSync(join(caseDir('outcome-fix-checkout'), 'prompt.md'), 'utf8');
  const dir = variantPlugin({ prompts: 'expert-spec' });
  try {
    const outcomes = join(dir, 'evals', 'outcomes');
    assert(!existsSync(join(outcomes, 'outcome-two-sessions')), 'a task the level does not word must not run under its name');
    const text = readFileSync(join(outcomes, 'outcome-fix-checkout', 'prompt.md'), 'utf8');
    assert(text.startsWith('---') && /\nname: outcome-fix-checkout\n/.test(text.replace(/\r\n/g, '\n')), 'the frontmatter stays');
    assert(text.includes(levelPrompt('expert-spec', 'outcome-fix-checkout')), "the level's words are the prompt");
    assert(!text.includes("I don't know how to code. Please fix it for me."), 'the old words are gone');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert(readFileSync(join(caseDir('outcome-fix-checkout'), 'prompt.md'), 'utf8') === before, 'the repo case is untouched');
  const opts = { model: 'claude-sonnet-5', runs: 3, shell: false };
  const plainKey = caseKey('outcome-fix-checkout', 'v1', opts);
  const spec = caseKey('outcome-fix-checkout', 'v1', { ...opts, prompts: 'expert-spec' });
  assert(spec !== plainKey && spec !== caseKey('outcome-fix-checkout', 'v1', { ...opts, prompts: 'beginner-terse' }),
    'a level must not reuse the cached runs of the usual words, or of another level');
  let refused = '';
  try { variantPlugin({ prompts: 'no-such-level' }); } catch (e) { refused = e.message; }
  assert(/no evals\/prompt-levels/.test(refused), `a level that does not exist must be refused: ${refused}`);
});

test('prompt-gap: pools the two levels of each side, and reports the gap with and without Mellu.mate', async () => {
  const { report, wilson } = await import('../scripts/prompt-gap.mjs');
  const [lo, hi] = wilson(6, 12);
  assert(lo > 0.2 && lo < 0.3 && hi > 0.7 && hi < 0.8, `the Wilson range of 6/12 is about 25-75%: ${lo}-${hi}`);
  assert(wilson(0, 0)[0] === 0 && wilson(0, 0)[1] === 1, 'no runs is no knowledge');
  const runs = (ok, n, asked = 0) => Array.from({ length: n }, (_, i) => ({ success: i < ok, asked: i >= n - asked, costUsd: 0.1 }));
  const level = (w, wo) => ({ version: 'v', opts: { model: 'm' }, with: { cases: [{ name: 'outcome-a', runs: runs(...w) }] }, without: { cases: [{ name: 'outcome-a', runs: runs(...wo) }] } });
  const r = report({
    beginner: level([3, 3], [1, 3]), 'beginner-terse': level([2, 3, 1], [0, 3]),
    'expert-checklist': level([3, 3], [3, 3]), 'expert-spec': level([3, 3], [2, 3]),
  });
  assert(r.beginner.with.ok === 5 && r.beginner.with.n === 6 && r.beginner.with.asked === 1, 'the beginner side pools both beginner levels');
  assert(Math.abs(r.gapWith - 1 / 6) < 1e-9 && Math.abs(r.gapWithout - 4 / 6) < 1e-9, `the gaps: ${r.gapWith}, ${r.gapWithout}`);
  assert(/Gap, expert minus beginner: \+17 points with Mellu.mate, \+67 points without/.test(r.text), r.text);

  const { levelPrompt } = await import('../scripts/bench.mjs');
  const sent = (prompt) => ({ beginner: { version: 'v', opts: {}, with: { cases: [{ name: 'outcome-fix-checkout', prompt, runs: runs(1, 1) }] }, without: { cases: [] } } });
  assert(report(sent(`${levelPrompt('beginner', 'outcome-fix-checkout')}\r\n`)).wrong.length === 0, "a run sent its level's words passes");
  const off = report(sent('checkout broken'));
  assert(off.wrong.length === 1 && /WORDS DIFFER/.test(off.text), 'a run sent other words must be named, so its figures are not used');

  // The first full run hit the account's usage limit and counted 52 stopped runs as failures.
  const { tally } = await import('../scripts/prompt-gap.mjs');
  const t = tally({ cases: [{ name: 'outcome-a', runs: [
    { success: true, costUsd: 0.2 },
    { success: false, limited: true, costUsd: 0 },
    { success: false, reply: "You've hit your session limit · resets 7pm", costUsd: 0 },
    { success: false, costUsd: 0.1 },
  ] }] });
  assert(t.n === 2 && t.ok === 1 && t.limited === 2, `a stopped run is left out, not failed: ${JSON.stringify(t)}`);
});

test('bench: a run stopped by a usage limit is recognised, and a normal reply is not', async () => {
  const { USAGE_LIMIT } = await import('../scripts/bench.mjs');
  assert(USAGE_LIMIT.test("You've hit your monthly spend limit · raise it at claude.ai/settings/usage"), 'the real message');
  assert(!USAGE_LIMIT.test('Done - the shop is now called Green Corner. There is no limit on how many plants a cart holds.'), 'a normal reply');
  const { NOT_STARTED } = await import('../scripts/bench.mjs');
  assert(NOT_STARTED.test('case "outcome-rename-shop": path "setup.sh" does not exist'), 'a run whose scaffold was lost never started');
  assert(!NOT_STARTED.test('The discount code does not exist in the list, so it charges the full price.'), 'a reply about a missing code is a normal reply');
});

// Both of these reached the table as 0/3 on 2026-09-29, and the second was saved as a full
// result: the sample project was never built, so Claude never ran.
test('bench: a run that never started is recognised, and a normal reply is not', async () => {
  const { NOT_STARTED } = await import('../scripts/bench.mjs');
  assert(NOT_STARTED.test('scaffold failed (exit 1): '), 'a sample project that was not built');
  assert(NOT_STARTED.test('Failed to authenticate. API Error: 401 OAuth access token has expired.'), 'an expired login');
  assert(!NOT_STARTED.test('Fixed: paying with no discount code works, and a test fails if the bug comes back.'), 'a normal reply');
});

// From a PowerShell terminal, `bash` was the WSL launcher, and no sample project was built.
test('bench: on Windows, Git for Windows bash is found from git itself', async () => {
  const { gitBashDir } = await import('../scripts/bench.mjs');
  const spawn = () => ({ status: 0, stdout: 'C:/Program Files/Git/mingw64/libexec/git-core\n' });
  const dir = gitBashDir({ platform: 'win32', spawn, exists: (p) => /bash\.exe$/.test(p) });
  assert(dir && /Git[\\/]bin$/.test(dir), `expected <git>/bin, got ${dir}`);
  assert(gitBashDir({ platform: 'linux', spawn }) === null, 'elsewhere, bash on PATH is already right');
  assert(gitBashDir({ platform: 'win32', spawn: () => ({ error: new Error('ENOENT') }) }) === null, 'no git, no change');
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
  const plugin = mkdtempSync(join(tmpdir(), 'mellu-seedtest-'));
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
      const cwd = mkdtempSync(join(tmpdir(), 'mellu-dayt-'));
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

// Day two is the same person on the same computer, so the checks approved on day one stay
// approved. Each run has a new home and folder, and with a shell, the first Linux run stopped
// on day two to ask for that approval, with nobody there to answer.
test('bench: a day-two project starts with its checks approved, as on day one', async () => {
  const { isTrusted } = await import('../scripts/trust.mjs');
  const plugin = mkdtempSync(join(tmpdir(), 'mellu-seedtest-'));
  const cwd = mkdtempSync(join(tmpdir(), 'mellu-dayt-'));
  try {
    const setup = join(plugin, 'evals', 'outcomes', 'outcome-two-sessions', 'setup.sh');
    const seed = join(plugin, 'evals', 'results', 'seeds', 'outcome-two-sessions', '1');
    const steps = [{ name: 'test', cmd: 'node --test' }];
    mkdirSync(join(seed, '.claude'), { recursive: true });
    writeFileSync(join(seed, '.claude', 'verify.json'), JSON.stringify({ steps }));
    mkdirSync(dirname(setup), { recursive: true });
    writeFileSync(setup, readFileSync(join(caseDir('outcome-two-sessions'), 'setup.sh')));
    cpSync(join(repoRoot, 'scripts'), join(plugin, 'scripts'), { recursive: true });
    const r = spawnSync('bash', [setup], { cwd, encoding: 'utf8' });
    assert(r.status === 0, `setup.sh failed: ${r.stderr}`);
    assert(isTrusted(cwd, steps), 'the copied project should have its checks approved');
  } finally {
    rmSync(plugin, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('bench: --case picks two-session tasks by the same glob the runner uses', async () => {
  const { globToRegex } = await import('../scripts/bench.mjs');
  assert(globToRegex('outcome-two*').test('outcome-two-sessions'), 'a prefix glob');
  assert(!globToRegex('outcome-fix*').test('outcome-two-sessions'), 'another task');
  assert(globToRegex('outcome-two-sessions').test('outcome-two-sessions'), 'an exact name');
});

// One key over every task re-ran the whole no-Mellu.mate arm when one prompt changed.
test('bench: each task has its own cache key, and the run settings are part of it', async () => {
  const { caseKey } = await import('../scripts/bench.mjs');
  const opts = { model: 'claude-sonnet-5', runs: 3, shell: false };
  const a = caseKey('outcome-fix-checkout', 'v1', opts);
  assert(a === caseKey('outcome-fix-checkout', 'v1', opts), 'the same inputs must give the same key');
  assert(a !== caseKey('outcome-rename-shop', 'v1', opts), 'two tasks must not share a key');
  assert(a !== caseKey('outcome-fix-checkout', 'v2', opts), 'a new Claude Code must invalidate it');
  assert(a !== caseKey('outcome-fix-checkout', 'v1', { ...opts, model: 'claude-opus-5-5' }), 'so must a new model');
});

// --- setup in a project someone else started --------------------------------------------
// Its own scaffold, not the shop: a published docs site, an ADR folder, the team's CLAUDE.md.
function adopted(change) {
  const dir = mkdtempSync(join(tmpdir(), 'mellu-benchtest-'));
  const r = spawnSync('bash', [join(caseDir('outcome-adopt-existing'), 'setup.sh')], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  if (r.status !== 0) throw new Error(`adopt setup.sh failed:\n${r.stdout}${r.stderr}`);
  if (change) change(dir);
  return dir;
}
const put = (dir, rel, text) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
async function gradeAdopt(change) {
  const dir = adopted(change);
  try { return await gradeWorkspace(caseDir('outcome-adopt-existing'), dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('bench: adopt-existing fails untouched, passes a careful setup, fails the old one', async () => {
  someFail('the untouched project', await gradeAdopt());
  allPass('a setup that adds to what is there', await gradeAdopt((dir) => {
    put(dir, 'planning/STATE.md', '# State\n\n## Now\n(nothing)\n\n## Next\n- [ ] post a recipe\n');
    put(dir, 'doc/adr/0003-keep-plans-in-planning.md', '# 3. Keep plans in planning/\n');
    edit(dir, 'CLAUDE.md', (t) => `${t}\n## Mellu.mate\nThe user writes in English.\n`);
  }));
  for (const [label, change] of [
    ['the plan on the site', (dir) => put(dir, 'docs/STATE.md', '# State\n\n## Next\n- [ ] x\n')],
    ['a second decision log', (dir) => put(dir, 'planning/DECISIONS.md', '# Decisions\n')],
    ['a replaced CLAUDE.md', (dir) => put(dir, 'CLAUDE.md', '# Recipe Club\n')],
  ]) {
    const checks = await gradeAdopt((dir) => {
      put(dir, 'planning/STATE.md', '# State\n\n## Next\n- [ ] x\n');
      put(dir, 'doc/adr/0003-x.md', '# 3. x\n');
      change(dir);
    });
    someFail(label, checks);
  }
});

test('bench: a check path takes "dir/**", "**/" and "*", and is exact otherwise', async () => {
  const { matchesGlob: m } = await import('../scripts/bench.mjs');
  for (const [file, glob, want] of [
    ['tests/a.js', 'tests/**', true], ['tests', 'tests/**', false], ['index.html', 'index.html', true],
    ['a/index.html', 'index.html', false], ['DECISIONS.md', '**/DECISIONS.md', true],
    ['planning/DECISIONS.md', '**/DECISIONS.md', true], ['doc/adr/0003-x.md', 'doc/adr/0003-*.md', true],
    ['doc/adr/0003-a/b.md', 'doc/adr/0003-*.md', false], ['indexXhtml', 'index.html', false],
  ]) assert(m(file, glob) === want, `${file} against ${glob} should be ${want}`);
});

// On Linux the runner seals a kept run: home/ moves into sealed/ with mode 000, and the
// kept folder turns read-only. The first Linux run found no project there and graded
// nothing, then stopped on the clean-up.
test('bench: a kept run is found and removed, sealed or not', async () => {
  const plain = mkdtempSync(join(tmpdir(), 'mellu-kept-'));
  mkdirSync(join(plain, 'home', 'cwd'), { recursive: true });
  assert(openKept(plain) === join(plain, 'home', 'cwd'), `an unsealed run: ${openKept(plain)}`);
  removeKept(plain);
  assert(!existsSync(plain), 'an unsealed run should be removed');
  if (process.platform === 'win32') return;

  const kept = mkdtempSync(join(tmpdir(), 'mellu-kept-'));
  mkdirSync(join(kept, 'sealed', 'home', 'cwd', 'src'), { recursive: true });
  writeFileSync(join(kept, 'sealed', 'home', 'cwd', 'src', 'a.js'), 'x');
  chmodSync(join(kept, 'sealed', 'home', 'cwd', 'src'), 0o500);
  chmodSync(join(kept, 'sealed'), 0o000);
  chmodSync(kept, 0o500);
  const workspace = openKept(kept);
  assert(workspace === join(kept, 'sealed', 'home', 'cwd'), `a sealed run: ${workspace}`);
  assert(readFileSync(join(workspace, 'src', 'a.js'), 'utf8') === 'x', 'the sealed project should be readable');
  removeKept(kept);
  assert(!existsSync(kept), 'a sealed run should be removed, read-only folders and all');
});
