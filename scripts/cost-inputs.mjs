// The files whose content sets what a turn costs, and one fingerprint over all of them.
//
// scripts/measure-cost.mjs stores this fingerprint in docs/cost.json beside the figures it
// measured. validate.mjs computes it again, and warns when the two differ: the measured
// cost is then about a plugin that no longer exists. CI cannot re-measure - that needs a
// login and costs money - so a warning is the most it can honestly do.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const COST_FILE = 'docs/cost.json';

function list(root, dir, keep) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const e of readdirSync(abs).sort()) {
    const rel = `${dir}/${e}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...list(root, rel, keep));
    else if (keep(rel)) out.push(rel);
  }
  return out;
}

// Skills and agents count by their frontmatter only: the name, description and flags are
// what rides on every turn, and a body loads only when the skill runs. Hashing whole files
// warned that the cost was stale after every edit to a skill's steps - the deploy skill's
// first change after measuring - and a warning that is usually wrong teaches people to
// ignore it.
const HEADER_ONLY = /^(skills\/.+\/SKILL\.md|agents\/.+\.md)$/;
const header = (text) => text.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0] ?? text;

export function costInputs(root) {
  return [
    ...list(root, 'skills', (r) => r.endsWith('/SKILL.md')),
    ...list(root, 'agents', (r) => r.endsWith('.md')),
    ...list(root, 'rules', (r) => r.endsWith('.md')),
    'hooks/hooks.json',
    'scripts/session-start.mjs',
    'tests/fixtures/cost-project.json',
  ].filter((r) => existsSync(join(root, r)));
}

export function costFingerprint(root) {
  const h = createHash('sha256');
  for (const r of costInputs(root)) {
    // Line endings normalised, so a Windows checkout and a Linux one agree.
    const text = readFileSync(join(root, r), 'utf8').replace(/\r\n/g, '\n');
    h.update(`${r}\n${HEADER_ONLY.test(r) ? header(text) : text}\n`);
  }
  return h.digest('hex').slice(0, 16);
}
