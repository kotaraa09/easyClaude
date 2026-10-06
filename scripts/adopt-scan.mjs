#!/usr/bin/env node
// Looks at a project that already exists, before kickoff writes anything into it.
//
//   node adopt-scan.mjs            what the project has, and where easyClaude's files go
//   node adopt-scan.mjs --json     the same, for tests
//
// kickoff used to write docs/STATE.md, docs/DECISIONS.md and a new CLAUDE.md into every
// project. In a project that already had them, or whose docs/ folder is a published
// documentation site, that put planning notes on the public site, made a second decision
// log beside the real one, and replaced instructions someone else wrote. Deciding where
// each file goes is a lookup, not a judgement, so a script does it the same way every time
// and kickoff follows the answer.
//
// Read-only: it writes nothing. kickoff writes .claude/easyclaude.json from the result.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS } from './locations.mjs';

// Where kickoff puts its files when docs/ is not safe to write into.
export const ELSEWHERE = 'planning';

// A folder that a documentation tool publishes. A Markdown file there becomes a public page.
const SITE_MARKERS = [
  ['mkdocs.yml', 'MkDocs'], ['mkdocs.yaml', 'MkDocs'],
  ['docusaurus.config.js', 'Docusaurus'], ['docusaurus.config.ts', 'Docusaurus'], ['docusaurus.config.mjs', 'Docusaurus'],
  ['docs/.vitepress', 'VitePress'], ['docs/conf.py', 'Sphinx'], ['docs/_config.yml', 'Jekyll / GitHub Pages'],
  ['docs/index.html', 'a published web page'], ['docs/package.json', 'a documentation site'],
  ['docs/astro.config.mjs', 'Astro'], ['docs/book.toml', 'mdBook'],
];

// Folders that hold one decision record per file.
const ADR_DIRS = [
  'doc/adr', 'docs/adr', 'docs/adrs', 'adr', 'adrs', 'docs/decisions',
  'docs/architecture/decisions', 'architecture/decisions', 'doc/architecture/decisions',
];

// Names a project may already use for the same thing, looked for case-insensitively in
// docs/, doc/ and the project root. The first one found is used.
const SAME_THING = {
  architecture: ['ARCHITECTURE.md', 'architecture.md', 'DESIGN.md'],
  decisions: ['DECISIONS.md', 'decisions.md', 'DECISION_LOG.md'],
  prd: ['PRD.md', 'REQUIREMENTS.md', 'SPEC.md'],
};

const list = (root, rel) => {
  try { return readdirSync(join(root, rel)); } catch { return null; }
};
const isDir = (root, rel) => {
  try { return statSync(join(root, rel)).isDirectory(); } catch { return false; }
};

// The real name of a file, matched without regard to case.
function findFile(root, dir, names) {
  const entries = list(root, dir);
  if (!entries) return null;
  for (const name of names) {
    const hit = entries.find((e) => e.toLowerCase() === name.toLowerCase());
    if (hit && !isDir(root, join(dir, hit))) return dir === '.' ? hit : `${dir}/${hit}`;
  }
  return null;
}

export function scan(root) {
  const site = SITE_MARKERS.find(([marker]) => existsSync(join(root, marker)))?.[1] ?? null;
  const docsTaken = Boolean(site);
  const adr = ADR_DIRS.find((d) => (list(root, d) ?? []).some((e) => /\.md$/i.test(e))) ?? null;

  const files = {};
  const notes = [];
  for (const key of Object.keys(DEFAULTS)) {
    const fallback = DEFAULTS[key];
    let path = fallback;
    let how = 'new';
    const existing = SAME_THING[key] && ['docs', 'doc', '.'].map((d) => findFile(root, d, SAME_THING[key])).find(Boolean);
    if (key === 'decisions' && adr) {
      path = `${adr}/`;
      how = 'adr';
    } else if (existing && !(docsTaken && existing.startsWith('docs/'))) {
      path = existing;
      how = 'existing';
    } else if (docsTaken && fallback.startsWith('docs/')) {
      // Even where the file exists: on a published site it is a page for readers.
      path = `${ELSEWHERE}/${fallback.slice('docs/'.length)}`;
      if (existsSync(join(root, path))) how = 'existing';
    } else if (existsSync(join(root, fallback))) {
      how = 'existing';
    }
    files[key] = { path, how };
  }

  const claudeMd = findFile(root, '.', ['CLAUDE.md']);
  const agentsMd = findFile(root, '.', ['AGENTS.md']);
  // The project's own release notes are for its users. easyClaude's changelog is the
  // overflow of the plan's Done list, in the owner's words, and does not belong in them.
  const releaseNotes = findFile(root, '.', ['CHANGELOG.md', 'CHANGES.md', 'HISTORY.md']);
  if (releaseNotes) notes.push(`${releaseNotes} is the project's own release notes. Leave it alone.`);

  const moved = Object.entries(files).filter(([key, f]) => f.path !== DEFAULTS[key]);
  const config = moved.length ? { files: Object.fromEntries(moved.map(([k, f]) => [k, f.path])) } : null;
  return { site, adr, files, claudeMd, agentsMd, config, notes, docsOnly: docsTaken ? ELSEWHERE : null };
}

// The report kickoff reads. Written as instructions, because that is how it is used.
export function report(r) {
  const out = [];
  if (r.site) {
    out.push(`docs/ is published by ${r.site}: a Markdown file there becomes a public page. ` +
      `Put easyClaude's files in ${ELSEWHERE}/ instead, and write nothing new into docs/.`);
  }
  out.push('Where each file goes:');
  for (const [key, f] of Object.entries(r.files)) {
    const what = f.how === 'adr'
      ? `${f.path} - this project keeps one decision per file. Do not write a decision log; ` +
        'add a new numbered file there, in the format of the newest one, for each decision'
      : f.how === 'existing'
        ? `${f.path} - it exists. Read it first, and add a section to it. Never replace what is there`
        : `${f.path} - new`;
    out.push(`- ${key}: ${what}`);
  }
  if (r.config) {
    out.push(`Write .claude/easyclaude.json with exactly this content:\n${JSON.stringify(r.config, null, 2)}`);
  } else {
    out.push('Every file is in its usual place. Do not write .claude/easyclaude.json.');
  }
  if (r.claudeMd) {
    out.push(`${r.claudeMd} exists, and someone wrote it on purpose. Do not rewrite it. Add only the ` +
      "lines it lacks from kickoff's five, at the end, under a heading \"## easyClaude\".");
  } else if (r.agentsMd) {
    out.push(`${r.agentsMd} holds this project's instructions for coding agents, and Claude Code ` +
      `does not read it on its own. Write CLAUDE.md with "@${r.agentsMd}" as its first line, so ` +
      "it is read every session, then kickoff's lines. Do not copy its content.");
  }
  if (r.docsOnly) {
    out.push(`docs/ is part of the build here. In .claude/verify.json, set "docsOnly" to ` +
      `["${ELSEWHERE}/**", "design/**", ".claude/**", "*.md", "LICENSE", ".gitignore", ".env.example"], ` +
      'so a change to docs/ runs the checks.');
  }
  out.push(...r.notes);
  return out.join('\n');
}

if (process.argv[1]?.endsWith('adopt-scan.mjs')) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const r = scan(root);
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 2) : report(r));
}
