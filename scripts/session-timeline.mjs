#!/usr/bin/env node
// A past session, cut down to the steps that matter, for /mellu:what-went-wrong.
//
//   node session-timeline.mjs --list         this project's sessions, newest first
//   node session-timeline.mjs <n or id>      one session as numbered steps (1 = newest)
//
// Claude Code keeps every session as a .jsonl file under ~/.claude/projects/<folder>/, the
// folder named after the project path with every other character turned into "-". A file
// runs to megabytes of reminders, tool output and thinking; read whole, it would cost more
// than the session it explains. This keeps what someone needs to see where a session went
// wrong: what the user said, what Claude said, each tool call in one line, and each failed
// result. Everything is cut short and numbered, so an explanation can point at a step.
// From Superpowers' diagnosing skill, which reads a transcript to explain what went wrong.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

const MAX_STEPS = 400;
const cut = (s, n) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}...` : one;
};
// What Claude Code wraps around a user's words: reminders, reports, hook output.
const WRAPPED = /<(system-reminder|task-notification|agent-message|local-command-[\w-]+|command-[\w-]+)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

export const projectFolder = (dir, home = homedir()) =>
  join(home, '.claude', 'projects', dir.replace(/[^a-zA-Z0-9]/g, '-'));

export function sessions(dir, home) {
  const folder = projectFolder(dir, home);
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ id: basename(f, '.jsonl'), file: join(folder, f), at: statSync(join(folder, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
}

const firstAsk = (file) => {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m?.type !== 'user' || m.isMeta) continue;
    const c = m.message?.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x.type === 'text').map((x) => x.text).join(' ') : '';
    const own = text.replace(WRAPPED, ' ').trim();
    if (own) return own;
  }
  return '';
};

const toolLine = (u) => {
  const i = u.input ?? {};
  const what = i.command ?? i.file_path ?? i.pattern ?? i.skill ?? i.description ?? i.url ?? i.query ?? '';
  return `${u.name}: ${cut(what, 140)}`;
};

// One session as numbered steps.
export function timeline(file) {
  const steps = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m?.isSidechain) continue;
    const c = m?.message?.content;
    if (m?.type === 'user' && !m.isMeta) {
      if (typeof c === 'string') {
        const own = c.replace(WRAPPED, ' ').trim();
        if (own) steps.push(`user: ${cut(own, 400)}`);
      } else if (Array.isArray(c)) {
        for (const x of c) {
          if (x.type === 'text') {
            const own = x.text.replace(WRAPPED, ' ').trim();
            if (own) steps.push(`user: ${cut(own, 400)}`);
          } else if (x.type === 'tool_result' && x.is_error) {
            const body = Array.isArray(x.content) ? x.content.map((y) => y.text ?? '').join(' ') : x.content;
            steps.push(`  failed: ${cut(body, 200)}`);
          }
        }
      }
    } else if (m?.type === 'assistant' && Array.isArray(c)) {
      for (const x of c) {
        if (x.type === 'text' && x.text.trim()) steps.push(`claude: ${cut(x.text, 300)}`);
        else if (x.type === 'tool_use') steps.push(`  ${toolLine(x)}`);
      }
    }
  }
  const shown = steps.length > MAX_STEPS
    ? [...steps.slice(0, MAX_STEPS / 4), `... ${steps.length - MAX_STEPS} steps left out ...`, ...steps.slice(-(MAX_STEPS * 3) / 4)]
    : steps;
  let n = 0;
  return shown.map((s) => (s.startsWith('...') ? s : `${++n}. ${s}`)).join('\n');
}

if (process.argv[1]?.endsWith('session-timeline.mjs')) {
  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const all = sessions(dir);
  const arg = process.argv[2];
  if (!all.length) {
    console.log(`No saved sessions for ${dir}.`);
  } else if (!arg || arg === '--list') {
    all.slice(0, 15).forEach((s, i) => console.log(
      `${i + 1}. ${new Date(s.at).toLocaleString('en-GB')}  ${s.id}  "${cut(firstAsk(s.file), 80)}"`));
  } else {
    const s = /^\d+$/.test(arg) ? all[Number(arg) - 1] : all.find((x) => x.id.startsWith(arg));
    if (!s) {
      console.log(`No session "${arg}". Run with --list to see them.`);
      process.exitCode = 1;
    } else {
      console.log(`Session ${s.id}, last changed ${new Date(s.at).toLocaleString('en-GB')}\n`);
      console.log(timeline(s.file));
    }
  }
}
