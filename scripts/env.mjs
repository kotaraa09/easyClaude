// The one reader for a project's .env, shared by every script that needs a key.
//
// There were two, and they disagreed. connect.mjs accepted a key written with leading
// whitespace; generate.mjs reported the same key as missing. Neither accepted the
// `export KEY=value` form a shell user writes, and both ignored it in silence rather
// than saying so. Worst of the three: both folded a trailing comment into the value, so
// `CONTEXT7_API_KEY=abc # my key` became the secret `abc # my key`. connect.mjs then
// wrote that into the user's config and the connector failed later, somewhere else, with
// an error that pointed at nothing.
//
// Values are returned to callers that pass them to an API or write them into a config
// file. They are never printed, never logged, and never put in a process argument list.
// Only the key NAMES are safe to show.
//
// No dependencies: node: builtins only, same rule as the rest of scripts/.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// `export` optional, leading whitespace allowed, and the name is matched loosely enough
// that a lowercase key is read rather than skipped without comment.
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

// A quoted value ends at its closing quote, and anything after it is a comment.
//
// An unquoted value ends at the first whitespace-then-# - the dotenv rule, and the one
// that does not break real secrets: a "#" inside a password or a URL fragment has no
// space in front of it, so `postgres://u:p#w@host/db` survives intact while
// `abc # my key` does not.
function unquote(raw) {
  const quoted = raw.match(/^(['"])([\s\S]*?)\1/);
  if (quoted) return quoted[2];
  return raw.split(/\s+#/)[0].trim().replace(/^["']|["']$/g, '');
}

// A value still wrapped in <angle brackets> is the placeholder from .env.example, which
// means the user has not filled that line in. Treated as absent, so --status reports
// "not set" rather than handing a literal "<your key here>" to an API.
const isPlaceholder = (v) => /^<.*>$/.test(v);

/**
 * Read `.env` from `dir`.
 * @returns {{ values: Map<string,string>, exists: boolean, path: string }}
 */
export function readEnv(dir = process.cwd()) {
  const path = resolve(dir, '.env');
  const values = new Map();
  if (!existsSync(path)) return { values, exists: false, path };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(LINE);
    if (!m) continue;
    const value = unquote(m[2]);
    if (value && !isPlaceholder(value)) values.set(m[1], value);
  }
  return { values, exists: true, path };
}
