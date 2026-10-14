// The pytest half of "related": which test files can reach the changed Python files.
//
// Vitest and Jest follow imports themselves ("vitest related", "jest --findRelatedTests").
// pytest has no such command, so Mellu.mate follows them: it reads every import in the
// project, and walks back from the changed files to the test files that import them,
// directly or through other modules. A step names the result with {tests}:
//
//   "related": "python -m pytest -q {tests}"
//
// It is a guess about what a change can reach, so it answers null - run the whole
// command - whenever the guess is not safe: a conftest.py or setup.py, a file that is not
// Python, a project too large to read quickly, or a change no test imports. That last one
// differs from Vitest's --passWithNoTests on purpose: a test can reach a module through a
// fixture or a string, and running everything once is cheaper than a missed failure.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env', '.tox', '.nox',
  'build', 'dist', 'site-packages', '.mypy_cache', '.pytest_cache', '.ruff_cache']);
const MAX_FILES = 3000;
// Files pytest reads for every test, not through an import.
const EVERY_TEST = /(?:^|\/)(?:conftest|setup)\.py$/;
export const isTestFile = (p) => /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.py$/.test(p);

function pythonFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
      const p = join(dir, entry);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (entry.endsWith('.py')) {
        out.push(relative(root, p).split(sep).join('/'));
        if (out.length > MAX_FILES) throw new Error('too many');
      }
    }
  };
  walk(root);
  return out;
}

// 'src/shop/cart.py' -> 'src.shop.cart'; a package's __init__.py is the package itself.
const dotted = (p) => p.replace(/\.py$/, '').replace(/\/__init__$/, '').split('/').join('.');

// Every module a file imports, as dotted names. A from-import also names each imported
// name as a module, since "from shop import cart" may import the module shop.cart.
export function importsOf(text, file) {
  const here = dotted(file).split('.');
  const pkg = file.endsWith('/__init__.py') || file === '__init__.py' ? here : here.slice(0, -1);
  const names = [];
  const body = text.replace(/\\\r?\n/g, ' ').replace(/\(([^)]*)\)/g, (m, inner) => inner.replace(/\s+/g, ' '));
  for (const line of body.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^\s*import\s+(.+)$/))) {
      for (const part of m[1].split(',')) names.push(part.trim().split(/\s+/)[0]);
    } else if ((m = line.match(/^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+)$/))) {
      const [, dots, mod, what] = m;
      const base = dots ? [...pkg.slice(0, pkg.length - (dots.length - 1)), ...(mod ? mod.split('.') : [])].join('.') : mod;
      if (base) names.push(base);
      for (const part of what.replace(/#.*$/, '').split(',')) {
        const name = part.trim().split(/\s+/)[0];
        if (/^\w+$/.test(name)) names.push(base ? `${base}.${name}` : name);
      }
    }
  }
  // Importing a.b.c runs a/__init__.py and a/b/__init__.py first, and a package's
  // __init__.py often imports every module in it. On itsdangerous, leaving this out missed
  // a test file for five of eight changed modules.
  const all = new Set();
  for (const name of names.filter(Boolean)) {
    const parts = name.split('.');
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('.'));
  }
  return [...all];
}

// The test files that reach the changed files, or null when the narrow run is not safe.
export function pythonTestsFor(root, changed) {
  if (!changed.length || changed.some((p) => !p.endsWith('.py') || EVERY_TEST.test(p))) return null;
  let files;
  try { files = pythonFiles(root); } catch { return null; }
  if (changed.some((p) => !files.includes(p))) return null;
  // A module name resolves to every file whose dotted path is it or ends with it, so
  // "shop.cart" finds src/shop/cart.py. Too many matches only runs more tests.
  const byName = new Map();
  for (const f of files) {
    const parts = dotted(f).split('.');
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(i).join('.');
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(f);
    }
  }
  const importers = new Map();
  for (const f of files) {
    let text;
    try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
    for (const name of importsOf(text, f)) {
      for (const target of byName.get(name) ?? []) {
        if (target === f) continue;
        if (!importers.has(target)) importers.set(target, new Set());
        importers.get(target).add(f);
      }
    }
  }
  const reached = new Set(changed);
  const queue = [...changed];
  while (queue.length) {
    for (const f of importers.get(queue.shift()) ?? []) {
      if (!reached.has(f)) { reached.add(f); queue.push(f); }
    }
  }
  // pytest itself imports the __init__.py of each test file's own package, with no import
  // line to follow.
  const inReachedPackage = (f) => {
    const dirs = f.split('/').slice(0, -1);
    for (let i = dirs.length; i > 0; i--) if (reached.has(`${dirs.slice(0, i).join('/')}/__init__.py`)) return true;
    return false;
  };
  const tests = files.filter((f) => isTestFile(f) && (reached.has(f) || inReachedPackage(f))).sort();
  return tests.length ? tests : null;
}
