// "Done" for a web page means somebody looked at it.
//
// The gate checks exit codes. For a website, a beginner's "done" is "I opened it and it
// works", and a page can pass every test with a button that does nothing. So when a turn
// changed what a web page shows and nothing in that turn looked at the page, the Stop hook
// sends the turn back once: look at it with a browser tool if there is one, or tell the
// user how to see it for themselves if there is not.
//
// A script and not a line in build-task, for the reason later-memo.mjs gives: twice in the
// benchmark, guidance inside a skill did not change what Claude did, and a hook did.
//
// It reads the session's own transcript. The turn starts at the user's last message (a
// "Stop hook feedback" entry is the gate talking, not the user). It holds once per message,
// so a turn that cannot look costs one short reply, never a loop.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { cheapArmed } from './personal.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const memoPath = (root, session) =>
  join(tmpdir(), `easyclaude-look-${sha(`${root}\0${session}`).slice(0, 16)}.json`);

// What a page is built from. Test files change no page.
const PAGE_FILE = /\.(html?|css|scss|sass|less|jsx?|tsx?|mjs|vue|svelte|astro)$/i;
const TEST_FILE = /(^|[\\/])(tests?|__tests__|spec|e2e)[\\/]|\.(test|spec)\.[a-z]+$/i;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
// Any tool that can show a page: the desktop app's browser pane, Claude in Chrome, a
// Playwright or Puppeteer server, or a preview tool.
const LOOK_TOOL = /browser|playwright|puppeteer|chrome|screenshot|preview/i;
const WEB_DEPS = /^(react|react-dom|vue|svelte|next|nuxt|vite|astro|preact|solid-js|@angular\/core|@sveltejs\/kit)$/;

const PAGES = ['index.html', 'public/index.html', 'src/index.html'];
const readPkg = (root) => { try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { return null; } };

export function isWebProject(root) {
  if (PAGES.some((f) => existsSync(join(root, f)))) return true;
  const pkg = readPkg(root);
  return Boolean(pkg && Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => WEB_DEPS.test(d)));
}

// Where the user opens the page, named for them. Left to itself, one run in three of the
// first benchmark told a beginner to open checkout.html, in a shop that has only index.html.
function howToOpen(root) {
  const pkg = readPkg(root);
  const dev = pkg?.scripts?.dev ? 'npm run dev' : pkg?.scripts?.start ? 'npm start' : null;
  if (dev) return `the page is served by \`${dev}\`; give the address it prints`;
  const page = PAGES.find((f) => existsSync(join(root, f)));
  return page ? `the page is ${page}, opened in a browser` : 'name only a file that exists';
}

const isUserMessage = (entry) => entry.type === 'user' && !entry.isMeta &&
  (typeof entry.message?.content === 'string'
    ? !entry.message.content.startsWith('Stop hook feedback')
    : Array.isArray(entry.message?.content) && entry.message.content.some((b) => b.type === 'text'));

// The last user message, and every tool the turn used after it.
export function readTurn(transcriptPath) {
  let entries;
  try {
    entries = readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return null; }
  let start = -1;
  for (let i = entries.length - 1; i >= 0; i--) if (isUserMessage(entries[i])) { start = i; break; }
  if (start < 0) return null;
  const prompt = entries[start];
  const text = typeof prompt.message.content === 'string' ? prompt.message.content
    : prompt.message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const tools = entries.slice(start + 1)
    .filter((e) => e.type === 'assistant' && Array.isArray(e.message?.content))
    .flatMap((e) => e.message.content.filter((b) => b.type === 'tool_use'));
  return { id: prompt.promptId ?? prompt.uuid ?? String(start), text, tools };
}

// Called by the Stop hook once the checks pass. Returns the message to block with, or null.
export function lookBlock(root, payload, { lookSetting } = {}) {
  const session = payload.session_id;
  if (!session || !payload.transcript_path || lookSetting === false) return null;
  // Cheap mode promises no screenshots. A cheap-session file that came with the repo is
  // not this user's choice; see personal.mjs.
  if (cheapArmed(root)) return null;
  const turn = readTurn(payload.transcript_path);
  if (!turn || /^\s*\/easyclaude:cheap\b/.test(turn.text)) return null;

  const changedPage = turn.tools.some((t) => EDIT_TOOLS.has(t.name) &&
    PAGE_FILE.test(t.input?.file_path ?? '') && !TEST_FILE.test(t.input?.file_path ?? ''));
  if (!changedPage || turn.tools.some((t) => LOOK_TOOL.test(t.name)) || !isWebProject(root)) return null;

  const file = memoPath(root, session);
  try { if (JSON.parse(readFileSync(file, 'utf8')).held === turn.id) return null; } catch { /* none yet */ }
  try { writeFileSync(file, JSON.stringify({ held: turn.id })); } catch { return null; }

  // The reply to this hold is the last message of the turn, and the one the user reads as
  // the answer. In the typo case on 2026-10-04 it said only how to open the page, three runs
  // of three, so the user was never told which word was fixed. Hence the line about it.
  return 'easyClaude: the checks pass, but this turn changed what a web page shows and nothing ' +
    'looked at the page. For the user, "done" means they open it and it works. Your reply to ' +
    'this is the last message the user reads, so it must stand on its own: start it with one ' +
    'line on what you changed. If this session ' +
    'has a browser tool, open the page, do what the user would do for this task, take a ' +
    'screenshot, and check it shows what they asked for; fix what it does not. If there is no ' +
    'browser tool, do not search for one or install one: tell the user in one plain line how to ' +
    `open the page (${howToOpen(root)}) and what to click to see it work, and do not call it ` +
    'seen. Then end the turn.';
}
