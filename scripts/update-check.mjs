#!/usr/bin/env node
// Installs easyClaude the two ways users get it, and fails when Claude Code will not load it:
//
//   1. a fresh install of this working tree
//   2. the last released version, then `claude plugin update` to this working tree
//
//   node update-check.mjs              warns and passes when `claude` is not installed
//   node update-check.mjs --require    fails instead - what CI runs
//
// 1.2.0 passed every check here and still failed to load for everyone who updated: it listed
// the file tree and Blast Radius as dependencies, a fresh install brought them along, and an
// update from 1.1.x did not. Claude Code then refused the whole plugin, with nothing on screen.
// load-check.mjs asks about this folder with --plugin-dir, which is neither of the two paths.
//
// Each run uses its own CLAUDE_CONFIG_DIR, so the user's own plugins are not touched. Plugin
// commands need no login.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REQUIRE = process.argv.includes('--require');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = (dir) => JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'));
const { name, version } = manifest(root);
const id = `${name}@${name}`;

const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
// shell on Windows, where npm puts `claude` on PATH as a .cmd shim. Every argument is a plain
// word or a temp path with no spaces, so nothing needs quoting.
const claude = (configDir, ...args) => spawnSync('claude', args, {
  encoding: 'utf8', timeout: 180_000, shell: process.platform === 'win32',
  env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
});

const probe = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (probe.error || probe.status !== 0) {
  const msg = 'update-check: `claude` is not installed, so install and update were not checked.';
  if (REQUIRE) { console.error(msg); process.exit(1); }
  console.warn(`${msg} Install Claude Code to run it.`);
  process.exit(0);
}

// The newest release older than this version: what a user updates from.
const newer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};
const previous = git('tag', '--list', 'v*').stdout.split(/\r?\n/).map((t) => t.trim())
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t) && newer(version, t.slice(1)))
  .sort((a, b) => (newer(a.slice(1), b.slice(1)) ? -1 : 1))[0];

const work = mkdtempSync(join(tmpdir(), 'ec-update-'));
const failures = [];

// The marketplace is a plain folder, so `marketplace update` re-reads it after it is refilled.
const market = join(work, 'market');
const fill = (from, files) => {
  rmSync(market, { recursive: true, force: true });
  for (const f of files) {
    if (!existsSync(join(from, f))) continue; // deleted in the working tree, not yet committed
    mkdirSync(dirname(join(market, f)), { recursive: true });
    cpSync(join(from, f), join(market, f));
  }
};
const lines = (s) => s.split(/\r?\n/).filter(Boolean);
const current = lines(git('ls-files', '--cached', '--others', '--exclude-standard').stdout);

function step(configDir, label, ...args) {
  const r = claude(configDir, ...args);
  if (r.status !== 0) failures.push(`${label}: \`claude ${args.join(' ')}\` exited ${r.status}\n${r.stdout}${r.stderr}`);
  return r.status === 0;
}

function loads(configDir, label) {
  const r = claude(configDir, 'plugin', 'list', '--json');
  let list;
  try { list = JSON.parse(r.stdout); } catch {
    failures.push(`${label}: \`claude plugin list --json\` gave no JSON:\n${r.stdout}${r.stderr}`);
    return;
  }
  const entry = list.find((p) => p.id === id);
  if (!entry) { failures.push(`${label}: ${id} is not installed at all`); return; }
  if (entry.version !== version) failures.push(`${label}: ${id} is at ${entry.version}, not ${version}`);
  if (entry.errors?.length) failures.push(`${label}: Claude Code will not load ${id}: ${entry.errors.join('; ')}`);
  else if (entry.version === version) console.log(`ok    ${label}`);
}

// 1. fresh install
{
  const cfg = join(work, 'fresh');
  fill(root, current);
  if (step(cfg, 'fresh install', 'plugin', 'marketplace', 'add', market) &&
      step(cfg, 'fresh install', 'plugin', 'install', id)) loads(cfg, 'fresh install');
}

// 2. update from the last release
if (!previous) {
  console.log(`skip  update: no release older than ${version} among the tags (CI needs fetch-depth: 0)`);
} else {
  const cfg = join(work, 'update');
  const old = join(work, 'old');
  const label = `update from ${previous.slice(1)}`;
  const added = git('worktree', 'add', '--detach', '--force', old, previous);
  if (added.status !== 0) {
    failures.push(`${label}: could not check out ${previous}:\n${added.stderr}`);
  } else {
    try {
      fill(old, lines(git('ls-tree', '-r', '--name-only', previous).stdout));
      if (step(cfg, label, 'plugin', 'marketplace', 'add', market) && step(cfg, label, 'plugin', 'install', id)) {
        fill(root, current);
        if (step(cfg, label, 'plugin', 'marketplace', 'update', name) && step(cfg, label, 'plugin', 'update', id)) {
          loads(cfg, label);
        }
      }
    } finally {
      git('worktree', 'remove', '--force', old);
    }
  }
}

rmSync(work, { recursive: true, force: true });
if (failures.length) {
  console.error(`update-check: ${failures.length} problem(s):\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
