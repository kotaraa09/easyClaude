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
  const tok = Math.round((2 + d.length + 2 + fm.description.length + 1) / 4);
  alwaysOn += tok;
  costs.push([d, tok]);
}
// rules/*.md are copied into every project and loaded on every turn too - policing
// only skill descriptions would police the smaller half.
let rulesTok = 0;
for (const f of walk(join(root, 'rules')).filter((p) => p.endsWith('.md'))) {
  rulesTok += Math.round(readFileSync(f, 'utf8').length / 4);
}
alwaysOn += rulesTok;

const budget = registry?.max_always_on_tokens;
if (budget && alwaysOn > budget) {
  costs.sort((a, b) => b[1] - a[1]);
  err('skills/', `always-on cost ${alwaysOn} tok/turn exceeds budget ${budget}. ` +
    `Largest: ${costs.slice(0, 3).map(([n, t]) => `${n} ${t}`).join(', ')}. ` +
    `Set disable-model-invocation on occasional skills, or raise max_always_on_tokens deliberately.`);
}

// --- report ------------------------------------------------------------------
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
for (const w of warnings) console.log(`  warn   ${w}`);
for (const e of errors) console.log(`  ERROR  ${e}`);
console.log(
  errors.length
    ? `\nFAIL - ${plural(errors.length, 'error')}, ${plural(warnings.length, 'warning')}`
    : `\nOK - ${commandNames.length} commands, ${skillNames.length} skills (${alwaysOn} tok/turn always-on, budget ${budget ?? "unset"}), ${Object.keys(json).length} JSON files, ${plural(warnings.length, 'warning')}`
);
process.exit(errors.length ? 1 : 0);
