// Which projects' checks this person has approved, kept outside every project.
//
// The Stop hook runs the commands in .claude/verify.json through a shell, as the user, at
// the end of every turn that changed code. A repository can ship that file. Before this
// file nothing asked: clone a repo, let Claude change one line, and its commands ran.
// Claude Code's "trust this folder?" question covers that only in general terms; it never
// shows the commands.
//
// So the commands run only after this person approved them, for this folder, as written.
// The record lives in the user's home, never in a project, so a repository cannot approve
// itself. Changing any command asks again; renaming or retiering a step does not, since
// only the commands run.
//
// What approval means: "npm test" runs whatever package.json says, and the project
// controls that. Approving is consent to run this project's checks at all, with the
// commands in front of the person. It is not a review of the code they call.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, mkdirSync, renameSync, realpathSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s).digest('hex');

// EASYCLAUDE_TRUST_FILE exists for the test suite, which must not write to a real home.
export const trustFile = () =>
  process.env.EASYCLAUDE_TRUST_FILE || join(homedir(), '.claude', 'easyclaude', 'trusted-checks.json');

// The commands, in order. Nothing else in a step runs.
export const fingerprint = (steps) => sha(JSON.stringify(steps.map((s) => s.cmd))).slice(0, 16);

// One folder, however it was reached: a symlink, a short Windows name, a different case of
// drive letter. Approving it once must hold for every way the hook is handed the path.
function folderKey(root) {
  let p = resolve(root);
  try { p = realpathSync.native(p); } catch { /* a folder that is gone keys as given */ }
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

function readStore() {
  try {
    const store = JSON.parse(readFileSync(trustFile(), 'utf8'));
    if (store && typeof store.projects === 'object' && store.projects !== null) return store;
  } catch { /* none yet, or unreadable: nothing is approved */ }
  return { projects: {} };
}

export function isTrusted(root, steps) {
  return readStore().projects[folderKey(root)] === fingerprint(steps);
}

// Written to a temporary file and renamed into place, so a crash never leaves half a record,
// and private to the user, since it lists the folders they work in. Windows refuses the
// rename while another process has the file open - a hook in a second session reading it -
// so it tries a few times, and then writes in place: a whole record late beats none.
export function trust(root, steps) {
  const store = readStore();
  store.projects[folderKey(root)] = fingerprint(steps);
  const file = trustFile();
  const text = JSON.stringify(store, null, 2) + '\n';
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temp, text, { mode: 0o600 });
  for (let tries = 0; ; tries++) {
    try { renameSync(temp, file); return; } catch (e) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { rmSync(temp, { force: true }); throw e; }
      if (tries === 4) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  rmSync(temp, { force: true });
  writeFileSync(file, text, { mode: 0o600 });
}

// The hook asks once per session for each set of commands. A user who says no, or does not
// answer, is not asked again at the end of every turn. With no session there is nothing to
// key on, so the caller asks only on a turn's first stop; see verify.mjs.
const askMemo = (root, session, steps) =>
  join(tmpdir(), `easyclaude-ask-${sha(`${folderKey(root)}\0${session}\0${fingerprint(steps)}`).slice(0, 16)}`);
export const askedAlready = (root, session, steps) => Boolean(session) && existsSync(askMemo(root, session, steps));
export function markAsked(root, session, steps) {
  if (!session) return;
  try { writeFileSync(askMemo(root, session, steps), ''); } catch { /* the caller's first-stop rule still stops a loop */ }
}

// A step as a person approving it should see it. The text comes from a file the project
// controls, so a line break or a terminal escape inside it could draw a line that is not
// there, and a long one could push the real commands out of view.
const shown = (s, max) => {
  const flat = String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  return flat.length > max ? `${flat.slice(0, max)}... (${flat.length} characters)` : flat;
};
export function commandList(steps, { maxSteps = 20 } = {}) {
  const lines = steps.slice(0, maxSteps).map((s) => `  ${shown(s.name, 60)}: ${shown(s.cmd, 300)}`);
  if (steps.length > maxSteps) lines.push(`  ...and ${steps.length - maxSteps} more - read .claude/verify.json before approving`);
  return lines.join('\n');
}
