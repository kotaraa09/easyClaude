#!/usr/bin/env node
// Asks the real Claude Code binary what it loads from this plugin, and fails when a hook
// in hooks/hooks.json is not among them.
//
//   node load-check.mjs              warns and passes when `claude` is not installed
//   node load-check.mjs --require    fails instead - what CI runs
//
// validate.mjs checks hooks.json against rules written in this repo. For every release up
// to 0.1.2 those rules described the wrong shape, the file matched them, and Claude Code
// registered zero hooks: no verify gate and no session opener, with every check green.
// A check written by the same hand as the file will be wrong in the same way. This one
// asks the program that actually loads the plugin. `plugin details` needs no login.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRE = process.argv.includes('--require');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).name;

let expected;
try {
  expected = Object.keys(JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8')).hooks ?? {});
} catch (e) {
  console.error(`load-check: cannot read hooks/hooks.json - ${e.message}`);
  process.exit(1);
}

// shell on Windows, where an npm install puts `claude` on PATH as a .cmd shim that
// spawnSync cannot start directly. The arguments are fixed strings, so nothing is quoted.
const r = spawnSync('claude', ['--plugin-dir', root, 'plugin', 'details', name], {
  encoding: 'utf8', timeout: 120_000, shell: process.platform === 'win32',
});
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;

if (r.error || (r.status !== 0 && /not recognized|not found|ENOENT/i.test(out + (r.error?.message ?? '')))) {
  const msg = 'load-check: `claude` is not installed, so what Claude Code loads was not checked.';
  if (REQUIRE) { console.error(msg); process.exit(1); }
  console.warn(`${msg} Install Claude Code to run it.`);
  process.exit(0);
}
if (r.status !== 0) {
  console.error(`load-check: \`claude plugin details\` exited ${r.status}:\n${out}`);
  process.exit(1);
}

const line = out.match(/^\s*Hooks \((\d+)\)(.*)$/m);
if (!line) {
  console.error('load-check: no "Hooks (n)" line in `claude plugin details`. Its output changed, ' +
    `so this check can no longer read it - update the pattern, do not delete the check:\n${out}`);
  process.exit(1);
}
const loaded = new Set(line[2].split(/[\s,]+/).filter((w) => /^[A-Z][A-Za-z]+$/.test(w)));
const missing = expected.filter((e) => !loaded.has(e));

if (!expected.length || missing.length) {
  console.error(`load-check: Claude Code loaded ${line[1]} hooks from this plugin` +
    (missing.length ? `, and not ${missing.join(', ')}` : ', and hooks/hooks.json declares none under a top-level "hooks" object') +
    '. Run `claude --debug hooks` in a project to see why it refused the file.');
  process.exit(1);
}
console.log(`load-check: Claude Code loads every hook - ${expected.join(', ')}`);
