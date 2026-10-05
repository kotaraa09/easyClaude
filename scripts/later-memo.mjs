// Work the user left for another session, held until the plan file records it.
// The plan file is docs/STATE.md unless the project moved it; see locations.mjs.
//
// prompt-check.mjs asks Claude to write unfinished items into docs/STATE.md when a message
// leaves work "for tomorrow". In the two-session benchmark that line was not enough: the
// verify gate blocked on a test, Claude fixed the test, and the turn ended with the other
// four requests written nowhere. The next session could not know they existed.
//
// So the promise is kept by a script, like the gate. prompt-check.mjs records the state
// file as it was when the user asked. At the Stop hook, if the file has not changed, the
// turn is sent back once to write it. Once: a message that only mentioned "later" in
// passing costs one short reply, never a loop.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { locations } from './locations.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const memoPath = (root, session) =>
  join(tmpdir(), `easyclaude-later-${sha(`${root}\0${session}`).slice(0, 16)}.json`);
const stateHash = (root) => {
  try { return sha(readFileSync(join(root, locations(root).state), 'utf8')); } catch { return null; }
};

// Called when the user's message leaves work for later.
export function markLater(root, session) {
  if (!session) return;
  try { writeFileSync(memoPath(root, session), JSON.stringify({ state: stateHash(root), reminded: false })); } catch { /* the reminder line still went out */ }
}

// Called by the Stop hook. Returns the message to block with, or null to carry on.
export function laterBlock(root, session) {
  if (!session) return null;
  const file = memoPath(root, session);
  if (!existsSync(file)) return null;
  let memo;
  try { memo = JSON.parse(readFileSync(file, 'utf8')); } catch { rmSync(file, { force: true }); return null; }
  if (memo.reminded || stateHash(root) !== memo.state) {
    rmSync(file, { force: true });
    return null;
  }
  try { writeFileSync(file, JSON.stringify({ ...memo, reminded: true })); } catch { return null; }
  const plan = locations(root).state;
  return `easyClaude: the user left part of this work for another session, and ${plan} ` +
    'has not changed this turn. That session will not see this conversation. Put every item ' +
    `they asked for and you did not finish at the top of ## Next in ${plan}, in their ` +
    'words, each ending with the date they asked, then end the turn. If nothing was left for ' +
    'later, say so in one line and end.';
}
