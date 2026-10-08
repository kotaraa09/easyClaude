// Run with `claude plugin test .` from the plugin root. The node suite (scripts/test.mjs)
// does not run these: they need Claude Code's own engine.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { actionLabel, addRecent, applyTaskUpdate, fromTodos, money, settingsFrom, stepLine } from './panels'
import type { Step } from '../types'

const SURFACES = ['terminal', 'desktop'] as const

// What the engine answers beneath the plugin in a session: a clock, the project folder, its
// files, and the session's figures.
const project = (on: On, files: Record<string, string>, { git = true } = {}) => {
  mock.clock(on, { now: 1_000_000 })
  on('fs.exists', async (_$, e: any) => ({ value: git && /[\\/]\.git$/.test(String(e.path)) }) as any)
  on('session.root', async () => ({ value: '/p' }) as any)
  on('session.usage', async () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens: 50_000, window: 200_000, percent: 25 }, cost: { usd: 0.5 } } }) as any)
  on('fs.read', async (_$, e: any) => {
    // The engine hands the path over in the platform's own form: D:\p\docs\STATE.md here.
    const rel = String(e.path).replace(/\\/g, '/').replace(/^([A-Za-z]:)?\/p\//, '')
    if (rel in files) return { value: files[rel] } as any
    throw new Error(`not found: ${e.path}`)
  })
}
const pane = (requestId: string) => ({
  component: 'Pane' as const,
  requestId,
  props: {
    title: requestId, isFocused: false, bodyColumns: 60, placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 30 }, view: {},
  } as any,
})

describe('the step line', () => {
  test('names the step in progress, counted from one', async () => {
    const steps = fromTodos([
      { content: 'Read the plan', status: 'completed', activeForm: 'Reading the plan' },
      { content: 'Build page 2', status: 'in_progress', activeForm: 'Building page 2' },
      { content: 'Build page 3', status: 'pending', activeForm: 'Building page 3' },
    ])
    expect(stepLine(steps)).toBe('Step 2 of 3: Building page 2')
    expect(stepLine([])).toBe(null)
    expect(stepLine(steps.map((s) => ({ ...s, status: 'completed' as const })))).toBe('All 3 steps done')
  })

  test('follows the Task tools one change at a time, and drops a deleted step', async () => {
    let steps: Step[] = [{ id: '1', title: 'Set up', doing: 'Setting up', status: 'pending' as const }]
    steps = applyTaskUpdate(steps, { taskId: '1', status: 'in_progress' })
    expect(stepLine(steps)).toBe('Step 1 of 1: Setting up')
    expect(applyTaskUpdate(steps, { taskId: '1', status: 'deleted' })).toEqual([])
  })

  test('says a tiny cost plainly, and an unknown one as a dash', async () => {
    expect(money(0.004)).toBe('under $0.01')
    expect(money(1.234)).toBe('$1.23')
    expect(money(null)).toBe('-')
  })
})

describe('the recent actions', () => {
  test('say each action in plain words, and skip the step list itself', async () => {
    expect(actionLabel({ tool: 'Edit', file_path: 'D:\\shop\\src\\checkout.js' })).toBe('Changed checkout.js')
    expect(actionLabel({ tool: 'Write', file_path: '/p/index.html' })).toBe('Wrote index.html')
    expect(actionLabel({ tool: 'Bash', command: 'npm test', description: 'Run the tests' })).toBe('Run the tests')
    expect(actionLabel({ tool: 'Bash', command: 'npm test' })).toBe('Ran a command')
    expect(actionLabel({ tool: 'Skill', skill: 'easyclaude:build-task' })).toBe('Used the build-task skill')
    expect(actionLabel({ tool: 'mcp__Claude_Browser__navigate' })).toBe('Looked at the page')
    expect(actionLabel({ tool: 'TodoWrite', todos: [] })).toBe(null)
  })

  test('keep the newest eight, and the same line twice in a row once', async () => {
    let recent: string[] = []
    for (const l of ['Read a.js', 'Read a.js', 'Changed a.js', null]) recent = addRecent(recent, l)
    expect(recent).toEqual(['Read a.js', 'Changed a.js'])
    for (let i = 0; i < 10; i++) recent = addRecent(recent, `Wrote ${i}.js`)
    expect(recent.length).toBe(8)
    expect(recent[7]).toBe('Wrote 9.js')
  })
})

describe('the control panel state', () => {
  test('reads the level, cheap mode, plain answers and setup from the project files', async () => {
    const s = settingsFrom({
      autoship: JSON.stringify({ enabled: true, through: 'pr' }),
      cheap: '2026-10-06',
      local: JSON.stringify({ outputStyle: 'easyclaude:plain' }),
      state: '# State\n',
    })
    expect(s).toEqual({ autoship: 'pr', cheap: true, plain: true, setUp: true, git: true })
    const fresh = settingsFrom({ autoship: JSON.stringify({ enabled: false, through: 'merge' }), cheap: null, local: null, state: '<!-- easyclaude:not-kicked-off -->' })
    expect(fresh).toEqual({ autoship: 'off', cheap: false, plain: false, setUp: false, git: true })
    // A level the command does not know arms nothing, so the panel must not show it as set.
    expect(settingsFrom({ autoship: JSON.stringify({ enabled: true, through: 'everything' }), cheap: null, local: null, state: null }).autoship).toBe('off')
  })
})

describe('the panels, drawn', () => {
  test('progress shows the step in progress after Claude updates its list', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async () => ({ result: {} }) as any)
    await $.prompt.submit({ text: 'make a website for my bakery' } as any)
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'Read the plan', status: 'completed', activeForm: 'Reading the plan' },
        { content: 'Build the home page', status: 'in_progress', activeForm: 'Building the home page' },
      ],
    } as any)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'easyclaude', surface, ...pane('easyclaude-progress') })
      expect(await ui.find({ type: 'Text', text: /make a website for my bakery/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▶ Building the home page' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '1 of 2' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('with no step list, progress shows the latest actions in plain words', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async () => ({ result: {} }) as any)
    await $.prompt.submit({ text: 'fix the footer' } as any)
    await $.tool.call({ tool: 'Read', file_path: '/p/index.html' } as any)
    await $.tool.call({ tool: 'Edit', file_path: '/p/index.html', old_string: 'a', new_string: 'b' } as any)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'easyclaude', surface, ...pane('easyclaude-progress') })
      expect(await ui.find({ type: 'Text', text: '✓ Read index.html' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '▶ Changed index.html' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /no step list/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the Task tools build the step list, and their ids never clash with a TodoWrite list', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async (_$, e: any) => ({ result: e.tool === 'TaskCreate' ? { task: { id: '0', subject: e.subject } } : {} }) as any)
    await $.prompt.submit({ text: 'add a contact page' } as any)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Write the form', description: '', activeForm: 'Writing the form' } as any)
    await $.tool.call({ tool: 'TaskUpdate', taskId: '0', status: 'in_progress' } as any)
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-progress') })
    expect(await ui.find({ type: 'Text', text: '▶ Writing the form' })).toBeDefined()
    await ui.unmount()
  })

  test('a control panel button runs the command it names', async ($, on) => {
    project(on, { 'docs/STATE.md': '# State\n', '.claude/autoship.json': JSON.stringify({ enabled: true, through: 'commit' }) })
    const ran: string[] = []
    on('command.run', async (_$, e) => {
      ran.push(`${e.command} ${e.args}`.trim())
      return { text: '' }
    })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'easyclaude', surface, ...pane('easyclaude-controls') })
      await ui.select({ key: 'autoship', value: 'pr' })
      await ui.press({ key: 'skills' })
      await ui.unmount()
    }
    expect(ran).toEqual(['easyclaude:autoship pr', 'easyclaude:skills', 'easyclaude:autoship pr', 'easyclaude:skills'])
  })

  test('the control panel shows the level the project has, explains it, and offers setup only before it', async ($, on) => {
    project(on, { '.claude/autoship.json': JSON.stringify({ enabled: true, through: 'push' }) })
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-controls') })
    expect(await ui.find({ type: 'Text', text: /^Autoship level/ })).toBeDefined()
    expect(await ui.find({ key: 'autoship' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /does every step up to this level/ })).toBeDefined()
    expect(await ui.find({ key: 'setup' })).toBeDefined()
    expect(await ui.find({ key: 'create-repo' })).toBeUndefined()
    await ui.unmount()
  })

  test('with no git, the level is a Create repo button that asks Claude to start one', async ($, on) => {
    project(on, { 'docs/STATE.md': '# State\n' }, { git: false })
    const sent: string[] = []
    on('prompt.submit', async (_$, e: any) => { sent.push(e.text); return { text: e.text } as any })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'easyclaude', surface, ...pane('easyclaude-controls') })
      expect(await ui.find({ key: 'autoship' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /Needs a git repository/ })).toBeDefined()
      await ui.press({ key: 'create-repo' })
      await ui.unmount()
    }
    // Pressed once on each surface within a minute: one request, not two turns.
    expect(sent.length).toBe(1)
    expect(sent[0]).toMatch(/git init/)
  })
})
