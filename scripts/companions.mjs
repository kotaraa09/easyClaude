// The file tree and Blast Radius: plugins of their own, from easyClaude's marketplace.
//
// 1.2.0 listed them under "dependencies" in plugin.json. A fresh install brought them along,
// but `claude plugin update` from 1.1.x did not, and Claude Code then refuses to load a
// plugin whose dependency is missing: no skills, no hooks, no panels, and nothing on screen
// to say so. Now easyClaude loads without them, and this says once which ones are missing
// and how to add them.
//
// The note is a systemMessage: the user sees it and Claude does not, so it costs no tokens.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const COMPANIONS = [
  { id: 'filetree@easyclaude', name: 'the file tree' },
  { id: 'blast-radius@easyclaude', name: 'Blast Radius' },
];

// The companions with no install record, in any scope. An unreadable record says nothing:
// a wrong "missing" would send someone to install what they have.
export function missingCompanions({ configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude') } = {}) {
  let installed;
  try {
    installed = JSON.parse(readFileSync(join(configDir, 'plugins', 'installed_plugins.json'), 'utf8')).plugins;
  } catch { return []; }
  if (!installed || typeof installed !== 'object') return [];
  return COMPANIONS.filter((c) => !(Array.isArray(installed[c.id]) && installed[c.id].length));
}

// The note for a new session, or null. Once for each set of missing companions, when Claude
// Code gives the plugin a data folder to remember that in; every new session when it does not.
export function companionsNotice(payload, { configDir, dataDir = process.env.CLAUDE_PLUGIN_DATA } = {}) {
  if ((payload.source ?? 'startup') !== 'startup') return null;
  const missing = missingCompanions(configDir ? { configDir } : {});
  if (!missing.length) return null;

  const key = missing.map((c) => c.id).join(',');
  const marker = dataDir ? join(dataDir, 'companions-noted') : null;
  if (marker) {
    try { if (readFileSync(marker, 'utf8').trim() === key) return null; } catch { /* not noted yet */ }
    try { mkdirSync(dataDir, { recursive: true }); writeFileSync(marker, key); } catch { /* show it anyway */ }
  }

  const names = missing.map((c) => c.name).join(' and ');
  const verb = missing.length > 1 ? 'are' : 'is';
  return `easyClaude: ${names} ${verb} not installed. To add ${missing.length > 1 ? 'them' : 'it'}, ` +
    'run this in a terminal, then start a new session:\n' +
    missing.map((c) => `claude plugin install ${c.id}`).join('\n');
}
