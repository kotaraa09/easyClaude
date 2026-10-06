#!/usr/bin/env node
// Finds the apps in a folder that holds more than one: a monorepo, or a front end and a
// back end side by side.
//
//   node find-apps.mjs            the apps, and what kickoff should do with them
//   node find-apps.mjs --json     the same, for tests
//
// kickoff looked for stack markers at the root only. In a folder with web/ and api/ and
// nothing at the root, it found no stack at all; with a root package.json that only lists
// workspaces, it wrote one "npm test" that checked whichever app that script happened to
// reach. Each app now gets its own steps, with "dir" set, and the gate runs only the apps a
// change could affect (see stepsFor in verify.mjs).
//
// Read-only. No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The same markers kickoff's step 3 lists.
const MARKERS = [
  'package.json', 'next.config.*', 'vite.config.*', 'index.html', 'pyproject.toml',
  'requirements.txt', 'go.mod', 'Cargo.toml', 'build.gradle*', 'pom.xml', '*.csproj',
  'Package.swift', 'pubspec.yaml', 'Gemfile', 'composer.json', 'CMakeLists.txt', '*.sln',
  'ProjectSettings',
];
// Never an app, and often huge.
const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage', 'docs', 'doc']);
// Where apps usually sit, when nothing declares them.
const PARENTS = ['apps', 'packages', 'services', 'libs', 'projects'];

const read = (root, rel) => {
  try { return readFileSync(join(root, rel), 'utf8'); } catch { return null; }
};
const dirs = (root, rel) => {
  try {
    return readdirSync(join(root, rel), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
      .map((e) => (rel === '.' ? e.name : `${rel}/${e.name}`));
  } catch { return []; }
};
const matches = (name, marker) =>
  new RegExp(`^${marker.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(name);

export function markersIn(root, rel) {
  let names;
  try { names = readdirSync(join(root, rel)); } catch { return []; }
  return MARKERS.filter((m) => names.some((n) => matches(n, m)));
}

// "apps/*", "packages/**", "tools/cli" -> folders. Anything fancier is left to Claude.
function expand(root, pattern) {
  const p = String(pattern).replace(/^\.\//, '').replace(/\/+$/, '');
  if (p.startsWith('!') || p.includes('..')) return [];
  const star = p.match(/^(.*?)\/\*\*?$/);
  if (star) return dirs(root, star[1] || '.');
  if (p.includes('*')) return [];
  try { return statSync(join(root, p)).isDirectory() ? [p] : []; } catch { return []; }
}

// What the project itself says its parts are.
function declared(root) {
  const out = [];
  const pkg = (() => { try { return JSON.parse(read(root, 'package.json') ?? 'null'); } catch { return null; } })();
  const ws = Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages;
  if (Array.isArray(ws)) out.push(['package.json workspaces', ws]);
  const pnpm = read(root, 'pnpm-workspace.yaml');
  if (pnpm) {
    const list = [...pnpm.matchAll(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)].map((m) => m[1]);
    if (list.length) out.push(['pnpm-workspace.yaml', list]);
  }
  const lerna = (() => { try { return JSON.parse(read(root, 'lerna.json') ?? 'null'); } catch { return null; } })();
  if (Array.isArray(lerna?.packages)) out.push(['lerna.json', lerna.packages]);
  const gowork = read(root, 'go.work');
  if (gowork) {
    const uses = [...gowork.matchAll(/^\s*(?:use\s+)?(\.\/[^\s()]+|\.)\s*$/gm)].map((m) => m[1]).filter((u) => u !== '.');
    if (uses.length) out.push(['go.work', uses]);
  }
  const cargo = read(root, 'Cargo.toml');
  const members = cargo?.match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/);
  if (members) out.push(['Cargo.toml workspace', [...members[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])]);
  return out;
}

export function findApps(root) {
  const sources = declared(root);
  let found = sources.flatMap(([, patterns]) => patterns.flatMap((p) => expand(root, p)));
  let how = sources.map(([name]) => name).join(', ') || null;
  if (!found.length) {
    // Nothing declared: look one level down, and inside the usual parent folders.
    const top = dirs(root, '.');
    found = [...top, ...top.filter((d) => PARENTS.includes(d)).flatMap((d) => dirs(root, d))];
    how = null;
  }
  const rootMarkers = markersIn(root, '.');
  // Undeclared, under a project with its own stack, a folder with only a web page in it is
  // a page of that site - about/index.html - and not an app.
  const pageOnly = (m) => !how && rootMarkers.length && m.length === 1 && m[0] === 'index.html';
  const apps = [...new Set(found)]
    .map((dir) => ({ dir, markers: markersIn(root, dir) }))
    .filter((a) => a.markers.length && !pageOnly(a.markers))
    .sort((a, b) => a.dir.localeCompare(b.dir));
  // One app below a project that has its own stack is a subfolder, not a second app.
  const several = how ? apps.length > 0 : apps.length >= 2 || (apps.length === 1 && !rootMarkers.length);
  return { declaredBy: how, rootMarkers, apps: several ? apps : [] };
}

export function report(r) {
  if (!r.apps.length) return 'One app, at the root. Write the steps as usual, with no "dir".';
  return [
    `This folder holds ${r.apps.length} apps${r.declaredBy ? `, declared in ${r.declaredBy}` : ''}:`,
    ...r.apps.map((a) => `- ${a.dir} (${a.markers.join(', ')})`),
    '',
    'Read the recipe for each app\'s markers, and write that app\'s steps with "dir" set to its ' +
    'folder, so they run there. Run each step once from that folder before you write it. The ' +
    'gate then runs only the apps a change is in, and every app when a change is outside them ' +
    'all. A step that checks the whole workspace at once, run from the root, needs no "dir". ' +
    'Name each step after its app, such as "web: test", so a failure says which app broke.',
  ].join('\n');
}

if (process.argv[1]?.endsWith('find-apps.mjs')) {
  const r = findApps(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 2) : report(r));
}
