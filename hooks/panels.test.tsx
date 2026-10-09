// Run with `claude plugin test .` from the plugin root. The node suite (scripts/test.mjs)
// does not run these: they need Claude Code's own engine.
import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { actionLabel, addRecent, applyTaskUpdate, fromTodos, isDevServer, money, settingsFrom, stepLine, waitingOn } from './panels'
import { ADVICE_LIMIT, afterStep, afterTurn, freshGuard, holdText, shouldHold } from './clear-reminder'
import { flowOf, label, side } from './savvy-progress/register'
import type { Request, Step } from '../types'

const SURFACES = ['terminal', 'desktop'] as const

// What the engine answers beneath the plugin in a session: a clock, the project folder, its
// files, and the session's figures.
// The conversation's size the engine reports; a test sets it to make a conversation long.
let contextTokens = 50_000
const project = (on: On, files: Record<string, string>, { git = true } = {}) => {
  contextTokens = 50_000
  const clock = mock.clock(on, { now: 1_000_000 })
  on('fs.exists', async (_$, e: any) => ({ value: git && /[\\/]\.git$/.test(String(e.path)) }) as any)
  on('session.root', async () => ({ value: '/p' }) as any)
  // What the band shows with nothing of easyClaude's: the engine draws it in a session.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.usage', async () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens: contextTokens, window: 200_000, percent: 25 }, cost: { usd: 0.5 } } }) as any)
  on('fs.read', async (_$, e: any) => {
    // The engine hands the path over in the platform's own form: D:\p\docs\STATE.md here.
    const rel = String(e.path).replace(/\\/g, '/').replace(/^([A-Za-z]:)?\/p\//, '')
    if (rel in files) return { value: files[rel] } as any
    throw new Error(`not found: ${e.path}`)
  })
  return clock
}
const band = () => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} } as any,
})
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

describe('background work at the end of a turn', () => {
  test('a dev server or a watcher never ends, so it is not waited on', async () => {
    for (const command of ['npm run dev', 'pnpm dev', 'npx vite', 'next dev', 'FOO=1 vite', 'python -m http.server 8000', 'node server.js',
      'npm test -- --watch', 'npx jest --watchAll', 'docker compose up', 'tail -f log.txt']) {
      expect(isDevServer({ type: 'shell', command })).toBe(true)
    }
    for (const command of ['npm test', 'node --test', 'npx vite build', 'node scripts/test.mjs', 'npm test && echo next',
      'yarn dev:build', 'npm run start-db', 'grep -w cart src/cart.js', 'docker compose up -d']) {
      expect(isDevServer({ type: 'shell', command })).toBe(false)
    }
  })

  test('what is waited on is named as Claude described it, and a helper counts too', async () => {
    const waiting = waitingOn([
      { id: 'a', type: 'shell', command: 'npm test', description: 'Run the tests' },
      { id: 'b', type: 'subagent', agent_type: 'Explore', description: '' },
      { id: 'c', type: 'shell', command: 'npm run dev', description: 'Start the dev server' },
    ])
    expect(waiting).toEqual([{ id: 'a', label: 'Run the tests' }, { id: 'b', label: 'Explore' }])
    expect(waitingOn(undefined)).toEqual([])
    // Listed, but its status says it ended.
    expect(waitingOn([{ id: 'd', type: 'shell', command: 'npm test', status: 'completed', description: 'Run the tests' }])).toEqual([])
  })
})

describe('the progress bar', () => {
  const r: Request = { text: 'make a website', startedAt: 0, endedAt: null, steps: [], recent: [], tools: 0, costAtStart: null }
  test('counts the steps done, and says Working before Claude keeps a list', async () => {
    const steps = fromTodos([
      { content: 'Read the plan', status: 'completed' },
      { content: 'Build the page', status: 'in_progress' },
    ])
    const f = flowOf({ ...r, steps, tools: 3 }, { dismissedAt: -1 })!
    expect(label(f)).toBe('1/2 steps')
    expect(side(f)).toBe('50%')
    const bare = flowOf({ ...r, tools: 4 }, { dismissedAt: -1 })!
    expect(label(bare)).toBe('Working')
    expect(side(bare)).toBe('4 actions')
  })

  test('says how long a finished request took, and hides one the user closed', async () => {
    const done = flowOf({ ...r, endedAt: 134_000 }, { dismissedAt: -1 })!
    expect(label(done)).toBe('Done')
    expect(side(done)).toBe('2m 14s')
    expect(flowOf(r, { dismissedAt: 0 })).toBe(null)
    expect(flowOf(null, { dismissedAt: -1 })).toBe(null)
  })
})

describe('the /clear reminder', () => {
  test('holds a message once a conversation is long, and never a command', async () => {
    // A fresh conversation: its first model request is the floor, not the end of its first turn.
    const fresh = afterStep(freshGuard(true, true), 25_000)
    const g = afterTurn(afterTurn(fresh, 60_000), 25_000 + ADVICE_LIMIT + 1_000)
    expect(g.floor).toBe(25_000)
    expect(shouldHold(g, 'add a footer', true)).toBe(true)
    expect(shouldHold(g, '/clear', true)).toBe(false)
    expect(shouldHold(g, '', true)).toBe(false)
    // A helper's report or a scheduled prompt: nobody could send it again.
    expect(shouldHold(g, 'add a footer', false)).toBe(false)
    expect(shouldHold({ ...g, isInteractive: false }, 'add a footer', true)).toBe(false)
    // Held once in this stretch, however long it grows.
    const held = afterTurn({ ...g, heldAt: g.ctx }, g.ctx! + 20_000)
    expect(shouldHold(held, 'add a footer', true)).toBe(false)
    // Shrunk to half (/compact, say) and long again: a new stretch, held once more.
    const again = afterTurn(afterTurn(held, 40_000), 25_000 + ADVICE_LIMIT + 5_000)
    expect(shouldHold(again, 'add a footer', true)).toBe(true)
  })

  test('after a reload or a resume the floor is the guess, never the size of the conversation', async () => {
    const reloaded = afterTurn(freshGuard(), 150_000)
    expect(reloaded.floor).toBe(null)
    expect(shouldHold(reloaded, 'add a footer', true)).toBe(true)
    // A smaller request than the guess lowers it; a larger one never raises it.
    expect(afterStep(freshGuard(), 20_000).floor).toBe(20_000)
    expect(afterStep(freshGuard(), 150_000).floor).toBe(30_000)
  })

  test('speaks Thai to a Thai message, and names the plan only when there is one', async () => {
    expect(holdText(120_000, 'docs/STATE.md', 'add a footer')).toMatch(/about 120k tokens.*\/clear first: your plan stays in docs\/STATE\.md.*send your message again/)
    expect(holdText(120_000, null, 'add a footer')).not.toMatch(/plan/)
    expect(holdText(120_000, 'docs/STATE.md', 'เพิ่ม')).toMatch(/\/clear.*docs\/STATE\.md/)
    expect(holdText(120_000, 'docs/STATE.md', 'เพิ่ม')).toMatch(/[฀-๿]/)
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
  test('the bar above the prompt shows the request and its steps after Claude updates its list', async ($, on) => {
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
      const ui = await $.ui.mount({ plugin: 'easyclaude', surface, ...band() })
      // The desktop draws the bar as one picture; the terminal as text.
      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: /make a website for my bakery/ })).toBeDefined()
        expect(await ui.find({ type: 'Text', text: '1/2 steps' })).toBeDefined()
      }
      expect(await ui.find({ key: 'easyclaude-dismiss' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('closing the bar hides it until the next request', async ($, on) => {
    const clock = project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async () => ({ result: {} }) as any)
    await $.prompt.submit({ text: 'fix the footer' } as any)
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...band() })
    await ui.press({ key: 'easyclaude-dismiss' })
    await ui.unmount()
    const closed = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...band() })
    expect(await closed.find({ type: 'Text', text: /fix the footer/ })).toBeUndefined()
    await closed.unmount()
    await clock.advance(60_000)
    await $.prompt.submit({ text: 'and the header' } as any)
    // A tool call waits for the request's record, which is written in the background.
    await $.tool.call({ tool: 'Read', file_path: '/p/index.html' } as any)
    const again = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...band() })
    expect(await again.find({ type: 'Text', text: /and the header/ })).toBeDefined()
    await again.unmount()
  })

  test('a helper Claude starts shows in the helpers panel, and is marked done when its turn ends', async ($, on) => {
    project(on, {})
    on('agent.spawn', async () => ({ agentId: 'a1', model: 'claude-sonnet-5-5' }) as any)
    on('turn.complete', async () => ({ text: '' }) as any)
    await $.agent.spawn({ prompt: 'look', description: 'Find the checkout code', subagentType: 'Explore' } as any)
    const running = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-helpers') })
    expect(await running.find({ type: 'Text', text: /Find the checkout code/ })).toBeDefined()
    expect(await running.find({ type: 'Text', text: '●' })).toBeDefined()
    await running.unmount()
    await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: '', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
    const done = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-helpers') })
    expect(await done.find({ type: 'Text', text: '✓' })).toBeDefined()
    await done.unmount()
  })

  test('the bar always has a Details button, and the progress panel lists the steps', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async () => ({ result: {} }) as any)
    await $.prompt.submit({ text: 'add a contact form' } as any)
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'Write the form', status: 'completed', activeForm: 'Writing the form' },
        { content: 'Send the email', status: 'in_progress', activeForm: 'Sending the email' },
        { content: 'Test it', status: 'pending', activeForm: 'Testing it' },
      ],
    } as any)
    for (const surface of SURFACES) {
      const bar = await $.ui.mount({ plugin: 'easyclaude', surface, ...band() })
      expect(await bar.find({ key: 'easyclaude-helpers' })).toBeDefined()
      await bar.unmount()
    }
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-helpers') })
    expect(await ui.find({ type: 'Text', text: /add a contact form/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Steps · 1/3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sending the email/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Test it/ })).toBeDefined()
    await ui.unmount()
  })

  test('with no step list, the progress panel lists the latest actions', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async () => ({ result: {} }) as any)
    await $.prompt.submit({ text: 'fix the typo' } as any)
    await $.tool.call({ tool: 'Read', file_path: '/p/about.html' } as any)
    await $.tool.call({ tool: 'Edit', file_path: '/p/about.html' } as any)
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-helpers') })
    expect(await ui.find({ type: 'Text', text: 'Latest actions' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Changed about.html/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Read about.html/ })).toBeDefined()
    await ui.unmount()
  })

  test('a background task report carries on the request, and does not become its title', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async () => ({ result: {} }) as any)
    await $.prompt.submit({ text: 'run the tests' } as any)
    await $.tool.call({ tool: 'Read', file_path: '/p/a.js' } as any)
    await $.prompt.submit({ text: '<task-notification> <task-id>b1</task-id> done</task-notification>' } as any)
    await $.tool.call({ tool: 'Read', file_path: '/p/b.js' } as any)
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...band() })
    expect(await ui.find({ type: 'Text', text: /run the tests/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /task-notification/ })).toBeUndefined()
    await ui.unmount()
  })

  // A beginner saw "Done", looked, found nothing, and said "it doesn't work", while a test
  // run or a helper Claude started in the background was still going. The turn had ended;
  // the work had not.
  test('a turn that ends with background work running says Waiting, not Done, until the work ends', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('tool.call', async () => ({ result: {} }) as any)
    on('turn.complete', async () => ({ text: '' }) as any)
    on('classic.Stop', async () => ({}) as any)
    await $.prompt.submit({ text: 'add a contact form' } as any)
    await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true } as any)
    await $.turn.complete({ reason: 'answer', answer: 'Running the tests.', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Run the tests', command: 'npm test' }],
    } as any)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'easyclaude', surface, ...band() })
      if (surface === 'terminal') {
        expect(await ui.find({ type: 'Text', text: 'Done' })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: 'Waiting' })).toBeDefined()
      }
      await ui.unmount()
    }
    const panel = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-helpers') })
    expect(await panel.find({ type: 'Text', text: /Run the tests/ })).toBeDefined()
    await panel.unmount()

    // The report arrives, Claude carries on, and this time nothing is left running.
    await $.prompt.submit({ text: '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>' } as any)
    await $.turn.complete({ reason: 'answer', answer: 'All tests pass.', durationMs: 1000, isAborted: false, turnId: 't2' } as any)
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as any)
    const done = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...band() })
    expect(await done.find({ type: 'Text', text: 'Done' })).toBeDefined()
    await done.unmount()
  })

  test('an interrupted turn does not stay on Waiting', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('turn.complete', async () => ({ text: '' }) as any)
    on('classic.Stop', async () => ({}) as any)
    await $.prompt.submit({ text: 'run the tests' } as any)
    await $.turn.complete({ reason: 'answer', answer: 'Running them.', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Run the tests', command: 'npm test' }],
    } as any)
    // The report wakes Claude, and the person interrupts before the turn's Stop.
    await $.prompt.submit({ text: '<task-notification><task-id>b1</task-id><status>completed</status></task-notification>' } as any)
    await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 500, isAborted: true, turnId: 't2' } as any)
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...band() })
    expect(await ui.find({ type: 'Text', text: 'Waiting' })).toBeUndefined()
    await ui.unmount()
  })

  test('a dev server left running does not keep the bar waiting', async ($, on) => {
    project(on, {})
    on('prompt.submit', async (_$, e: any) => ({ text: e.text }) as any)
    on('turn.complete', async () => ({ text: '' }) as any)
    on('classic.Stop', async () => ({}) as any)
    await $.prompt.submit({ text: 'show me the site' } as any)
    await $.turn.complete({ reason: 'answer', answer: 'It runs at localhost:5173.', durationMs: 1000, isAborted: false, turnId: 't1' } as any)
    await $.classic.Stop({
      stop_hook_active: false,
      background_tasks: [{ id: 'b2', type: 'shell', status: 'running', description: 'Start the dev server', command: 'npm run dev' }],
    } as any)
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...band() })
    expect(await ui.find({ type: 'Text', text: 'Done' })).toBeDefined()
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

  test('the control panel shows the level the project has, explains it on request, and offers setup only before it', async ($, on) => {
    project(on, { '.claude/autoship.json': JSON.stringify({ enabled: true, through: 'push' }) })
    const short = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-controls') })
    expect(await short.find({ type: 'Text', text: /^When a task is done/ })).toBeDefined()
    // Short by default: the buttons and settings, and no notes.
    expect(await short.find({ type: 'Text', text: /does this much by itself/ })).toBeUndefined()
    expect(await short.find({ type: 'Text', text: /Changes nothing/ })).toBeUndefined()
    await short.press({ key: 'controls-help' })
    await short.unmount()
    const ui = await $.ui.mount({ plugin: 'easyclaude', surface: 'terminal', ...pane('easyclaude-controls') })
    expect(await ui.find({ key: 'autoship' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /does this much by itself/ })).toBeDefined()
    // Each button says what it does beside it: at Save and upload, saving uploads too.
    expect(await ui.find({ type: 'Text', text: 'Runs the checks, saves, then uploads it' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Changes nothing/ })).toBeDefined()
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
      expect(await ui.find({ type: 'Text', text: /Saved versions are not set up yet/ })).toBeDefined()
      await ui.press({ key: 'create-repo' })
      await ui.unmount()
    }
    // Pressed once on each surface within a minute: one request, not two turns.
    expect(sent.length).toBe(1)
    expect(sent[0]).toMatch(/git init/)
  })
})
