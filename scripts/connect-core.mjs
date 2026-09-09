// The key-handling half of connect.mjs, split out so it can be tested.
//
// connect.mjs is a command-line script: it reads process.argv and prints and exits the
// moment it loads. That made every function below unreachable from a test, and the one
// that matters most - writeSecret - is the one that puts an API key into the user's global
// config. It was fixed once for a permission bug found by reading, with nothing to stop
// that bug returning. Splitting the logic out is what makes it reachable.
//
// The same move env.mjs made, and for a related reason: logic worth trusting has to be
// logic something can call.
//
// No dependencies: node: builtins only, same rule as the rest of scripts/.
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, statSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Launching `claude` is not as simple as it looks on Windows. An npm install puts
// `claude.cmd` on PATH, and Node cannot start that through execFile at all: the bare
// name gets ENOENT because CreateProcess only ever appends .exe, and naming the shim
// directly gets EINVAL because Node refuses .bat/.cmd without a shell (CVE-2024-27980).
// A native install has a real binary and works first time, which is exactly why this
// went unnoticed - it depends on how the user installed Claude Code.
//
// So: try without a shell first. Fall back to one only when the executable itself could
// not be launched, never when `claude mcp add` genuinely failed.
export const NEEDS_SHELL = new Set(['ENOENT', 'EINVAL']);

// `claude mcp add` has no way to take a secret off the command line - -e, -H and
// add-json all read it from argv, where every process running as this user can see it
// for the life of the call, and where it can end up in crash dumps and monitoring
// agents. Checked against the CLI's own help rather than assumed.
//
// So the secret never goes in argv. A single-use placeholder goes instead, and the real
// value is written into the config file afterwards by an ordinary file write. The CLI
// still does all the schema work; we only swap one unique token for one value, which
// means this keeps working if the config layout changes.
export const placeholder = () => `easyclaude_placeholder_${randomBytes(12).toString('hex')}`;

// Trust the CLI's own report of which file it wrote over guessing at one, but fall back
// to the documented location for local scope if that wording ever changes.
export function configPathFrom(output) {
  const m = String(output).match(/File modified:\s*(.+?)(?:\s+\[|[\r\n]|$)/);
  const named = m?.[1]?.trim();
  return named && existsSync(named) ? named : join(homedir(), '.claude.json');
}

export function writeSecret(output, token, secret) {
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
  //
  // rename() carries the TEMP file's permissions onto the destination, not the original's.
  // A plain writeFileSync creates at 0666 minus the umask - 0644 on a normal machine - so
  // replacing a config that was private to the user published it to every account on the
  // box, in the one operation that had just written an API key into it. The file is written
  // private first, so the secret is never on disk at a wider mode even briefly, and the
  // original's own mode is then restored. chmod is a no-op on Windows, where permissions
  // come from the parent directory, and a failure to read the old mode must not stop the
  // write: the private default is the safe end to fail at.
  const temp = `${file}.easyclaude-${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, updated, { mode: 0o600 });
    try { chmodSync(temp, statSync(file).mode & 0o777); } catch { /* keep the private default */ }
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
export const shellHostile = (argv) => argv.some((a) => /[%"]/.test(a));

export function runClaude(argv) {
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
