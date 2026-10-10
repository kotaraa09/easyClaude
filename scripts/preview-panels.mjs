#!/usr/bin/env node
// Writes a copy of the panels as separate mods, to see them in a running session before a
// release.
//
//   node scripts/preview-panels.mjs <folder>
//
// <folder> is a dev-mods folder Claude Code watches: the plugin-authoring skill names it
// (~/.claude/dev-mods/<session id>), and the session asks once to turn hot reloading on.
// The copy is called easyclaude-preview, with its own pane ids, state and commands
// (/easyclaude-preview, /easyclaude-preview-helpers), so it runs beside an installed
// easyClaude without clashing. Its buttons run the installed plugin's commands. The file tree
// and Blast Radius are copied as they are, as the plugins filetree and blast-radius.
//
// Why: the panel tests read the drawn tree, not the pixels. 1.1.0 and 1.1.1 both went out
// with faults anyone would see on screen - a help box under the rows below it, divider
// lines that wrapped - because nobody looked before the release. Run this, look, then ship.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/preview-panels.mjs <dev-mods folder>');
  process.exit(1);
}
const NAME = 'easyclaude-preview';
const mod = join(target, NAME);

// easyClaude's hooks module: the entry and the files it starts.
const FILES = ['register.tsx', 'panels.tsx', 'clear-reminder.ts', 'savvy-progress/register.tsx'];
const swaps = [
  [/plugin: 'easyclaude'/g, `plugin: '${NAME}'`],
  [/'easyclaude-controls'/g, `'${NAME}-controls'`],
  [/'easyclaude-helpers'/g, `'${NAME}-helpers'`],
  [/'easyclaude-panels'/g, `'${NAME}'`],
  [/'easyClaude: controls'/g, `'Preview: controls'`],
  [/'easyClaude: progress'/g, `'Preview: progress'`],
];
const sources = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(root, 'hooks', f), 'utf8')]));
// Every swap must hit somewhere: one that missed would leave the real plugin's state, pane ids
// or commands in the copy, and the preview would clash with the installed easyClaude.
for (const [from, to] of swaps) {
  if (!FILES.some((f) => { from.lastIndex = 0; return from.test(sources[f]); })) {
    throw new Error(`hooks/ no longer contains ${from} - update the swaps in this script`);
  }
  for (const f of FILES) { from.lastIndex = 0; sources[f] = sources[f].replace(from, to); }
}
let source = sources['panels.tsx'];
// Preview only: /easyclaude-preview-demo fills the progress bar with a sample request, so
// the step bar and the step marks can be looked at in a session where Claude keeps no step
// list. `/easyclaude-preview-demo waiting` shows the same request after its turn ended, with a
// test run still going in the background. The released plugin never has this command.
const REGISTER = `await $.command.register({ name: '${NAME}', `;
if (!source.includes(REGISTER)) throw new Error('hooks/panels.tsx: no command.register line to add the demo beside');
source = source.replace(REGISTER, `await $.command.register({ name: '${NAME}-demo', description: 'Fill the preview progress bar with a sample request' })\n    ${REGISTER}`);
const DEMO = `
  on('command.run', { command: '${NAME}-demo' }, async ($, e) => {
    const waiting = /waiting/.test(String(e.args ?? ''))
    const now = await $.clock.now()
    const u = await readUsage($)
    await update($, request, () => ({
      text: 'Make a website for my bakery', startedAt: now - 134000, endedAt: waiting ? now - 2000 : null, tools: 14,
      waiting: waiting ? [{ id: 'w1', label: 'Run the tests' }] : [],
      recent: ['Read STATE.md', 'Wrote index.html', 'Changed style.css', 'Ran the checks', 'Changed page2.html'],
      costAtStart: u.costUsd === null ? null : Math.max(0, u.costUsd - 0.42),
      steps: [
        { id: 'd1', title: 'Read the plan', doing: 'Reading the plan', status: 'completed' },
        { id: 'd2', title: 'Set up the project', doing: 'Setting up the project', status: 'completed' },
        { id: 'd3', title: 'Build page 1', doing: 'Building page 1', status: 'completed' },
        { id: 'd4', title: 'Build page 2', doing: 'Building page 2', status: 'in_progress' },
        { id: 'd5', title: 'Add the contact form', doing: 'Adding the contact form', status: 'pending' },
        { id: 'd6', title: 'Check every page', doing: 'Checking every page', status: 'pending' },
      ],
    }))
    await update($, usage, () => u)
    // \`/easyclaude-preview-demo helpers\` adds one helper in each uniform, half still at work.
    if (/helpers/.test(String(e.args ?? ''))) {
      const jobs = [
        ['general-purpose', 'Fix the checkout bug'], ['general-purpose', 'Make the shop page look better'],
        ['easyclaude:easyclaude-diff-reviewer', 'Review the branch diff'], ['Plan', 'Plan the delivery calendar'],
        ['general-purpose', 'Write the README for the shop'], ['Explore', 'Find where discounts are checked'],
        ['general-purpose', 'Find out what the weather API returns'],
      ]
      await update($, helpers, () => jobs.map(([type, description], i) => ({
        id: 'demo' + i, type, description, model: 'claude-sonnet-5-5', status: i % 2 ? 'done' : 'running',
        startedAt: now - 60000 - i * 9000, ...(i % 2 ? { endedAt: now - 5000 } : {}),
        contextTokens: 20000 + i * 7000, contextMax: 1000000, tokens: 30000 + i * 5000, costUsd: 0.04 + i * 0.03, steps: 3 + i, round: 1,
      })))
    }
    return { text: 'The preview progress bar now shows a sample request.' }
  })
}
`;
const end = source.lastIndexOf('}');
source = source.slice(0, end) + DEMO.trimStart().replace(/^/, '') + source.slice(end + 1);

let types = readFileSync(join(root, 'types', 'index.d.ts'), 'utf8').replace(/^(\s*)easyclaude: \{/m, `$1'${NAME}': {`);
if (!types.includes(`'${NAME}': {`)) throw new Error('types/index.d.ts: no "easyclaude: {" entry to rename');

const write = (rel, text) => {
  mkdirSync(dirname(join(mod, rel)), { recursive: true });
  writeFileSync(join(mod, rel), text);
};
write('.claude-plugin/plugin.json', JSON.stringify({
  name: NAME, version: '0.0.0', description: 'A preview of the easyClaude panels', types: './types/index.d.ts',
}, null, 2) + '\n');
write('hooks/hooks.json', JSON.stringify({ modules: ['./register.tsx'] }, null, 2) + '\n');
sources['panels.tsx'] = source;
for (const f of FILES) write(`hooks/${f}`, sources[f]);
write('types/index.d.ts', types);
// The file tree and Blast Radius are plugins of their own. Blast Radius loads under its own
// name. The file tree installs with easyClaude since 1.2.1, so its copy is renamed the way the
// panels are: under the same name the installed one answers, and the preview shows nothing new.
const copyPlugin = (plugin, to) => cpSync(join(root, 'plugins', plugin), join(target, to), {
  recursive: true,
  filter: (src) => !/[\\/]\.claude-plugin[\\/]types([\\/]|$)/.test(src) && !src.endsWith('.test.ts'),
});
copyPlugin('blast-radius', 'blast-radius');
const TREE = 'filetree-preview';
copyPlugin('filetree', TREE);
const treeSwaps = {
  'hooks/register.tsx': [
    [/plugin: 'filetree'/g, `plugin: '${TREE}'`],
    [/const PANE = 'filetree'/g, `const PANE = '${TREE}'`],
    [/name: 'filetree'/g, `name: '${TREE}'`],
    [/command: 'filetree'/g, `command: '${TREE}'`],
  ],
  'types/index.d.ts': [[/^(\s*)filetree: \{/m, `$1'${TREE}': {`]],
  '.claude-plugin/plugin.json': [[/"name": "filetree"/, `"name": "${TREE}"`]],
};
for (const [rel, list] of Object.entries(treeSwaps)) {
  let text = readFileSync(join(target, TREE, rel), 'utf8');
  for (const [from, to] of list) {
    from.lastIndex = 0;
    if (!from.test(text)) throw new Error(`plugins/filetree/${rel} no longer contains ${from} - update the swaps in this script`);
    text = text.replace(from, to);
  }
  writeFileSync(join(target, TREE, rel), text);
}
console.log(`Wrote ${mod}, with ${TREE} and blast-radius beside it. They load when this turn ends, ` +
  `once hot reloading is on; /${NAME} reopens the control panel, and /${TREE} the file tree.`);
