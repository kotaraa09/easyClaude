#!/usr/bin/env node
// Wire up MCP servers and AI providers from one fill-in-the-blank form.
//
// The form is .env. This script reads it HERE, inside the process, and reports only which
// keys are PRESENT - never their values - for the same reason generate.mjs reads its token
// internally: .env sits in permissions.deny, so a secret must never reach the model's
// context in order to be useful.
//
// Scope is chosen per connector and is not negotiable:
//   no secret  -> project scope (.mcp.json). Committed, teammates get it, and Claude Code
//                 holds each server at "pending approval" until a human says yes.
//   needs key  -> local scope (~/.claude.json, outside the repo entirely), so a key cannot
//                 be committed by accident.
//
// OAuth servers cannot be scripted at all. They need the interactive /mcp flow. This says
// so rather than pretending otherwise.
//
//   node scripts/connect.mjs --list
//   node scripts/connect.mjs --status
//   node scripts/connect.mjs --apply [--dry-run]

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PROVIDERS as GEN } from './gen/providers.mjs';

// Every entry below was verified to exist before it shipped: npm packages via
// `npm view <pkg> time.modified`, remote endpoints by an unauthenticated request
// returning 401. A connector that 404s on first use is worse than no catalog.
const CONNECTORS = [
  {
    name: 'playwright', key: null,
    what: 'drive a real browser - click through the app, screenshot it, check it works',
    add: () => ['-s', 'project', 'playwright', '--', 'npx', '-y', '@playwright/mcp@latest'],
  },
  {
    name: 'context7', key: 'CONTEXT7_API_KEY',
    what: 'current library docs, so it stops guessing at APIs that changed',
    where: 'https://context7.com/dashboard',
    add: (v) => ['-s', 'local', 'context7', '-e', `CONTEXT7_API_KEY=${v}`, '--', 'npx', '-y', '@upstash/context7-mcp'],
  },
  {
    name: 'postgres', key: 'DATABASE_URL',
    what: 'query your database directly instead of guessing at the schema',
    where: 'your own database, e.g. postgres://user:pass@localhost:5432/dbname',
    add: (v) => ['-s', 'local', 'postgres', '--', 'npx', '-y', '@modelcontextprotocol/server-postgres', v],
  },
  {
    name: 'github', key: 'GITHUB_TOKEN',
    what: 'issues and pull requests without leaving the session',
    where: 'https://github.com/settings/tokens',
    add: (v) => ['-s', 'local', 'github', '--transport', 'http', 'https://api.githubcopilot.com/mcp/',
      '-H', `Authorization: Bearer ${v}`],
  },
];

// These authenticate through a browser. No key exists to put in a form, so no script can
// set them up - saying "run /mcp" is the honest answer, not a limitation to work around.
const OAUTH_ONLY = ['figma', 'notion', 'linear', 'slack', 'atlassian', 'sentry'];

// Keys that no MCP server needs, but something else in the project does. Imported from the
// generation catalog rather than restated, so the form and the adapters cannot drift apart.
const PROVIDERS = GEN.filter((p) => p.key).map((p) => ({
  key: p.key,
  what: `${p.modalities.join(', ')} generation - ${p.note}`,
  where: p.where,
}));

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };

// Values are read but never returned to a caller that prints. Only `present` is safe to
// show; `values` is passed straight to execFileSync and nowhere else.
function readForm() {
  const path = resolve(process.cwd(), '.env');
  const values = new Map();
  if (!existsSync(path)) return { values, exists: false };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (v && !/^<.*>$/.test(v)) values.set(m[1], v);
  }
  return { values, exists: true };
}

if (has('list') || args.length === 0) {
  console.log('\nConnectors (fill the key into .env, then run --apply):\n');
  for (const c of CONNECTORS) {
    console.log(`  ${c.name.padEnd(12)} ${(c.key ?? 'no key needed').padEnd(20)} ${c.what}`);
  }
  console.log('\nAlso read from .env:\n');
  for (const p of PROVIDERS) console.log(`  ${''.padEnd(12)} ${p.key.padEnd(20)} ${p.what}`);
  console.log(`\nBrowser sign-in only, cannot be scripted: ${OAUTH_ONLY.join(', ')}`);
  console.log('  Add those with /mcp inside Claude Code.\n');
  process.exit(0);
}

if (has('form')) {
  // Printed rather than hand-maintained, so the form and the catalog cannot drift apart.
  console.log('\n# --- easyClaude connectors -------------------------------------------');
  console.log('# Fill in only what you have. Anything left blank stays switched off.');
  console.log('# Then run: node scripts/connect.mjs --apply');
  for (const c of [...CONNECTORS.filter((x) => x.key), ...PROVIDERS]) {
    console.log(`\n# ${c.what}`);
    console.log(`# get one: ${c.where}`);
    console.log(`${c.key}=`);
  }
  console.log(`\n# Browser sign-in only, no key to paste: ${OAUTH_ONLY.join(', ')}`);
  console.log('# Add those with /mcp inside Claude Code.\n');
  process.exit(0);
}

const { values, exists } = readForm();

if (has('status')) {
  if (!exists) console.log('\nNo .env yet. Copy .env.example to .env and fill in what you have.\n');
  console.log('\nForm status - key names only, values are never printed:\n');
  for (const c of CONNECTORS) {
    const state = c.key === null ? 'ready (no key needed)' : values.has(c.key) ? 'key present' : 'not set';
    console.log(`  ${c.name.padEnd(12)} ${state}`);
  }
  for (const p of PROVIDERS) {
    console.log(`  ${p.key.padEnd(20)} ${values.has(p.key) ? 'key present' : 'not set'}`);
  }
  console.log(`\nOAuth-only (use /mcp): ${OAUTH_ONLY.join(', ')}\n`);
  process.exit(0);
}

if (!has('apply')) die('use --list, --status, or --apply');

const dry = has('dry-run');
const todo = CONNECTORS.filter((c) => c.key === null || values.has(c.key));

if (todo.length === 0) {
  console.log('\nNothing to wire up: no connector keys are filled in .env.');
  console.log('Run --list to see what is available.\n');
  process.exit(0);
}

console.log(dry ? '\nDRY RUN - nothing will be configured\n' : '');
let failed = 0;
for (const c of todo) {
  const argv = c.add(c.key ? values.get(c.key) : undefined);
  const scope = argv[1];
  // Never log argv: it carries the real key for local-scope servers.
  const where = scope === 'project' ? '.mcp.json (needs your approval on next start)' : '~/.claude.json (private to you)';
  if (dry) { console.log(`  would add ${c.name.padEnd(12)} -> ${where}`); continue; }
  try {
    execFileSync('claude', ['mcp', 'add', ...argv], { stdio: 'pipe' });
    console.log(`  added ${c.name.padEnd(12)} -> ${where}`);
  } catch (e) {
    failed++;
    const msg = String(e.stderr ?? e.message).split('\n')[0].slice(0, 160);
    console.log(`  FAILED ${c.name.padEnd(12)} ${msg}`);
  }
}

if (!dry) {
  console.log(`\n${todo.length - failed} of ${todo.length} configured.`);
  console.log('Project-scope servers stay at "pending approval" until you accept them - that gate');
  console.log('is deliberate, since an MCP server is third-party code with a prompt-injection surface.');
  console.log(`\nBrowser sign-in only, still to do by hand with /mcp: ${OAUTH_ONLY.join(', ')}\n`);
}
process.exit(failed ? 1 : 0);
