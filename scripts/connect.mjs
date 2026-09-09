#!/usr/bin/env node
// Wire up MCP servers and AI providers from one fill-in-the-blank form.
//
// The form is .env. This script reads it HERE, inside the process, and reports only which
// keys are PRESENT - never their values - for the same reason generate.mjs reads its token
// internally: .env sits in permissions.deny, so a secret must never reach the model's
// context in order to be useful.
//
// A key never reaches the process argument list either. `claude mcp add` can only take one
// through argv, which is world-readable to this user's processes, so a single-use
// placeholder is passed instead and the real value is written into the config afterwards.
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
//   node scripts/connect.mjs --form              print the .env block to fill in
//   node scripts/connect.mjs --status
//   node scripts/connect.mjs --apply [--dry-run]

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PROVIDERS as GEN } from './gen/providers.mjs';
import { readEnv } from './env.mjs';

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

// Launching `claude` is not as simple as it looks on Windows. An npm install puts
// `claude.cmd` on PATH, and Node cannot start that through execFile at all: the bare
// name gets ENOENT because CreateProcess only ever appends .exe, and naming the shim
// directly gets EINVAL because Node refuses .bat/.cmd without a shell (CVE-2024-27980).
// A native install has a real binary and works first time, which is exactly why this
// went unnoticed - it depends on how the user installed Claude Code.
//
// So: try without a shell first. Fall back to one only when the executable itself could
// not be launched, never when `claude mcp add` genuinely failed.
const NEEDS_SHELL = new Set(['ENOENT', 'EINVAL']);

// `claude mcp add` has no way to take a secret off the command line - -e, -H and
// add-json all read it from argv, where every process running as this user can see it
// for the life of the call, and where it can end up in crash dumps and monitoring
// agents. Checked against the CLI's own help rather than assumed.
//
// So the secret never goes in argv. A single-use placeholder goes instead, and the real
// value is written into the config file afterwards by an ordinary file write. The CLI
// still does all the schema work; we only swap one unique token for one value, which
// means this keeps working if the config layout changes.
const placeholder = () => `easyclaude_placeholder_${randomBytes(12).toString('hex')}`;

// Trust the CLI's own report of which file it wrote over guessing at one, but fall back
// to the documented location for local scope if that wording ever changes.
function configPathFrom(output) {
  const m = String(output).match(/File modified:\s*(.+?)(?:\s+\[|[\r\n]|$)/);
  const named = m?.[1]?.trim();
  return named && existsSync(named) ? named : join(homedir(), '.claude.json');
}

function writeSecret(output, token, secret) {
  const file = configPathFrom(output);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { ok: false, why: `could not read ${file}` };
  }
  if (!text.includes(token)) {
    return { ok: false, why: `placeholder was not found in ${file}` };
  }
  // Escaped as a JSON string body, so a quote or backslash in a key cannot break the
  // file. Replacing the token in the raw text rather than reparsing leaves the rest of
  // the user's config byte-for-byte alone.
  const updated = text.split(token).join(JSON.stringify(secret).slice(1, -1));

  // Written to a temporary file and renamed over the original, because this file is not
  // ours and it is not small: ~/.claude.json holds every project the user has opened,
  // their account record, and every server they have configured. A plain writeFileSync
  // truncates first and fills in after, so an interruption anywhere in between - a crash,
  // a full disk, a killed terminal - leaves them with a half-written global config and no
  // backup. rename() within the same directory is atomic: either the old file or the new
  // one, never part of both.
  const temp = `${file}.easyclaude-${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, updated);
    renameSync(temp, file);
  } catch (e) {
    try { unlinkSync(temp); } catch { /* nothing to clean up */ }
    return { ok: false, why: `could not write ${file} - ${e.message}` };
  }
  // A placeholder left behind is a connector that fails later with a confusing error,
  // which is worse than failing here, so prove the swap happened.
  if (readFileSync(file, 'utf8').includes(token)) {
    return { ok: false, why: `could not replace the placeholder in ${file}` };
  }
  return { ok: true };
}

// Defence in depth on the shell fallback. Since secrets now travel as placeholders this
// should never fire, but cmd.exe expands %VAR% even inside the double quotes Node adds
// and a bare " ends the quoting, so anything carrying either is handed back rather than
// written in corrupted. Silently storing a mangled value is worse than not storing one.
const shellHostile = (argv) => argv.some((a) => /[%"]/.test(a));

function runClaude(argv) {
  // No shell on this path, so nothing here is ever parsed by cmd.exe.
  let r = spawnSync('claude', argv, { stdio: 'pipe', encoding: 'utf8' });
  if (r.error && NEEDS_SHELL.has(r.error.code)) {
    if (process.platform !== 'win32') return { ok: false, error: r.error, notFound: true };
    if (shellHostile(argv)) return { ok: false, error: r.error, unsafeForShell: true };
    // shell: true routes through cmd.exe, which is the only way to run the .cmd shim.
    r = spawnSync('claude', argv, { stdio: 'pipe', encoding: 'utf8', shell: true });
  }
  if (r.error) return { ok: false, error: r.error, notFound: NEEDS_SHELL.has(r.error.code) };
  if (r.status !== 0) {
    return { ok: false, error: new Error(String(r.stderr ?? '').trim() || `claude exited ${r.status}`) };
  }
  // Both streams, since the "File modified:" line is what names the config file.
  return { ok: true, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// Values are read but never returned to a caller that prints. Only `present` is safe to
// show. Values go to writeSecret() and nowhere else - never to argv, never to a log.
//
// The parsing itself lives in env.mjs, shared with generate.mjs. It used to live here as
// well as there, in two versions that disagreed about an indented key and about what to
// do with a trailing comment. One reader cannot drift from itself.
const readForm = () => readEnv(process.cwd());

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
  // This block gets appended to a project's .env.example, and that project has no scripts/
  // directory - the script lives inside the plugin. Naming a path that isn't there sent
  // people looking for a file they don't have, so name the command instead.
  console.log('# Then run /easyclaude:connect in Claude Code to apply them.');
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

if (!has('apply')) die('use --list, --form, --status, or --apply');

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
  const secret = c.key ? values.get(c.key) : undefined;
  // The placeholder stands in wherever the value would have gone - an env var for
  // context7, a positional argument for postgres, inside a header for github. Swapping
  // it in the config afterwards works the same in all three.
  const token = secret ? placeholder() : undefined;
  const argv = c.add(token);
  const scope = argv[1];
  const where = scope === 'project' ? '.mcp.json (needs your approval on next start)' : '~/.claude.json (private to you)';
  if (dry) { console.log(`  would add ${c.name.padEnd(12)} -> ${where}`); continue; }
  const r = runClaude(['mcp', 'add', ...argv]);
  if (r.ok) {
    if (!secret) {
      console.log(`  added ${c.name.padEnd(12)} -> ${where}`);
      continue;
    }
    const sub = writeSecret(r.out, token, secret);
    if (sub.ok) {
      console.log(`  added ${c.name.padEnd(12)} -> ${where}`);
      continue;
    }
    // Leaving a half-written server behind would fail later and look like the
    // connector is broken, so take it back out.
    failed++;
    console.log(`  FAILED ${c.name.padEnd(12)} ${sub.why}`);
    const undo = runClaude(['mcp', 'remove', c.name, '-s', scope]);
    console.log(`         ${undo.ok ? 'rolled back, nothing left behind' : `could not roll back - remove "${c.name}" with /mcp`}`);
    continue;
  }
  failed++;
  if (r.notFound) {
    console.log(`  FAILED ${c.name.padEnd(12)} could not run the "claude" CLI - is it on your PATH?`);
  } else if (r.unsafeForShell) {
    // Names the connector, never the value.
    console.log(`  SKIPPED ${c.name.padEnd(11)} its value contains % or ", which cmd.exe would corrupt on the`);
    console.log(`          way into the config. Add this one by hand with /mcp instead.`);
  } else {
    const msg = String(r.error.stderr ?? r.error.message).split('\n')[0].slice(0, 160);
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
