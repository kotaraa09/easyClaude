// Where this project keeps the files easyClaude writes: the plan, the decisions, and the rest.
//
// They used to be fixed paths under docs/. A project that already had its own docs/ folder
// - a documentation site, a folder of ADRs, a changelog of its own - got easyClaude's files
// mixed into it, or a second copy beside the one it used. So a project can name its own
// places in .claude/easyclaude.json:
//
//   { "files": { "state": "planning/STATE.md", "decisions": "doc/adr/README.md" } }
//
// Anything not named keeps its default. The scripts read the paths from here. The skills
// and rules keep naming the defaults, and the session opener tells Claude which ones moved:
// a line sent with the session is what Claude follows, an instruction inside a skill is not.
//
// The file is committed with the project, so it can come from someone else's repository.
// A path is accepted only if it is a Markdown file inside the project. Anything else falls
// back to its default, and the opener names the entry it ignored. "decisions" may instead
// be a folder, written with a trailing slash, for a project that keeps one decision record
// per file (ADRs).
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync } from 'node:fs';
import { join, isAbsolute, normalize, sep } from 'node:path';

export const LOCATIONS_FILE = '.claude/easyclaude.json';

export const DEFAULTS = Object.freeze({
  state: 'docs/STATE.md',
  decisions: 'docs/DECISIONS.md',
  architecture: 'docs/ARCHITECTURE.md',
  prd: 'docs/PRD.md',
  changelog: 'docs/CHANGELOG.md',
  tokens: 'design/tokens.md',
});

// Keys that may name a folder instead of a file.
const FOLDER_KEYS = new Set(['decisions']);
export const isFolder = (p) => p.endsWith('/');

// A relative Markdown path, or a folder for FOLDER_KEYS, that stays inside the project,
// written with forward slashes.
function clean(value, key) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const p = value.trim().replace(/\\/g, '/');
  const folder = FOLDER_KEYS.has(key) && isFolder(p);
  if (isAbsolute(p) || /^[a-z]:/i.test(p) || !(folder || /\.md$/i.test(p))) return null;
  const n = normalize(p).split(sep).join('/').replace(/\/?$/, folder ? '/' : '');
  if (n === '/' || n === './' || n.startsWith('..') || n.startsWith('.git/')) return null;
  return n;
}

// { paths, moved, rejected }
//   paths     every key, with the project's own path or the default
//   moved     [key, default, path] for each path that differs from its default
//   rejected  the keys the file named but could not use, including unknown ones
export function readLocations(root) {
  const paths = { ...DEFAULTS };
  const moved = [];
  const rejected = [];
  let raw;
  try { raw = readFileSync(join(root, LOCATIONS_FILE), 'utf8'); } catch { return { paths, moved, rejected }; }
  let files;
  try { files = JSON.parse(raw)?.files; } catch { return { paths, moved, rejected: ['(the file is not valid JSON)'] }; }
  if (!files || typeof files !== 'object' || Array.isArray(files)) return { paths, moved, rejected };
  for (const [key, value] of Object.entries(files)) {
    const p = Object.hasOwn(DEFAULTS, key) ? clean(value, key) : null;
    if (!p) { rejected.push(key); continue; }
    paths[key] = p;
    if (p !== DEFAULTS[key]) moved.push([key, DEFAULTS[key], p]);
  }
  return { paths, moved, rejected };
}

export const locations = (root) => readLocations(root).paths;

// The line the opener sends, or null when every file is in its default place, so a project
// that never moved anything pays nothing for this. After a compaction the moved paths come
// back, because the skills still name the defaults, but the "tell the user" part does not:
// it was said at the start of the session.
export function locationsNotice(root, { compact = false } = {}) {
  const { moved, rejected: all } = readLocations(root);
  const rejected = compact ? [] : all;
  if (!moved.length && !rejected.length) return null;
  let text = '';
  if (moved.length) {
    text = 'This project keeps some of easyClaude\'s files in its own places. Wherever a skill, ' +
      'rule or hook names the path on the left, read and write the path on the right instead:\n\n' +
      moved.map(([, from, to]) => `- ${from} -> ${to}` + (isFolder(to)
        ? ' (one new numbered file per decision, in the format of the newest one there)' : '')).join('\n');
  }
  if (rejected.length) {
    text += (text ? '\n\n' : '') + `${LOCATIONS_FILE} has entries easyClaude cannot use, so ` +
      `their defaults apply: ${rejected.join(', ')}. A path must be a Markdown file inside the ` +
      'project (decisions may be a folder ending in /). In your first reply, tell the user this in one plain sentence.';
  }
  return text;
}
