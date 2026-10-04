#!/usr/bin/env node
// Validates the easyclaude plugin without needing a live Claude Code session.
// Every check here exists because something actually broke while building P0.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COST_FILE, costFingerprint } from './cost-inputs.mjs';

// The plugin root, derived from where this file sits rather than from the caller's cwd.
// This validates *this plugin*, whose layout is fixed relative to the script - so reading
// cwd only made it possible to run the validator somewhere it could not work, which it
// then did by throwing an ENOENT stack trace over the top of whatever it had found.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

// A file that should be there and is not is a finding, not a crash. Every check below the
// first one is still worth running when an earlier one found something missing, and an
// unguarded read replaces the whole report with a stack trace about the first casualty.
function readOrErr(relPath, why) {
  try {
    return readFileSync(join(root, relPath), 'utf8');
  } catch {
    err(relPath, why);
    return null;
  }
}

// Keys accepted in command/skill frontmatter, read out of the Claude Code binary.
// `disallowed-tools` is deliberately absent: it is a CLI flag, not a frontmatter key.
const KNOWN_KEYS = new Set([
  'name', 'description', 'model', 'allowed-tools', 'argument-hint', 'arguments',
  'disable-model-invocation', 'user-invocable', 'effort', 'shell', 'version',
  'when_to_use', 'paths', 'hooks', 'context', 'agent', 'background',
  'created_by', 'improved_by', 'hide-from-slash-command-tool',
]);

const HOOK_EVENTS = new Set([
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'Stop', 'SubagentStop', 'PreCompact', 'Notification', 'PreModelSwitch', 'PostModelSwitch',
]);

// Events Claude Code refuses a prompt hook on. Only the one seen failing is listed. The
// load check in scripts/load-check.mjs cannot catch this: the hook loads, and fails later.
const NO_PROMPT_HOOKS = new Set(['SessionStart']);

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules') continue;
    const p = join(dir, e);
    // Run output, git-ignored. A benchmark run saves each workspace Claude left there,
    // package.json and all, and none of it is this plugin's source.
    if (p === join(root, 'evals', 'results')) continue;
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const rel = (p) => p.replace(root, '').replace(/\\/g, '/').replace(/^\//, '');

// --- frontmatter -------------------------------------------------------------
// Mirrors the parser in the binary, CRLF tolerance included.
function parseFrontmatter(raw, file) {
  const m = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) {
    err(file, 'no parseable frontmatter - file must open with a bare --- line');
    return null;
  }
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      err(file, `frontmatter line is not "key: value" -> ${line.trim()}`);
      continue;
    }
    fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

// --- 1. commands -------------------------------------------------------------
const commandNames = [];
for (const f of walk(join(root, 'commands')).filter((p) => p.endsWith('.md'))) {
  const r = rel(f);
  const fm = parseFrontmatter(readFileSync(f, 'utf8'), r);
  if (!fm) continue;
  commandNames.push(basename(f, '.md'));
  if (!fm.description) err(r, 'missing required "description"');
  for (const k of Object.keys(fm)) {
    if (k === 'disallowed-tools') {
      err(r, '"disallowed-tools" is not a frontmatter key - use "allowed-tools"');
    } else if (!KNOWN_KEYS.has(k)) {
      warn(r, `unrecognised frontmatter key "${k}"`);
    }
  }
}
if (commandNames.length === 0) err('commands/', 'no commands found');

// --- 1b. output styles ----------------------------------------------------------
// A setting that names a style Claude Code does not have gives the default style, with no
// error anywhere. So every "easyclaude:<name>" that a command or skill writes into
// outputStyle must be a style shipped here, and each style must keep the coding
// instructions: it changes how Claude writes, not how it works.
const styleNames = new Set();
const stylesDir = join(root, 'output-styles');
if (existsSync(stylesDir)) {
  for (const f of walk(stylesDir).filter((p) => p.endsWith('.md'))) {
    const r = rel(f);
    const fm = parseFrontmatter(readFileSync(f, 'utf8'), r);
    if (!fm) continue;
    styleNames.add(fm.name ?? basename(f, '.md'));
    if (!fm.description) err(r, 'missing "description" - the /config picker shows it');
    if (String(fm['keep-coding-instructions']) !== 'true') {
      err(r, 'needs "keep-coding-instructions: true", or the style drops how Claude Code works on code');
    }
    if (fm['force-for-plugin'] !== undefined) err(r, '"force-for-plugin" makes the style apply to every user - offer it instead');
  }
}
for (const f of [...walk(join(root, 'commands')), ...walk(join(root, 'skills'))].filter((p) => p.endsWith('.md'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/"outputStyle":\s*"easyclaude:([^"]+)"/g)) {
    if (!styleNames.has(m[1])) err(rel(f), `sets outputStyle "easyclaude:${m[1]}", but output-styles/ has no style named "${m[1]}"`);
  }
}

// --- 2. skills ---------------------------------------------------------------
const skillNames = [];
const skillsDir = join(root, 'skills');
if (existsSync(skillsDir)) {
  for (const d of readdirSync(skillsDir)) {
    // skills/ also holds registry.json; only directories are skills.
    if (!statSync(join(skillsDir, d)).isDirectory()) continue;
    const p = join(skillsDir, d, 'SKILL.md');
    if (!existsSync(p)) {
      err(`skills/${d}`, 'missing SKILL.md');
      continue;
    }
    const r = rel(p);
    const fm = parseFrontmatter(readFileSync(p, 'utf8'), r);
    if (!fm) continue;
    skillNames.push(d);
    if (!fm.name) {
      err(r, 'missing required "name"');
    } else if (fm.name !== d) {
      // The invocation name derives from this; a mismatch silently breaks /<plugin>:<name>.
      err(r, `"name: ${fm.name}" does not match directory "${d}"`);
    }
    if (!fm.description) {
      err(r, 'missing required "description"');
    } else if (fm.description.length < 40) {
      warn(r, 'description is short - skills auto-trigger on it, so describe the situation');
    }
    for (const k of Object.keys(fm)) {
      if (!KNOWN_KEYS.has(k)) warn(r, `unrecognised frontmatter key "${k}"`);
    }
  }
}
if (skillNames.length === 0) err('skills/', 'no skills found');

// --- 2b. agents --------------------------------------------------------------
// agents/*.md ship one named subagent each. Two things make them different from skills
// and are enforced here rather than trusted to prose.
//
// A subagent runs with its own tool grant, so a reviewer that can write is a reviewer
// that can edit the code it was asked to judge - and an edit made after the gate in
// ship step 1 goes out unverified. The list below is an ALLOW-list on purpose. A
// deny-list stays quiet when a new write-capable tool is added to the binary, which is
// the failure that matters; an allow-list fails loudly on a new read-only tool, which
// someone then adds here in one line.
//
// The other difference is cost: an agent's name and description ride on every turn, the
// way a skill's do, and check 10 counts them. Frontmatter with no description is free and
// useless, so it is an error here rather than a silent zero there.
const READ_ONLY_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'NotebookRead', 'WebFetch', 'WebSearch', 'TodoWrite',
]);
const AGENT_KEYS = new Set(['name', 'description', 'tools', 'model', 'color']);
const agentDefs = [];
const agentsDir = join(root, 'agents');
if (existsSync(agentsDir)) {
  for (const f of walk(agentsDir).filter((p) => p.endsWith('.md'))) {
    const r = rel(f);
    const stem = basename(f, '.md');
    const fm = parseFrontmatter(readFileSync(f, 'utf8'), r);
    if (!fm) continue;
    if (!fm.name) {
      err(r, 'missing required "name"');
    } else if (fm.name !== stem) {
      // The dispatch name comes from the frontmatter; a mismatch leaves a file that looks
      // like the agent the skill names and an agent nobody can find by that name.
      err(r, `"name: ${fm.name}" does not match the file name "${stem}.md"`);
    }
    if (!fm.description) {
      err(r, 'missing required "description" - it is how a turn decides to dispatch this agent');
    } else if (fm.description.length > 400) {
      warn(r, `description is ${fm.description.length} chars and rides on every turn - ` +
        'say when to dispatch it and stop');
    }
    if (!fm.tools) {
      err(r, 'missing required "tools" - an agent with no tools line inherits every tool ' +
        'the session has, including Write, Edit and Bash');
    } else {
      const granted = fm.tools.split(',').map((t) => t.trim()).filter(Boolean);
      const writes = granted.filter((t) => !READ_ONLY_TOOLS.has(t));
      if (writes.length) {
        err(r, `grants ${writes.join(', ')}, which can change the tree or run commands. ` +
          'A shipped agent must be read-only, or the review it performs can edit what it ' +
          `reviews. Read-only tools: ${[...READ_ONLY_TOOLS].join(', ')}.`);
      }
    }
    if (!fm.model) {
      err(r, 'missing required "model" - an unpinned agent inherits the session model, so ' +
        'a review that suits a cheap model gets billed at the price of the main one');
    }
    for (const k of Object.keys(fm)) {
      if (!AGENT_KEYS.has(k)) warn(r, `unrecognised agent frontmatter key "${k}"`);
    }
    if (fm.name && fm.description) agentDefs.push([fm.name, fm.description, fm.tools ?? '']);
  }
}

// --- 3. every JSON file parses ----------------------------------------------
const json = {};
for (const f of walk(root).filter((p) => p.endsWith('.json'))) {
  const r = rel(f);
  try {
    json[r] = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    err(r, `invalid JSON - ${e.message}`);
  }
}

// --- 3b. every script parses -------------------------------------------------
// The other half of "every JSON file parses", and it was missing for longer. Only .json
// and .md were ever read for syntax, so a stray brace in connect.mjs or providers.mjs
// passed the validator, passed the gate, passed CI, and shipped - two of the four
// scripts had no automated check of any kind. `node --check` is cheap and catches it.
//
// Syntax only. It does not run the file, so a bad import path or a missing export still
// gets through; the CI smoke tests cover that by actually invoking each entry point.
for (const f of walk(join(root, 'scripts')).filter((p) => p.endsWith('.mjs'))) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    const first = String(r.stderr ?? '').split(/\r?\n/).find((l) => /Error|error:/.test(l));
    err(rel(f), `is not valid JavaScript - ${first?.trim() ?? `node --check exited ${r.status}`}`);
  }
}

// --- 4. manifests agree ------------------------------------------------------
const plugin = json['.claude-plugin/plugin.json'];
const market = json['.claude-plugin/marketplace.json'];
if (!plugin) {
  err('.claude-plugin/plugin.json', 'missing');
} else {
  for (const k of ['name', 'version', 'description']) {
    if (!plugin[k]) err('.claude-plugin/plugin.json', `missing "${k}"`);
  }
}
for (const [r, obj] of Object.entries(json)) {
  if (/YOUR_NAME|YOUR_GITHUB/.test(JSON.stringify(obj))) err(r, 'unfilled placeholder');
}
if (market && plugin) {
  const names = (market.plugins ?? []).map((p) => p.name);
  if (!names.includes(plugin.name)) {
    err('.claude-plugin/marketplace.json', `does not list plugin "${plugin.name}" (found: ${names.join(', ') || 'none'})`);
  }
}

// --- 5. hooks ----------------------------------------------------------------
// A plugin's hooks.json wraps its events in a top-level "hooks" object. Without it Claude
// Code rejects the whole file and registers nothing - no gate, no opener - while this
// check, written against the same wrong shape, printed OK. From the first commit to 0.1.2
// no installed copy of easyClaude ran either hook, and nothing here could see it.
const hooksFile = json['hooks/hooks.json'];
const hooks = hooksFile?.hooks;
if (!hooksFile) {
  err('hooks/hooks.json', 'missing');
} else if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
  const stray = Object.keys(hooksFile).filter((k) => HOOK_EVENTS.has(k));
  err('hooks/hooks.json', 'must put its events under a top-level "hooks" object' +
    (stray.length ? ` (found ${stray.join(', ')} at the top level)` : '') +
    '. Claude Code refuses the whole file otherwise, and no hook runs at all.');
} else {
  for (const [event, entries] of Object.entries(hooks)) {
    if (!HOOK_EVENTS.has(event)) {
      err('hooks/hooks.json', `unknown hook event "${event}"`);
      continue;
    }
    if (!Array.isArray(entries)) {
      err('hooks/hooks.json', `"${event}" must be an array`);
      continue;
    }
    for (const entry of entries) {
      if (!Array.isArray(entry.hooks)) {
        err('hooks/hooks.json', `"${event}" entry missing "hooks" array`);
        continue;
      }
      for (const h of entry.hooks) {
        if (!['command', 'prompt'].includes(h.type)) {
          err('hooks/hooks.json', `"${event}" hook has invalid type "${h.type}"`);
        }
        if (h.type === 'prompt' && !h.prompt) {
          err('hooks/hooks.json', `"${event}" prompt hook missing "prompt"`);
        }
        // Claude Code loads these, then fails each one at run time with "prompt-type hooks
        // are not supported for SessionStart events". The session opens as if no hook exists.
        if (h.type === 'prompt' && NO_PROMPT_HOOKS.has(event)) {
          err('hooks/hooks.json', `"${event}" cannot be a prompt hook - Claude Code has no ` +
            'conversation to run it in yet, so it fails every time. Use a command hook.');
        }
        if (h.type === 'command' && !h.command) {
          err('hooks/hooks.json', `"${event}" command hook missing "command"`);
        }
        // Regression guard: a Stop hook ignoring stop_hook_active re-blocks until force-overridden.
        // Only prompt hooks need it - a command hook blocks on an exit code, which a fix
        // actually clears, and verify.mjs downgrades an unrunnable step to a warning.
        if ((event === 'Stop' || event === 'SubagentStop') && h.type === 'prompt' &&
            !/stop_hook_active/.test(h.prompt ?? '')) {
          err('hooks/hooks.json', `${event} prompt hook must check "stop_hook_active" or it loops until the block cap overrides it`);
        }
        // A command hook pointing at a script that was renamed fails open: the gate
        // silently stops running and nothing says so.
        for (const m of (h.command ?? '').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/g)) {
          if (!existsSync(join(root, m[1]))) {
            err('hooks/hooks.json', `"${event}" hook runs "${m[1]}", which does not exist in this plugin`);
          }
        }
      }
    }
  }
}

// --- 5b. curated skill registry ----------------------------------------------
const registry = json['skills/registry.json'];
const vendoredDirs = new Set();
if (registry) {
  const v = registry.vendored ?? [];
  if (registry.max_vendored && v.length > registry.max_vendored) {
    err('skills/registry.json', `${v.length} vendored skills exceeds max_vendored ${registry.max_vendored}`);
  }
  for (const e of v) {
    const where = `skills/registry.json (${e.name})`;
    vendoredDirs.add(join(skillsDir, e.name));
    if (!/^[0-9a-f]{40}$/.test(e.commit ?? '')) {
      err(where, 'must pin a full 40-character commit SHA - a branch is unreviewed code on user machines');
    }
    if (!e.license) err(where, 'missing license');
    if (!e.why) err(where, 'missing "why" - every vendored skill must justify its permanent context cost');
    const dir = join(skillsDir, e.name);
    if (!existsSync(dir)) {
      err(where, `no directory at skills/${e.name}`);
      continue;
    }
    if (!existsSync(join(dir, 'PROVENANCE.md'))) err(`skills/${e.name}`, 'vendored skill missing PROVENANCE.md');
    for (const a of e.attribution_files ?? []) {
      if (!existsSync(join(dir, a))) err(`skills/${e.name}`, `attribution file "${a}" is declared but missing - this is a licence violation`);
    }
    // A skill claiming to be prose-only must actually be prose-only.
    if (e.contains_executable_code === false) {
      const code = walk(dir).filter((p) => /\.(py|mjs|js|sh|ps1|rb|exe|bat)$/.test(p));
      if (code.length) err(`skills/${e.name}`, `declared prose-only but ships executable files: ${code.map(rel).join(', ')}`);
    }
  }
}

// --- 6. docs use namespaced invocations --------------------------------------
// The P0 shipping bug: every doc said /cheap, which does not exist.
const ns = plugin?.name ?? 'easyclaude';
const invocable = [...new Set([...commandNames, ...skillNames])];
const templateDir = join(root, 'template');
// Vendored skills are third-party prose; our doc conventions do not apply to them.
const isOurs = (p) => !p.startsWith(templateDir) && ![...vendoredDirs].some((d) => p.startsWith(d));
for (const f of walk(root).filter((p) => p.endsWith('.md') && isOurs(p))) {
  const r = rel(f);
  // A line may opt out with "validate-ignore" - for docs that must show the wrong form on purpose.
  const lines = readFileSync(f, 'utf8').split(/\r?\n/)
    .filter((l) => !l.includes('validate-ignore'));
  for (const n of invocable) {
    const bare = new RegExp(`(?<![\\w:/-])/${n}(?![\\w:-])`);
    const hit = lines.findIndex((l) => bare.test(l));
    if (hit !== -1) {
      err(`${r}:${hit + 1}`, `references "/${n}" - plugin commands are namespaced, use "/${ns}:${n}"`);
    }
  }
}

// --- 6b. docs must not claim hooks that do not exist -------------------------
// /easyclaude:cheap-session once advertised a UserPromptSubmit hook that was never
// implemented, so the command silently did nothing.
const implemented = new Set(Object.keys(hooks ?? {}));
for (const f of walk(root).filter((p) => p.endsWith('.md') && isOurs(p))) {
  const r = rel(f);
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes('validate-ignore') || line.trimStart().startsWith('<!--')) return;
    for (const ev of HOOK_EVENTS) {
      if (/hook/i.test(line) && new RegExp(`\\b${ev}\\b`).test(line) && !implemented.has(ev)) {
        err(`${r}:${i + 1}`, `mentions the "${ev}" hook, but hooks.json does not implement it`);
      }
    }
  });
}

// --- 6c. paths named in prose must exist -------------------------------------
// Check 5 does this for hooks.json, because a hook pointing at a renamed script fails
// open. Five skills and commands name a script the same way in prose - "run
// ${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs" - and nothing read those at all. The same
// rename would leave the instructions pointing at nothing, silently, which is the exact
// failure the hooks check exists for.
//
// A trailing "/" means a directory. A "*" is matched loosely: the directory must exist
// and hold at least one entry that fits, which is enough to catch a rename or a move.
const globToRe = (g) => new RegExp(`^${g.split('*').map((s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

function pluginPathExists(p) {
  const clean = p.replace(/\/+$/, '');
  if (!clean) return true;
  if (!clean.includes('*')) return existsSync(join(root, clean));
  const dir = join(root, dirname(clean));
  if (!existsSync(dir)) return false;
  const re = globToRe(basename(clean));
  return readdirSync(dir).some((e) => re.test(e));
}

for (const f of walk(root).filter((p) => p.endsWith('.md') && isOurs(p))) {
  const r = rel(f);
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (line.includes('validate-ignore')) return;
    for (const m of line.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./*-]+)/g)) {
      // A path written without backticks at the end of a sentence swallows the full stop,
      // and the check then reports a file that is really there. No path here ends in
      // punctuation, so trimming it cannot hide a genuine miss.
      const p = m[1].replace(/[.,;:)]+$/, '');
      if (p && !pluginPathExists(p)) {
        err(`${r}:${i + 1}`, `names "${p}", which does not exist in this plugin`);
      }
    }
  });
}

// --- 6d. shipped assets should be referenced ---------------------------------
// Everything in docs/assets/ is installed on every user's machine. og-card.jpg sat there
// at 324 KB with nothing pointing at it - GitHub takes a social preview through repository
// settings, not from the repo, so it was never going to be read by anything. A framework
// that argues this carefully about tokens per turn should not ship megabytes by accident.
//
// A warning, not an error: an unreferenced asset is waste, not breakage, and someone may
// be keeping one on purpose.
const assetsDir = join(root, 'docs', 'assets');
if (existsSync(assetsDir)) {
  const prose = walk(root)
    .filter((p) => /\.(md|json|ya?ml|html)$/.test(p) && !p.startsWith(assetsDir))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');
  for (const f of walk(assetsDir)) {
    const name = basename(f);
    if (!prose.includes(name)) {
      const kb = Math.round(statSync(f).size / 1024);
      warn(`docs/assets/${name}`, `${kb} KB, referenced by nothing - it still ships to every user`);
    }
  }
}

// --- 7. line endings ---------------------------------------------------------
for (const f of walk(root).filter((p) => /\.(md|json|ya?ml|mjs)$/.test(p))) {
  if (readFileSync(f, 'utf8').includes('\r\n')) {
    warn(rel(f), 'CRLF line endings - .gitattributes expects LF');
  }
}

// --- 8. recipes --------------------------------------------------------------
for (const f of walk(join(root, 'recipes')).filter((p) => p.endsWith('.md') && !p.endsWith('README.md'))) {
  const text = readFileSync(f, 'utf8');
  for (const field of ['Detect:', 'Verify steps', 'Verification strength']) {
    if (!text.includes(field)) err(rel(f), `recipe missing "${field}"`);
  }
  // The strength claim sets user expectations, so it must come from a fixed
  // vocabulary rather than being freely worded per recipe.
  const m = text.match(/\*\*Verification strength:\*\*\s*\**\s*(strong|partial|compile-only|none)\b/i);
  if (!m) {
    err(rel(f), 'Verification strength must be one of: strong, partial, compile-only, none');
  }
  // Recipes are the data kickoff writes .claude/verify.json from, so a recipe with no tier
  // column makes every step fast by omission. That is the safe default, and it was also how
  // the tier feature shipped unused: recipes/README.md documented the field and not one of
  // the ten recipes carried it. A recipe with no table at all (static-site) is exempt.
  //
  // Scoped to the Verify steps section, so a recipe that grows a second table later is not
  // scanned as if it were the contract.
  //
  // The two headings have to be in that order, and it is checked rather than assumed. An
  // unguarded slice(indexOf(a), indexOf(b)) returns an empty string when b comes first, and
  // the tier check below then runs over nothing and passes - a recipe with "WRONG" in every
  // tier cell went green that way. Both headings are already required above, so the only
  // thing left to establish is their order.
  const stepsAt = text.indexOf('Verify steps');
  const strengthAt = text.indexOf('Verification strength');
  if (stepsAt !== -1 && strengthAt !== -1 && strengthAt < stepsAt) {
    err(rel(f), '"Verification strength" comes before "Verify steps". Keep the order shown in ' +
      'recipes/README.md - the tier check reads the block between them, and reversed it reads nothing.');
  }
  const section = stepsAt !== -1 && strengthAt > stepsAt ? text.slice(stepsAt, strengthAt) : '';
  const rows = [...section.matchAll(/^\|(?!\s*-)(.+)\|\s*$/gm)];
  if (rows.length) {
    const header = rows[0][1].split('|').map((c) => c.trim().toLowerCase());
    if (header[header.length - 1] !== 'tier') {
      err(rel(f), 'Verify steps table needs a final "tier" column - fast or full per step, ' +
        'decided rather than defaulted. See recipes/README.md.');
    } else {
      for (const row of rows.slice(1)) {
        const cells = row[1].split('|').map((c) => c.trim());
        const tier = cells[cells.length - 1];
        if (!['fast', 'full'].includes(tier)) {
          err(rel(f), `step "${cells[0]}" has tier "${tier}" - must be fast or full`);
        }
      }
    }
  }
}

// --- 8b. kickoff must be able to find every recipe that ships ----------------
// A recipe kickoff cannot detect is a recipe nobody reaches. kickoff's marker list had no
// "index.html" and no "vite.config.*", so a plain website and a Vite project both fell
// through to its "no recipe matches, write a new one" branch - past a finished recipe
// sitting in the same folder. A plain website is the likeliest first project for exactly
// the beginner this skill is written for.
//
// The FIRST marker on each recipe's "Detect:" line is the one kickoff must be able to see.
// Checking "any marker is covered" is not enough, and missed the bug it was written for:
// static-site detects on "`index.html` at the root with no `package.json`", where the
// second name is a marker that must be ABSENT. package.json is in kickoff's list, so the
// recipe looked reachable while the marker that identifies it was missing.
//
// The convention this rests on - primary marker first - is written down in
// recipes/README.md and holds for all ten shipped recipes.
const kickoffText = readOrErr('skills/kickoff/SKILL.md',
  'missing - it is where the stack markers live') ?? '';
const markerLine = kickoffText.split(/\r?\n/).find((l) => l.includes('`package.json`') && l.includes('·'));
if (kickoffText && !markerLine) {
  err('skills/kickoff/SKILL.md', 'the stack marker list is missing or reworded - it must be ' +
    'one line of `backticked` markers separated by "·", so CI can check the recipes against it');
} else if (markerLine) {
  const markers = [...markerLine.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const covered = (token) => markers.some((mk) =>
    mk === token ||
    (mk.endsWith('/') && token.startsWith(mk)) ||
    (mk.includes('*') && globToRe(mk).test(token)));
  for (const f of walk(join(root, 'recipes')).filter((p) => p.endsWith('.md') && !p.endsWith('README.md'))) {
    const line = readFileSync(f, 'utf8').split(/\r?\n/).find((l) => l.includes('**Detect:**'));
    if (!line) continue; // check 8 already reports a recipe with no Detect field.
    const primary = line.match(/`([^`]+)`/)?.[1];
    if (primary && !covered(primary)) {
      err(rel(f), `detects on "${primary}", which is not in kickoff's marker list - kickoff ` +
        'would never open this recipe. Add the marker to skills/kickoff/SKILL.md, or put the ' +
        'marker kickoff does look for first on the Detect line.');
    }
  }
}

// --- 9. skill descriptions must not collide ----------------------------------
// Skills auto-trigger on their description. Two similar descriptions means the wrong
// one grabs the turn, which is why the registry caps how many skills ship at all.
const STOP_WORDS = new Set(['this', 'that', 'when', 'with', 'from', 'they', 'them', 'have',
  'been', 'were', 'into', 'your', 'user', 'used', 'uses', 'using', 'will', 'does', 'each',
  'here', 'what', 'which', 'their', 'there', 'about', 'would', 'could', 'should', 'skill']);
const bag = (s) => new Set(
  s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
);
const descs = [];
for (const d of skillNames) {
  const fm = parseFrontmatter(readFileSync(join(skillsDir, d, 'SKILL.md'), 'utf8'), `skills/${d}`);
  if (fm?.description) descs.push([d, bag(fm.description)]);
}
// Agents are compared in the same pool. Two agents auto-select against each other exactly
// the way two skills do, and an agent that reads like a skill invites a turn to dispatch a
// whole subagent where a skill should have run - the same wrong-pick failure, one layer up.
for (const [name, description] of agentDefs) descs.push([`agents/${name}`, bag(description)]);
for (let i = 0; i < descs.length; i++) {
  for (let j = i + 1; j < descs.length; j++) {
    const [an, a] = descs[i];
    const [bn, b] = descs[j];
    const shared = [...a].filter((w) => b.has(w)).length;
    const jaccard = shared / (a.size + b.size - shared);
    if (jaccard > 0.35) {
      warn('skills/', `"${an}" and "${bn}" descriptions overlap ${Math.round(jaccard * 100)}% - they may compete for the same turn`);
    }
  }
}

// --- 9b. template settings must match the real plugin ------------------------
// The template pre-registers the marketplace so a clone works with no setup. If
// the plugin or marketplace is ever renamed, these keys break silently - the
// template just quietly installs nothing.
const tmplSettings = json['template/.claude/settings.json'];
if (tmplSettings && plugin && market) {
  const where = 'template/.claude/settings.json';
  const mkts = Object.keys(tmplSettings.extraKnownMarketplaces ?? {});
  if (!mkts.includes(market.name)) {
    err(where, `extraKnownMarketplaces must contain "${market.name}" (found: ${mkts.join(', ') || 'none'})`);
  }
  for (const [name, entry] of Object.entries(tmplSettings.extraKnownMarketplaces ?? {})) {
    const src = entry?.source;
    if (!src?.source) err(where, `marketplace "${name}" needs a source object with a "source" kind`);
    else if (src.source === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(src.repo ?? '')) {
      err(where, `marketplace "${name}" github source needs repo as "owner/repo", got "${src.repo}"`);
    }
  }
  const expected = `${plugin.name}@${market.name}`;
  const enabled = Object.keys(tmplSettings.enabledPlugins ?? {});
  if (!enabled.includes(expected)) {
    err(where, `enabledPlugins must contain "${expected}" (found: ${enabled.join(', ') || 'none'})`);
  }
}

// --- 10. always-on token budget ----------------------------------------------
// Mirrors the cost function in the Claude Code binary:
//   skipped entirely when disableModelInvocation is set,
//   otherwise 2 + name.length + 2 + description.length + 1 characters.
// Skills without disable-model-invocation ride along on EVERY turn of EVERY
// session, so this is the framework's standing tax on its users.
let alwaysOn = 0;
const costs = [];
for (const d of skillNames) {
  const fm = parseFrontmatter(readFileSync(join(skillsDir, d, 'SKILL.md'), 'utf8'), `skills/${d}`);
  if (!fm?.description) continue;
  if (String(fm['disable-model-invocation']).toLowerCase() === 'true') {
    costs.push([d, 0]);
    continue;
  }
  // Claude Code lists a plugin skill as "- <plugin>:<skill>: <description>", so the name
  // it measures carries the plugin prefix. Seen in a session transcript, 2026-09-23.
  const listed = `${plugin?.name ?? ''}:${d}`;
  const tok = Math.round((2 + listed.length + 2 + fm.description.length + 1) / 4);
  alwaysOn += tok;
  costs.push([d, tok]);
}
// rules/*.md are copied into every project and loaded on every turn too - policing
// only skill descriptions would police the smaller half.
//
// EXCEPT a rule that declares `paths:`. Claude Code loads those only when it touches a
// matching file, so they are not always-on and counting them says a project pays for
// standards on a turn that opens no source file. Counting them anyway is not a safe
// over-estimate: it makes the budget punish the very move that lowers the real cost,
// so the honest way to get under the cap would be to delete a rule rather than scope
// one. The scoped files are still measured and reported, just not against the cap.
let rulesTok = 0;
let scopedTok = 0;
for (const f of walk(join(root, 'rules')).filter((p) => p.endsWith('.md'))) {
  const text = readFileSync(f, 'utf8');
  // HTML comments are stripped before a rule reaches Claude: a transcript showed a
  // 805-character rule arriving as 480. Counting them made the notes that explain a rule
  // look like part of what it costs, which is a reason to delete the notes.
  const tok = Math.round(text.replace(/<!--[\s\S]*?-->/g, '').length / 4);
  // Not parseFrontmatter(): that one is for skills and commands, where every line is
  // "key: value" and a missing block is an error. A rule legitimately has no block, and
  // `paths:` takes a YAML list. Only the question "does this file scope itself?" matters.
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fm && /^paths\s*:/m.test(fm[1])) { scopedTok += tok; continue; }
  rulesTok += tok;
}
alwaysOn += rulesTok;

// agents/*.md cost on every turn too: each shipped agent's name, description and tool list
// are rendered into the Agent tool's description, which is sent whether a turn dispatches
// anything or not. Leaving them out would let the budget's blind spot grow the moment this
// plugin shipped its first agent - the same hole design-taste sat in.
//
// Unlike the skill figure above, this formula is NOT copied out of the binary. It measures
// the rendered line - "- name: description (Tools: …)" - at the chars/4 rule this file uses
// everywhere else. It is an estimate, and it reads slightly high rather than low, which is
// the safe direction for a cap.
let agentsTok = 0;
for (const [name, description, tools] of agentDefs) {
  agentsTok += Math.round(`- ${name}: ${description} (Tools: ${tools})\n`.length / 4);
}
alwaysOn += agentsTok;

const budget = registry?.max_always_on_tokens;
if (budget && alwaysOn > budget) {
  costs.sort((a, b) => b[1] - a[1]);
  err('skills/', `always-on cost ${alwaysOn} tok/turn exceeds budget ${budget}. ` +
    `Largest: ${costs.slice(0, 3).map(([n, t]) => `${n} ${t}`).join(', ')}. ` +
    `Split: rules ${rulesTok}, skill descriptions ${alwaysOn - rulesTok - agentsTok}, ` +
    `agent descriptions ${agentsTok}. ` +
    'Set disable-model-invocation on occasional skills, drop an agent, or raise ' +
    'max_always_on_tokens deliberately.');
}

// --- 10b. stated costs must match the measured figure ------------------------
// Three places once disagreed about the same number: README said ~1,111 tok/turn,
// registry.json said ~881, and this script measured 1,108. The framework argues
// for itself on cost precision, so a stale figure undercuts the pitch. The README
// sentence is mandatory and exact; the registry's rounded aside is checked only
// if it is still phrased that way.
const skillsTok = alwaysOn - rulesTok - agentsTok;
const readme = readOrErr('README.md', 'missing - the per-turn cost claim is checked against it') ?? '';
const claim = readme.match(
  /\*\*~([\d,]+) tokens per turn\*\*: ~([\d,]+) of rules, ~([\d,]+) of skill descriptions, ~([\d,]+) of agent descriptions/
);
// Guarded on `claim`, not on `readme`. A missing README leaves both falsy, and the old
// `readme && !claim` sent that case into the else branch to read claim[1] off null - so
// the one file every other check reports around took the whole report down with a stack
// trace. readOrErr has already recorded the absence; there is nothing left to compare.
if (!claim) {
  if (readme) {
    err('README.md', 'the per-turn cost sentence is missing or reworded. It must read ' +
      '"**~N tokens per turn**: ~N of rules, ~N of skill descriptions, ~N of agent ' +
      'descriptions" so CI can check it against the measured figure ' +
      `(currently ${alwaysOn}, ${rulesTok}, ${skillsTok}, ${agentsTok}).`);
  }
} else {
  const parts = [['total', alwaysOn], ['rules', rulesTok], ['skill descriptions', skillsTok],
    ['agent descriptions', agentsTok]];
  parts.forEach(([label, measured], i) => {
    if (Number(claim[i + 1].replace(/,/g, '')) !== measured) {
      err('README.md', `claims ~${claim[i + 1]} tokens/turn of ${label}, measured ` +
        `${measured.toLocaleString('en-US')}. Update the sentence in ## Costs.`);
    }
  });
}

// --- 10c. every README's cost figures, translations included -----------------
// The sentence check above reads README.md and nothing else, so the same three numbers in
// README.th.md were never checked - in a file whose own history is the reason check 12
// exists, because it shipped three wrong rows in translation. A Thai sentence cannot be
// matched with an English regex, so the figures travel as a marker instead, the way the
// always-on count already does. It survives translation and any rewrite of the prose.
for (const f of walk(root)) {
  const r = rel(f);
  if (!/^README(\.[a-z]{2})?\.md$/.test(r) || !isOurs(f)) continue;
  const m = readFileSync(f, 'utf8').match(/<!--\s*cost:(\d+),(\d+),(\d+),(\d+)\s*-->/);
  if (!m) {
    err(r, 'the cost section must carry ' +
      `<!--cost:${alwaysOn},${rulesTok},${skillsTok},${agentsTok}--> beside its figures ` +
      '(total, rules, skill descriptions, agent descriptions), so a number written in prose ' +
      '- in any language - cannot drift from the measured one');
    continue;
  }
  const parts = [['total', alwaysOn], ['rules', rulesTok], ['skill descriptions', skillsTok],
    ['agent descriptions', agentsTok]];
  parts.forEach(([label, measured], i) => {
    if (Number(m[i + 1]) !== measured) {
      err(r, `its cost marker claims ${m[i + 1]} tokens/turn of ${label}, measured ${measured}`);
    }
  });
}

// --- 10d. the measured cost, as Claude Code reports it -----------------------
// Everything above is an estimate from file lengths. It said ~958 tokens per turn while a
// set-up project, measured, cost ~2,200: it counted 4 characters as one token and left out
// the CLAUDE.md that kickoff writes. scripts/measure-cost.mjs asks Claude Code instead and
// saves the answer in docs/cost.json. CI cannot re-run it - that needs a login and costs
// money - so it checks what it can: every stated figure quotes that file exactly, and the
// file still describes the plugin as it is now.
let cost = null;
try { cost = JSON.parse(readFileSync(join(root, COST_FILE), 'utf8')); } catch {
  err(COST_FILE, 'missing or not JSON - run "node scripts/measure-cost.mjs --write" to measure ' +
    'what a turn costs, since every cost figure in the README quotes it');
}
if (cost) {
  const p = cost.parts ?? {};
  const want = [cost.total, p.plugin, p.state, p.claudeMd, p.rules];
  if (want.some((n) => !Number.isInteger(n))) {
    err(COST_FILE, 'needs "total" and "parts" with plugin, state, claudeMd and rules - re-run ' +
      '"node scripts/measure-cost.mjs --write"');
  } else {
    const k = (cost.total / 1000).toFixed(1);
    for (const f of walk(root)) {
      const r = rel(f);
      if (!/^README(\.[a-z]{2})?\.md$/.test(r) || !isOurs(f)) continue;
      const text = readFileSync(f, 'utf8');
      const m = text.match(/<!--\s*measured:(\d+),(\d+),(\d+),(\d+),(\d+)\s*-->/);
      if (!m) {
        err(r, `the cost section must carry <!--measured:${want.join(',')}--> beside the measured ` +
          `figures from ${COST_FILE} (total, plugin, state, CLAUDE.md, rules)`);
      } else if (m.slice(1).map(Number).join() !== want.join()) {
        err(r, `its measured-cost marker says ${m.slice(1).join(',')}, but ${COST_FILE} says ` +
          `${want.join(',')}. Update the figures beside it too.`);
      }
      const badge = text.match(/badge\/costs-~([\d.]+)k/);
      if (badge && badge[1] !== k) {
        err(r, `its badge says ~${badge[1]}k tokens/turn, but ${COST_FILE} measured ~${k}k`);
      }
    }
    const rounded = (readOrErr('skills/registry.json', 'missing - the curated-skill rules live there') ?? '')
      .match(/framework measured at ~([\d.]+)k tokens\/turn/);
    if (rounded && rounded[1] !== k) {
      err('skills/registry.json', `says the framework costs ~${rounded[1]}k tokens/turn, ` +
        `${COST_FILE} measured ~${k}k.`);
    }
    if (cost.inputs !== costFingerprint(root)) {
      warn(COST_FILE, `measured on ${cost.measured}, and the files that set the cost changed ` +
        'since. The figures may be stale: run "node scripts/measure-cost.mjs --write" and update ' +
        'the README.');
    }
  }
}

// --- 11. the STATE.md compaction rule must not drift -------------------------
// docs/STATE.md is read at the start of every session, so the cap on "## Done" is
// what keeps the framework's memory from becoming its largest cost. The rule is
// stated in four places - the file's own comment, kickoff's template, build-task
// and ship - and a number living in prose in four places is exactly the drift the
// cost claim above is checked for. The README is a pitch, not a spec, and says
// "rolls into a changelog" without a number on purpose.
for (const f of [
  'template/docs/STATE.md', 'skills/kickoff/SKILL.md',
  'skills/build-task/SKILL.md', 'skills/ship/SKILL.md',
]) {
  const text = readOrErr(f, 'missing - it is one of the four places the "## Done" cap is stated');
  if (text === null) continue;
  if (!/ten most recent/.test(text)) {
    err(f, 'must state the "## Done" cap as "ten most recent" - changing the cap means changing it in all four places at once');
  }
  if (!/docs\/CHANGELOG\.md/.test(text)) {
    err(f, 'states the "## Done" cap but not where the older entries go (docs/CHANGELOG.md) - a cap without a destination reads as "delete them"');
  }
}

// --- 11c. autoship must keep the promise it makes ------------------------------
// /easyclaude:autoship tells the user it fires only when docs/STATE.md has nothing left
// under Now, Next or Blocked. build-task checked that before it called ship, and ship did
// not, so any other way into ship's automatic mode pushed with tasks still open. Found on
// 2026-10-04. The promise and both places that keep it must name all three sections.
const autoshipPromise = [
  ['commands/autoship.md', ['Now', 'Next', 'Blocked'].map((s) => new RegExp(`\\b${s}\\b`))],
  ['skills/build-task/SKILL.md', ['## Now', '## Next', '## Blocked'].map((s) => new RegExp(s))],
  ['skills/ship/SKILL.md', ['## Now', '## Next', '## Blocked'].map((s) => new RegExp(s))],
];
for (const [f, sections] of autoshipPromise) {
  const text = readOrErr(f, 'missing - it states or keeps the autoship promise');
  if (text === null) continue;
  if (!sections.every((re) => re.test(text))) {
    err(f, 'must name the Now, Next and Blocked sections of docs/STATE.md - /easyclaude:autoship ' +
      'promises it fires only when all three are empty, and ship and build-task both keep that promise');
  }
}

// --- 12. only skills that can hear a phrase may be promised one ----------------
// Every README so far has promised that "is this safe to make public?" and "put it
// online" trigger security-check and deploy on their own. Both set
// disable-model-invocation - the flag that removes them from per-turn cost - so
// neither can fire on plain English at all, and the costs section of the same file
// said so. Nothing in CI read a description for meaning, so the two halves drifted.
//
// Each row of a "you say" table carries an invisible <!--skill:name--> marker. The
// set of marked skills must equal the set that can actually fire unprompted - which
// catches a phrase promised for a typed skill AND a spoken skill nobody documented.
// Being a comment, it survives a rewrite of the surrounding prose and works the same
// in a translation.
const spoken = new Set();
for (const d of skillNames) {
  if (vendoredDirs.has(join(skillsDir, d))) continue;
  const fm = parseFrontmatter(readFileSync(join(skillsDir, d, 'SKILL.md'), 'utf8'), `skills/${d}`);
  if (String(fm?.['disable-model-invocation']).toLowerCase() !== 'true') spoken.add(d);
}
// Matched on the repo-relative path, which rel() has already normalised to forward
// slashes - matching the absolute path needs a separator class that is easy to get
// wrong on Windows and then passes anyway in Linux CI.
for (const f of walk(root)) {
  const r = rel(f);
  if (!/^README(\.[a-z]{2})?\.md$/.test(r) || !isOurs(f)) continue;
  const text = readFileSync(f, 'utf8');
  // Every front-door README carries the full set, translations included. A
  // translation restates the same promises, so letting an unmarked one through is
  // exactly the drift this is for: README.th.md shipped the three bad rows too.
  const marked = new Set([...text.matchAll(/<!--\s*skill:([a-z][a-z-]*)\s*-->/g)].map((m) => m[1]));
  for (const m of marked) {
    if (!spoken.has(m)) {
      err(r, skillNames.includes(m)
        ? `promises a phrase for "${m}", which sets disable-model-invocation - it can only be run as /${ns}:${m}`
        : `marks "${m}", which is not a skill in this plugin`);
    }
  }
  for (const d of spoken) {
    if (!marked.has(d)) {
      err(r, `skill "${d}" fires on plain English but no row is marked <!--skill:${d}--> - a trigger nobody documented is one nobody can check`);
    }
  }
}

// --- 11b. the template must actually reach kickoff -------------------------
// template/README.md promises "Kickoff runs on its own the first time". It did not. The
// hook decides on whether docs/STATE.md exists, and the template ships that file - so the
// hook read the empty stub back to the user and never invoked kickoff. The first thing
// every new user hit, and nothing could see it, because each half was correct alone.
//
// Three parts, each useless without the others: the template carries the marker, the hook
// knows the marker, and kickoff's own template does NOT carry it - otherwise every project
// kickoff sets up would claim forever that it had never been set up.
const NOT_KICKED_OFF = '<!-- easyclaude:not-kicked-off -->';
const stateStub = readOrErr('template/docs/STATE.md',
  'missing - it is what a fork of the template starts from') ?? '';
if (stateStub && !stateStub.includes(NOT_KICKED_OFF)) {
  err('template/docs/STATE.md', `must carry ${NOT_KICKED_OFF}, or the SessionStart hook reads ` +
    'the empty stub as a set-up project and never runs kickoff - which template/README.md promises');
}
// The hook is a command now, so the marker lives in the script it runs, not in hooks.json.
const sessionScripts = (hooks?.SessionStart ?? []).flatMap((e) => e.hooks ?? [])
  .flatMap((h) => [...(h.command ?? '').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/g)])
  .map((m) => (existsSync(join(root, m[1])) ? readFileSync(join(root, m[1]), 'utf8') : ''));
const hookPrompt = JSON.stringify(hooks?.SessionStart ?? '') + sessionScripts.join('\n');
if (hooks?.SessionStart && !hookPrompt.includes(NOT_KICKED_OFF)) {
  err('hooks/hooks.json', `the SessionStart hook must test for ${NOT_KICKED_OFF}, or a fresh ` +
    'fork of the template never reaches kickoff');
}
// Anchored on an exact phrase, so the phrase has to be there. slice(indexOf(...)) with no
// guard returns the LAST CHARACTER when the search misses, and the check then passes on a
// one-character string - so rewording this heading alone silently switched the check off,
// marker planted and all. A check that stops checking is the failure this file exists for,
// and it does not get an exemption for being in this file.
const STATE_ANCHOR = '`docs/STATE.md` starts as';
const stateAt = kickoffText.indexOf(STATE_ANCHOR);
if (kickoffText && stateAt === -1) {
  err('skills/kickoff/SKILL.md', `must introduce its state template with the exact phrase ` +
    `"${STATE_ANCHOR}" - it is the anchor CI uses to find that template and check it`);
} else if (stateAt !== -1 && kickoffText.slice(stateAt).includes(NOT_KICKED_OFF)) {
  err('skills/kickoff/SKILL.md', `its docs/STATE.md template carries ${NOT_KICKED_OFF} - every ` +
    'project it sets up would then report itself as never set up, on every session');
}

// --- 12b. the hook's time limit and the gate's own budget must agree ---------
// Claude Code kills the Stop hook at the timeout in hooks.json. verify.mjs holds the same
// number so it can warn when a fast tier could take longer than the hook is allowed to
// live - a gate that gets killed returns no verdict, blocks nothing, and says nothing
// about why. Two copies of one number is the drift this file exists to catch.
const stopHook = (hooks?.Stop ?? []).flatMap((e) => e.hooks ?? []).find((h) => h.type === 'command');

// --- 12a. the Stop hook must actually run the gate ---------------------------
// Everything else here checks the hook's edges: that its timeout matches, that the script
// it names exists, that a prompt hook cannot loop. Nothing checked the one thing the whole
// plugin rests on - that the command runs the gate at all. Replacing it with `echo hello`
// left the framework with no enforcement whatsoever and a validator printing OK.
//
// Deleting the hook outright was caught, but only by accident: other documents then
// mentioned a Stop hook that no longer existed. Rewriting the command was caught by
// nothing, which is the quieter and therefore likelier mistake.
if (hooks && !stopHook) {
  err('hooks/hooks.json', 'no Stop command hook. The verify gate is what this plugin is for, ' +
    'and this entry is the only thing that runs it.');
} else if (stopHook && !/verify\.mjs["']?\s+--hook\b/.test(stopHook.command ?? '')) {
  err('hooks/hooks.json', `the Stop hook runs ${JSON.stringify(stopHook.command)}, which does ` +
    'not invoke scripts/verify.mjs --hook. Every other check here would still pass, and no ' +
    'turn in any project would ever be verified.');
}

const budgetInScript = (readOrErr('scripts/verify.mjs',
  'missing - it is the gate') ?? '').match(/const HOOK_TIMEOUT_MS = ([\d_]+);/);
if (stopHook && budgetInScript) {
  const declared = Number(budgetInScript[1].replace(/_/g, ''));
  const actual = Number(stopHook.timeout) * 1000;
  if (declared !== actual) {
    err('scripts/verify.mjs', `HOOK_TIMEOUT_MS is ${declared}ms, but the Stop hook in ` +
      `hooks/hooks.json is killed after ${stopHook.timeout}s (${actual}ms). The gate would ` +
      'warn at the wrong point, or not at all.');
  }
} else if (stopHook && !budgetInScript) {
  err('scripts/verify.mjs', 'no "const HOOK_TIMEOUT_MS = <n>;" line - it is what lets the gate ' +
    'warn before a fast tier outlives the Stop hook that runs it');
}

// --- 13. one security policy, two copies, no drift ---------------------------
// rules/permissions.json is what kickoff merges into a project. template/.claude/
// settings.json is what anyone forking the template gets. They are the same policy
// written twice, and nothing noticed if a guardrail was added to one and not the
// other - which fails silently and in the unsafe direction.
const denyRules = json['rules/permissions.json']?.deny;
const denyTemplate = json['template/.claude/settings.json']?.permissions?.deny;
if (!Array.isArray(denyRules)) {
  err('rules/permissions.json', 'missing the "deny" array');
} else if (!Array.isArray(denyTemplate)) {
  err('template/.claude/settings.json', 'missing permissions.deny');
} else {
  const inRules = new Set(denyRules);
  const inTemplate = new Set(denyTemplate);
  for (const rule of denyRules) {
    if (!inTemplate.has(rule)) {
      err('template/.claude/settings.json', `does not deny ${JSON.stringify(rule)}, which rules/permissions.json does - anyone forking the template runs without that guardrail`);
    }
  }
  for (const rule of denyTemplate) {
    if (!inRules.has(rule)) {
      err('rules/permissions.json', `does not deny ${JSON.stringify(rule)}, which the template does - a project set up by kickoff runs without that guardrail`);
    }
  }
}

// --- 13b. every command guardrail must be able to match something ------------
// Claude Code splits a command at |, &&, ||, ; and & and checks each part on its own, and
// it reads :* as a wildcard only at the very end of a pattern. So Bash(curl:* | sh) could
// never match any command - and it, with two like it, sat in this list from the first
// commit, blocking nothing, with every check green. A rule that cannot match is worse
// than no rule, because the README says the thing is blocked.
//
// And on Windows the PowerShell tool is on by default. A Bash rule does not cover it, so
// every git guardrail needs a PowerShell twin, or force-pushing is one tool away.
if (Array.isArray(denyRules)) {
  const SEPARATOR = /\||&&|;|(^|\s)&(\s|$)/;
  const shellRules = denyRules
    .map((rule) => rule.match(/^(Bash|PowerShell)\((.*)\)$/))
    .filter(Boolean);
  for (const [rule, , pattern] of shellRules) {
    if (SEPARATOR.test(pattern)) {
      err('rules/permissions.json', `${JSON.stringify(rule)} can never match: Claude Code splits a ` +
        'command at |, &&, ; and & and checks each part alone. Deny the part instead, such as Bash(sh) ' +
        'for curl ... | sh');
    }
    if (pattern.slice(0, -2).includes(':*')) {
      err('rules/permissions.json', `${JSON.stringify(rule)} has :* before the end of the pattern, where ` +
        'Claude Code reads it as a literal colon. Write a space and * instead');
    }
  }
  const psPatterns = new Set(shellRules.filter((m) => m[1] === 'PowerShell').map((m) => m[2]));
  for (const [rule, tool, pattern] of shellRules) {
    if (tool === 'Bash' && /^git\s/.test(pattern) && !psPatterns.has(pattern)) {
      err('rules/permissions.json', `${JSON.stringify(rule)} has no PowerShell(${pattern}) twin - on ` +
        'Windows the PowerShell tool is on by default, and a Bash rule does not cover it');
    }
  }
}

// --- 14. the template must protect what its own docs say it protects ---------
// template/.env.example tells the user to copy it to .env and paste real API keys in, and
// says ".env is gitignored" while it says so. The template shipped no .gitignore at all, so
// that sentence was false for everyone who forked it - the only drift this file has ever
// checked for that leaks credentials rather than confusing somebody. The other two are
// per-person authorisation: committing them hands one person's choice to every clone.
const tmplIgnore = readOrErr('template/.gitignore',
  'missing - template/.env.example tells the user to put real API keys in .env, so the template must ignore it');
if (tmplIgnore !== null) {
  const ignored = new Set(tmplIgnore.split(/\r?\n/).map((l) => l.trim()));
  const mustIgnore = [
    ['.env', 'real API keys, and .env.example tells the user to put them there'],
    ['.claude/autoship.json', 'standing authorisation to commit and push on one person\'s behalf'],
    ['.claude/cheap-session', 'one person\'s cheap stretch, not a property of the repo'],
    ['.claude/cheap-contract.md', 'the contract that stretch runs under - planted per person, not per repo'],
  ];
  for (const [pattern, why] of mustIgnore) {
    if (!ignored.has(pattern)) err('template/.gitignore', `does not ignore "${pattern}" - ${why}`);
  }
}

// --- 14b. a tracked autoship.json authorises nothing, everywhere --------------
// .gitignore cannot stop a repository shipping autoship.json. The scripts ignore a tracked
// copy (personal.mjs), but the two skills that act on it read the file themselves, so each
// must run the same git question first. A copy of the rule in prose is the drift check 11
// exists for, so the question has to appear word for word.
for (const f of ['skills/ship/SKILL.md', 'skills/build-task/SKILL.md']) {
  const text = readOrErr(f, 'missing - it acts on .claude/autoship.json');
  if (text !== null && !text.includes('git ls-files --error-unmatch .claude/autoship.json')) {
    err(f, 'acts on .claude/autoship.json but never asks `git ls-files --error-unmatch ' +
      '.claude/autoship.json` - a copy that came with the repository would authorise a push');
  }
}

// --- 15. the cost section must count the skills that are actually always-on --
// Both READMEs said five skills trigger constantly, and named the five. There were six: the
// vendored design-taste set no disable-model-invocation, so it rode along on every turn -
// and at 156 tokens it was the largest single line in the always-on budget it went
// unmentioned in. Check 12 could not catch this, because it deliberately excludes vendored
// skills from the phrase table. So the count travels as a marker rather than a word: it
// survives translation, which is exactly where the same claim was also wrong.
//
// design-taste is gone and nothing is vendored today, so the marker currently agrees with
// the plain reading of the prose. That is not a reason to drop the check. The next vendored
// skill will arrive with a description nobody thinks of as a cost, which is how the first
// one got in.
const alwaysOnSkills = costs.filter(([, t]) => t > 0);
for (const f of walk(root)) {
  const r = rel(f);
  if (!/^README(\.[a-z]{2})?\.md$/.test(r) || !isOurs(f)) continue;
  const m = readFileSync(f, 'utf8').match(/<!--\s*always-on:(\d+)\s*-->/);
  if (!m) {
    err(r, `the cost section must carry <!--always-on:${alwaysOnSkills.length}--> beside its count ` +
      'of always-on skills, so a number written in prose cannot drift from the measured set');
  } else if (Number(m[1]) !== alwaysOnSkills.length) {
    err(r, `claims ${m[1]} always-on skills, measured ${alwaysOnSkills.length} ` +
      `(${alwaysOnSkills.map(([n]) => n).sort().join(', ')})`);
  }
}

// --- 16. eval cases must stay loadable ---------------------------------------
// `claude plugin eval` runs these cases, but it costs money and needs a login, so CI does
// not run it. Files nobody runs are files nobody notices going stale. This check is the
// answer to that: the shape of every case is verified on each push, so the suite is wrong
// loudly rather than quietly.
//
// The rules below are not invented. The field names come from the CLI's own schema, and
// the three floor invariants - a negative case, an outcome grader per case, runs >= 3 -
// come from its authoring guidance. What cannot be checked here is whether a case PASSES.
// Only the real runner does that.
const CASE_TOP = new Set(['schema_version', 'name', 'description', 'tags', 'plugins', 'runs', 'expected_outcome']);
const CASE_EXEC = new Set(['model', 'max_turns', 'timeout_seconds', 'allowed_tools',
  'artifact_publish', 'growthbook_overrides', 'append_system_prompt', 'env']);
const GRADER_TYPES = new Set(['regex', 'tool_order', 'tool_used', 'file_exists', 'llm', 'baseline']);

// The runner reads this frontmatter as YAML, so `allowed_tools: [Skill, Read]` and a block
// list of "- Skill" lines mean the same thing to it. parseFrontmatter above is line-based -
// it mirrors how Claude Code reads a SKILL.md - and it rejects the block form outright:
// four "not key: value" errors, plus a false "Skill is not in allowed_tools" on top of
// them. That fails a suite the runner would have accepted, which is the same mistake as
// failing a notes file in graders/, made in the second of the two places it could be made.
const unquoteYaml = (v) => v.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
function parseEvalFrontmatter(raw, file) {
  const m = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) {
    err(file, 'no parseable frontmatter - file must open with a bare --- line');
    return null;
  }
  const fm = {};
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { fm[listKey].push(unquoteYaml(item[1])); continue; }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      err(file, `frontmatter line is not "key: value" -> ${line.trim()}`);
      listKey = null;
      continue;
    }
    const value = kv[2].trim();
    // A key with nothing after the colon opens a block list. If no "- item" lines follow,
    // it stays an empty list, which is what an empty YAML value means here anyway.
    if (value === '') { fm[kv[1]] = []; listKey = kv[1]; } else { fm[kv[1]] = unquoteYaml(value); listKey = null; }
  }
  return fm;
}
// Reads either form back as a list, so nothing downstream has to care which was written.
const asList = (v) => (Array.isArray(v) ? v
  : typeof v === 'string' ? v.replace(/^\[|\]$/g, '').split(',').map(unquoteYaml).filter(Boolean)
    : []);

// The CLI globs `<eval dir>/**`, so a case may sit at any depth. Reading only the top
// level covered part of the suite while reporting on all of it - a case one folder deeper
// carried an unknown key AND an invalid grader type and this printed OK. A check that
// silently covers a subset is the failure this file exists for.
//
// A directory holding prompt.md OR graders/ is a case. One holding graders/ and no
// prompt.md is a case that can never run, and it must be found rather than skipped: the
// old filter required prompt.md to be there, so exactly that case was invisible.
const evalsDir = join(root, 'evals');
function findCaseDirs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    // results/ is where the runner writes its own output. It is not a case.
    if (entry === 'graders' || entry === 'results') continue;
    const p = join(dir, entry);
    if (!statSync(p).isDirectory()) continue;
    if (existsSync(join(p, 'prompt.md')) || existsSync(join(p, 'graders'))) out.push(p);
    else findCaseDirs(p, out);
  }
  return out;
}
const caseDirs = existsSync(evalsDir) ? findCaseDirs(evalsDir) : [];

// The other supported form. A full case.yaml needs a YAML parser, and this script has no
// dependencies, so a case written that way would sit unchecked - the one thing this check
// exists to prevent.
//
// One narrow shape is allowed: a case.yaml beside prompt.md that carries only the
// scaffold. prompt.md frontmatter cannot hold `context`, and without a scaffold every case
// ran in an empty folder, where the SessionStart hook rightly sends everything to kickoff.
// The first real run showed that: no case fired the skill it names. The runner merges
// the two files, so the prompt, the settings and the graders all stay in the form checked
// below. Anything more than the scaffold in case.yaml is refused.
const SCAFFOLD_ONLY = /^schema_version: *"?[\d.]+"?\nname: *(\S+)\ncontext:\n +scaffold_script: *(\S+)$/;
for (const f of existsSync(evalsDir) ? walk(evalsDir) : []) {
  if (basename(f) !== 'case.yaml') continue;
  const dir = dirname(f);
  const body = readFileSync(f, 'utf8').split(/\r?\n/)
    .filter((l) => l.trim() && !l.trimStart().startsWith('#')).join('\n');
  const m = body.match(SCAFFOLD_ONLY);
  if (!m || !existsSync(join(dir, 'prompt.md'))) {
    err(rel(f), 'check 16 reads the prompt.md + graders/ form. It accepts a case.yaml only ' +
      'beside a prompt.md, holding schema_version, name and context.scaffold_script and ' +
      'nothing else. Anything more would go unchecked. Move it into prompt.md or graders/.');
    continue;
  }
  if (m[1] !== basename(dir)) {
    err(rel(f), `"name: ${m[1]}" does not match the directory`);
  }
  // The runner refuses a scaffold path outside the case directory, so check the same.
  const script = join(dir, m[2]);
  if (m[2].startsWith('/') || m[2].split(/[\\/]/).includes('..')) {
    err(rel(f), `scaffold_script "${m[2]}" leaves the case directory - the runner refuses that`);
  } else if (!existsSync(script)) {
    err(rel(f), `scaffold_script "${m[2]}" does not exist, so every run of this case fails to start`);
  }
}

let negativeCases = 0;
for (const dir of caseDirs) {
  const where = rel(dir);
  if (!existsSync(join(dir, 'prompt.md'))) {
    err(where, 'has graders/ but no prompt.md. The runner needs a prompt and would reject ' +
      'the case outright, so this one can never run.');
    continue;
  }
  const raw = readFileSync(join(dir, 'prompt.md'), 'utf8');
  const fm = parseEvalFrontmatter(raw, `${where}/prompt.md`);
  if (!fm) continue;

  // The body IS the prompt under test. An empty one runs the model against nothing and
  // scores whatever comes back, which reads as a passing case.
  const body = raw.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').trim();
  if (!body) err(`${where}/prompt.md`, 'has no body - the body is the prompt the case tests');

  for (const k of Object.keys(fm)) {
    if (!CASE_TOP.has(k) && !CASE_EXEC.has(k)) {
      err(`${where}/prompt.md`, `unknown frontmatter key "${k}" - the runner rejects the whole ` +
        `case for this. Expected one of: ${[...CASE_TOP, ...CASE_EXEC].join(', ')}`);
    }
  }
  for (const k of ['schema_version', 'name']) {
    if (!fm[k]) err(`${where}/prompt.md`, `missing required "${k}"`);
  }
  if (fm.name && fm.name !== basename(dir)) {
    err(`${where}/prompt.md`, `"name: ${fm.name}" does not match the directory - --case filters ` +
      'on the name, so a mismatch runs something other than what the folder says');
  }
  // Three runs is the floor the CLI's own guidance sets. One run of a model is an anecdote.
  const runs = Number(fm.runs ?? 3);
  if (!(runs >= 3)) err(`${where}/prompt.md`, `runs: ${fm.runs} - three is the minimum, or a single lucky turn decides the result`);

  if (asList(fm.tags).some((t) => t.toLowerCase() === 'negative')) negativeCases++;
  // An outcome case is graded by scripts/bench.mjs from its check.mjs, after the run. The
  // runner never reads that file, so without this nothing notices it is missing until a
  // paid run reports a case it could not grade.
  if (asList(fm.tags).some((t) => t.toLowerCase() === 'outcome') && !existsSync(join(dir, 'check.mjs'))) {
    err(where, 'is tagged outcome but has no check.mjs, so scripts/bench.mjs has nothing to grade it with');
  }

  const gradersDir = join(dir, 'graders');
  const graderFiles = existsSync(gradersDir)
    ? walk(gradersDir).filter((p) => p.endsWith('.md'))
    : [];
  if (!graderFiles.length) {
    err(where, 'no graders/*.md - a case with nothing to grade scores nothing');
    continue;
  }

  const allowed = new Set(asList(fm.allowed_tools));
  let outcomeGraders = 0;
  let realGraders = 0;
  for (const g of graderFiles) {
    const gWhere = `${where}/graders/${basename(g)}`;
    const text = readFileSync(g, 'utf8');
    // The runner skips a file here that has no frontmatter, so notes may live beside the
    // graders. Treating that as an error made this stricter than the tool it checks for -
    // it failed a suite the runner would have accepted, which teaches people to work
    // around the checker. It is still worth saying out loud, because a grader that was
    // meant to count and lost its frontmatter is inert and looks fine in a diff.
    if (!/^---[ \t]*\r?\n/.test(text)) {
      warn(gWhere, 'has no frontmatter, so the runner ignores it. That is correct for a ' +
        'notes file, and silent breakage for anything meant to grade.');
      continue;
    }
    const gfm = parseEvalFrontmatter(text, gWhere);
    if (!gfm) continue;
    realGraders++;
    if (!GRADER_TYPES.has(gfm.type)) {
      err(gWhere, `type "${gfm.type ?? '(missing)'}" is not one of: ${[...GRADER_TYPES].join(' | ')}`);
      continue;
    }
    // "Grade outcomes, not trajectories." A case whose only grader is tool_used proves the
    // skill fired and nothing about whether it did the job - and under ablation that grader
    // is an indicator, excluded from the score, so such a case scores on nothing at all.
    if (gfm.type !== 'tool_used') outcomeGraders++;
    if (gfm.type === 'tool_used') {
      if (!gfm.tool) err(gWhere, 'a tool_used grader needs "tool"');
      // A tool the case never allows can never be used, so the assertion passes on a
      // technicality. It matters most in the negative direction: a max:0 case with Skill
      // withheld proves nothing, because nothing could have fired anyway.
      else if (!allowed.has(gfm.tool)) {
        err(gWhere, `asserts on the "${gfm.tool}" tool, which is not in allowed_tools ` +
          `(${[...allowed].join(', ') || 'empty'}). The tool cannot be used, so the case ` +
          'passes without testing anything.');
      }
      // The whole point of these cases is which skill answers. A renamed skill must break
      // them loudly rather than leave them asserting on a name nothing can match.
      if (gfm.input_match && gfm.tool === 'Skill' && !skillNames.includes(gfm.input_match)) {
        err(gWhere, `matches skill "${gfm.input_match}", which is not a skill in this plugin`);
      }
      // The runner defaults min to 1, so "max: 0" alone means 1..0 and can never pass. All
      // three should-not-fire graders were written that way, and the first real run failed
      // every one of them whatever the model did.
      if (gfm.max !== undefined && gfm.min === undefined && Number(gfm.max) < 1) {
        err(gWhere, `"max: ${gfm.max}" with no "min" - the runner defaults min to 1, so this ` +
          'grader can never pass. Add "min: 0".');
      }
    }
  }
  // Every file in graders/ being a note is a case that grades nothing at all, which the
  // file count above cannot see - it counted notes as graders.
  if (!realGraders) {
    err(where, 'nothing in graders/ carries frontmatter, so the runner sees no graders here ' +
      'and the case scores nothing.');
  } else if (!outcomeGraders) {
    err(where, 'every grader here is tool_used. At least one must grade the outcome, or the ' +
      'case only proves a skill fired and never that it helped.');
  }
}

// A suite of nothing but should-fire cases cannot catch a framework that fires on
// everything, which is the worse of the two failures.
if (caseDirs.length && !negativeCases) {
  err('evals/', 'no case is tagged "negative". At least one must assert that nothing fires, ' +
    'or the suite cannot tell a framework that triggers correctly from one that triggers always.');
}

// --- report ------------------------------------------------------------------
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
for (const w of warnings) console.log(`  warn   ${w}`);
for (const e of errors) console.log(`  ERROR  ${e}`);
console.log(
  errors.length
    ? `\nFAIL - ${plural(errors.length, 'error')}, ${plural(warnings.length, 'warning')}`
    : `\nOK - ${commandNames.length} commands, ${skillNames.length} skills, ${plural(agentDefs.length, 'agent')} (${alwaysOn} tok/turn always-on, budget ${budget ?? "unset"}), ${Object.keys(json).length} JSON files, ${plural(warnings.length, 'warning')}`
);
process.exit(errors.length ? 1 : 0);
