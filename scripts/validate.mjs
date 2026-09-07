#!/usr/bin/env node
// Validates the easyclaude plugin without needing a live Claude Code session.
// Every check here exists because something actually broke while building P0.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

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
  'Stop', 'SubagentStop', 'PreCompact', 'Notification',
]);

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules') continue;
    const p = join(dir, e);
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

// --- 2. skills ---------------------------------------------------------------
const skillNames = [];
const skillsDir = join(root, 'skills');
if (existsSync(skillsDir)) {
  for (const d of readdirSync(skillsDir)) {
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
const hooks = json['hooks/hooks.json'];
if (!hooks) {
  err('hooks/hooks.json', 'missing');
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
        if (h.type === 'command' && !h.command) {
          err('hooks/hooks.json', `"${event}" command hook missing "command"`);
        }
        // Regression guard: a Stop hook ignoring stop_hook_active re-blocks until force-overridden.
        if ((event === 'Stop' || event === 'SubagentStop') && h.type === 'prompt' &&
            !/stop_hook_active/.test(h.prompt ?? '')) {
          err('hooks/hooks.json', `${event} prompt hook must check "stop_hook_active" or it loops until the block cap overrides it`);
        }
      }
    }
  }
}

// --- 6. docs use namespaced invocations --------------------------------------
// The P0 shipping bug: every doc said /cheap, which does not exist.
const ns = plugin?.name ?? 'easyclaude';
const invocable = [...new Set([...commandNames, ...skillNames])];
const templateDir = join(root, 'template');
for (const f of walk(root).filter((p) => p.endsWith('.md') && !p.startsWith(templateDir))) {
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
}

// --- report ------------------------------------------------------------------
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
for (const w of warnings) console.log(`  warn   ${w}`);
for (const e of errors) console.log(`  ERROR  ${e}`);
console.log(
  errors.length
    ? `\nFAIL - ${plural(errors.length, 'error')}, ${plural(warnings.length, 'warning')}`
    : `\nOK - ${commandNames.length} commands, ${skillNames.length} skills, ${Object.keys(json).length} JSON files, ${plural(warnings.length, 'warning')}`
);
process.exit(errors.length ? 1 : 0);
