#!/usr/bin/env node
// Writes a copy of the panels as a separate mod, to see them in a running session before a
// release.
//
//   node scripts/preview-panels.mjs <folder>
//
// <folder> is a dev-mods folder Claude Code watches: the plugin-authoring skill names it
// (~/.claude/dev-mods/<session id>), and the session asks once to turn hot reloading on.
// The copy is called easyclaude-preview, with its own pane ids, state and command
// (/easyclaude-preview), so it runs beside an installed easyClaude without clashing. Its
// buttons run the installed plugin's commands.
//
// Why: the panel tests read the drawn tree, not the pixels. 1.1.0 and 1.1.1 both went out
// with faults anyone would see on screen - a help box under the rows below it, divider
// lines that wrapped - because nobody looked before the release. Run this, look, then ship.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

const swaps = [
  [/plugin: 'easyclaude'/g, `plugin: '${NAME}'`],
  [/'easyclaude-progress'/g, `'${NAME}-progress'`],
  [/'easyclaude-controls'/g, `'${NAME}-controls'`],
  [/'easyclaude-panels'/g, `'${NAME}'`],
  [/'easyClaude: progress'/g, `'Preview: progress'`],
  [/'easyClaude: controls'/g, `'Preview: controls'`],
];
let source = readFileSync(join(root, 'hooks', 'panels.tsx'), 'utf8');
// Every swap must hit: one that missed would leave the real plugin's state, pane ids or
// command in the copy, and the preview would clash with the installed easyClaude.
for (const [from, to] of swaps) {
  if (!from.test(source)) throw new Error(`hooks/panels.tsx no longer contains ${from} - update the swaps in this script`);
  from.lastIndex = 0;
  source = source.replace(from, to);
}
// Preview only: /easyclaude-preview-demo fills the progress pane with a sample request, so
// the step bar and the step marks can be looked at in a session where Claude keeps no step
// list. The released plugin never has this command.
const REGISTER = `await $.command.register({ name: '${NAME}', `;
if (!source.includes(REGISTER)) throw new Error('hooks/panels.tsx: no command.register line to add the demo beside');
source = source.replace(REGISTER, `await $.command.register({ name: '${NAME}-demo', description: 'Fill the preview progress panel with a sample request' })\n    ${REGISTER}`);
const DEMO = `
  on('command.run', { command: '${NAME}-demo' }, async ($) => {
    const now = await $.clock.now()
    const u = await readUsage($)
    await update($, request, () => ({
      text: 'Make a website for my bakery', startedAt: now - 134000, endedAt: null, tools: 14,
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
    return { text: 'The preview progress panel now shows a sample request.' }
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
write('hooks/register.tsx', source);
write('types/index.d.ts', types);
console.log(`Wrote ${mod}. It loads when this turn ends, once hot reloading is on; /${NAME} reopens it.`);
