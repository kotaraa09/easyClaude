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

// The key handling lives in connect-core.mjs. This file is a command-line script - it reads
// process.argv and exits the moment it loads - so nothing could import it, and the function
// that writes an API key into the user's global config could not be tested at all. It was
// fixed once for a permission bug found by reading, with nothing to stop that bug coming
// back. The split is what makes those functions reachable from a test.
import { PROVIDERS as GEN } from './gen/providers.mjs';
import { readEnv } from './env.mjs';
import { placeholder, writeSecret, runClaude } from './connect-core.mjs';

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
    name: 'inspo', key: null,
    what: 'real sites worth copying from - search 800+ of them for design references',
    // Pinned, for the reason graft is pinned: a connector tracking "latest" is unreviewed
    // third-party code arriving on the user's machine between one session and the next.
    //
    // The profile is the interesting choice. Inspo's full tool set is 15 schemas, which
    // would be the largest standing context cost this catalog can add - bigger than graft's
    // six, which measure ~1,095 tokens on their own, in a framework that ships .mcp.json
    // empty precisely to avoid that. 'lite' is 9 tools covering search, one screen, its
    // design system, reference components and the filter list: the whole read-a-reference
    // path. The note says how to get the other six back, so this is a default, not a cap.
    note: [
      'inspo needs no key and no account. It reads only; nothing is sent about your code.',
      'It is wired to its 9-tool profile, because 15 tool schemas would be the largest',
      'always-on cost in this catalog. For the full set, remove the server and re-add it',
      'with INSPO_PROFILE=full. Add INSPO_IMAGES=none to drop screenshots from results.',
    ],
    add: () => ['-s', 'project', 'inspo', '-e', 'INSPO_PROFILE=lite', '--', 'npx', '-y', 'inspo-mcp@0.1.16'],
  },
  {
    name: 'graft', key: null,
    what: 'a map of your own codebase - find code and trace callers without reading files',
    // Wired as an MCP server and nothing else. `graft init`, which its own README leads
    // with, also installs a statusline, a PostToolUse hook and a .claude/skills/graft/
    // SKILL.md into the project. All three collide with what easyClaude already owns: the
    // hook set in hooks/hooks.json, and a token budget that CI fails on. The MCP server is
    // the part that carries the benefit, and it costs nothing until a tool is called.
    note: [
      'graft needs a graph before its tools return anything. In the project, run:',
      '  npx -y @nanonets/graft@0.16.0 build',
      'Add graft/ to .gitignore, and run build again after a large change.',
      'It sends one anonymous usage ping. Set DO_NOT_TRACK=1 to switch that off.',
    ],
    add: () => ['-s', 'project', 'graft', '--', 'npx', '-y', '@nanonets/graft@0.16.0', 'mcp'],
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
const OAUTH_ONLY = ['figma', 'notion', 'linear', 'slack', 'atlassian', 'sentry', 'higgsfield'];

// /mcp signs in to a server that is already added; it cannot add one. So where an address
// has been verified - an unauthenticated request answering 401 with OAuth metadata, the
// same bar as the list above - print the exact command that adds it. The others stay
// name-only until someone checks theirs.
//
// Higgsfield sits here and not in CONNECTORS on purpose. --apply wires every no-key entry
// in CONNECTORS at once, into a committed .mcp.json. A generation service that bills per
// call does not belong in a batch nobody picked it out of, or in a file teammates inherit.
// `claude mcp add` defaults to local scope, so this lands private to the one account that
// pays for it.
const OAUTH_ADD = {
  higgsfield: {
    url: 'https://mcp.higgsfield.ai/mcp',
    what: 'image and video generation - every generation spends credits on your Higgsfield account',
  },
};
const oauthHowTo = (pad) => Object.entries(OAUTH_ADD).flatMap(([n, o]) => [
  `${pad}${n}: ${o.what}`,
  `${pad}  claude mcp add --transport http ${n} ${o.url}`,
  `${pad}  then run /mcp and sign in`,
]);

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
    // A connector that needs a one-time local step says so where it is chosen, not after
    // it is already wired. Adding the server is not the same as it working.
    if (c.note) for (const line of c.note) console.log(`  ${''.padEnd(12)}   ${line}`);
  }
  console.log('\nAlso read from .env:\n');
  for (const p of PROVIDERS) console.log(`  ${''.padEnd(12)} ${p.key.padEnd(20)} ${p.what}`);
  console.log(`\nBrowser sign-in only, cannot be scripted: ${OAUTH_ONLY.join(', ')}`);
  console.log('  Add those with /mcp inside Claude Code.');
  for (const line of oauthHowTo('  ')) console.log(line);
  console.log('');
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
  console.log('# Add those with /mcp inside Claude Code.');
  for (const line of oauthHowTo('# ')) console.log(line);
  console.log('');
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
  const announce = () => {
    console.log(`  added ${c.name.padEnd(12)} -> ${where}`);
    if (c.note) for (const line of c.note) console.log(`  ${''.padEnd(12)}   ${line}`);
  };
  if (dry) {
    console.log(`  would add ${c.name.padEnd(12)} -> ${where}`);
    if (c.note) for (const line of c.note) console.log(`  ${''.padEnd(12)}   ${line}`);
    continue;
  }
  const r = runClaude(['mcp', 'add', ...argv]);
  if (r.ok) {
    if (!secret) {
      announce();
      continue;
    }
    const sub = writeSecret(r.out, token, secret);
    if (sub.ok) {
      announce();
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
