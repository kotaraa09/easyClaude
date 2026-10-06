// easyClaude's two panels: what the request in progress has done and cost, and a button for
// each easyClaude feature.
//
// A beginner could not see how far a request had got, or what it cost, without asking -
// and asking is another paid message. And each feature was a command to remember. Both
// panels run outside the model: they add nothing to any request.
//
// This is a Claude Code hooks module (early access). Where installed plugins may not load
// one - an older Claude Code, or an account the feature has not reached - nothing here
// runs, and everything else in easyClaude works as before.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Request, Step, Usage } from '../types'

const PROGRESS = 'easyclaude-progress'
const CONTROLS = 'easyclaude-controls'

const request = atom({ plugin: 'easyclaude', key: 'request' } as const, null)
const usage = atom({ plugin: 'easyclaude', key: 'usage' } as const, {
  costUsd: null, contextTokens: null, contextWindow: null, contextPercent: null,
})

export const LEVELS = ['off', 'commit', 'push', 'pr', 'merge'] as const

// --- figures --------------------------------------------------------------------------
export const money = (usd: number | null): string =>
  usd === null ? '-' : usd < 0.01 ? 'under $0.01' : `$${usd.toFixed(2)}`

export const tokens = (n: number | null): string =>
  n === null ? '-' : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const duration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// --- the step list, from Claude's own -------------------------------------------------
// TodoWrite sends the whole list each time. The Task tools send one change at a time, and
// TaskCreate's id arrives only in its result.
export function fromTodos(todos: ReadonlyArray<{ content: string; status: string; activeForm?: string }>): Step[] {
  return todos.map((t, i) => ({
    // Prefixed, so a TaskUpdate's id never lands on one of these.
    id: `todo-${i}`,
    title: t.content,
    doing: t.activeForm || t.content,
    status: t.status === 'completed' || t.status === 'in_progress' ? t.status : 'pending',
  }))
}

export function applyTaskUpdate(steps: Step[], u: { taskId: string; status?: string; subject?: string; activeForm?: string }): Step[] {
  if (u.status === 'deleted') return steps.filter((s) => s.id !== u.taskId)
  return steps.map((s) => (s.id !== u.taskId ? s : {
    ...s,
    title: u.subject ?? s.title,
    doing: u.activeForm ?? s.doing,
    status: u.status === 'completed' || u.status === 'in_progress' || u.status === 'pending' ? u.status : s.status,
  }))
}

// "Step 3 of 6: Building page 2", or null when Claude kept no list for this request.
export function stepLine(steps: Step[]): string | null {
  if (!steps.length) return null
  const done = steps.filter((s) => s.status === 'completed').length
  const now = steps.find((s) => s.status === 'in_progress')
  if (!now) return done === steps.length ? `All ${steps.length} steps done` : `${done} of ${steps.length} steps done`
  return `Step ${steps.indexOf(now) + 1} of ${steps.length}: ${now.doing}`
}

async function readUsage($: any): Promise<Usage> {
  try {
    const u = await $.session.usage()
    return {
      costUsd: u.cost?.usd ?? null,
      contextTokens: u.context?.tokens ?? null,
      contextWindow: u.context?.window ?? null,
      contextPercent: u.context?.percent ?? null,
    }
  } catch {
    return { costUsd: null, contextTokens: null, contextWindow: null, contextPercent: null }
  }
}

// --- the control panel's state, read from the project's own files ---------------------
async function readText($: any, root: string, rel: string): Promise<string | null> {
  try { return String(await $.fs.read(`${root}/${rel}`)) } catch { return null }
}

export type Settings = { autoship: string; cheap: boolean; plain: boolean; setUp: boolean; git: boolean }

// `git` unknown counts as present: a wrong "Create repo" offer is worse than a missing one.
export function settingsFrom(files: { autoship: string | null; cheap: string | null; local: string | null; state: string | null; git?: boolean }): Settings {
  let autoship = 'off'
  try {
    const a = JSON.parse(files.autoship ?? 'null')
    const level = a?.enabled === true ? (a.through ?? 'commit') : 'off'
    // A level the command does not know arms nothing (scripts/autoship.mjs), so it reads as off.
    autoship = (LEVELS as readonly string[]).includes(level) ? level : 'off'
  } catch { /* a broken file arms nothing; the command reports it */ }
  let plain = false
  try { plain = JSON.parse(files.local ?? 'null')?.outputStyle === 'easyclaude:plain' } catch { /* not plain */ }
  return { autoship, cheap: files.cheap !== null, plain, setUp: files.state !== null && !files.state.includes('easyclaude:not-kicked-off'), git: files.git ?? true }
}

// Whether the project, or a folder above it, is a git repository. Autoship needs one.
async function hasGit($: any, root: string): Promise<boolean> {
  let dir = root.replace(/[\\/]+$/, '')
  for (let i = 0; i < 30 && dir; i++) {
    try { if (await $.fs.exists(`${dir}/.git`)) return true } catch { return true }
    const up = dir.replace(/[\\/][^\\/]*$/, '')
    if (up === dir) break
    dir = up
  }
  return false
}

async function readSettings($: any): Promise<Settings> {
  let root: string
  try { root = await $.session.root() } catch { return settingsFrom({ autoship: null, cheap: null, local: null, state: null }) }
  let statePath = 'docs/STATE.md'
  try { statePath = JSON.parse((await readText($, root, '.claude/easyclaude.json')) ?? 'null')?.files?.state ?? statePath } catch { /* default */ }
  return settingsFrom({
    autoship: await readText($, root, '.claude/autoship.json'),
    cheap: await readText($, root, '.claude/cheap-session'),
    local: await readText($, root, '.claude/settings.local.json'),
    state: await readText($, root, statePath),
    git: await hasGit($, root),
  })
}

// --- drawing helpers --------------------------------------------------------------------
// A bar of `width` cells, filled in proportion: the step count, the conversation's size.
export const bar = (part: number, whole: number, width: number): string => {
  const cells = Math.max(6, Math.min(40, Math.round(width)))
  const full = whole > 0 ? Math.round((Math.max(0, Math.min(part, whole)) / whole) * cells) : 0
  return '━'.repeat(full) + '─'.repeat(cells - full)
}

export const stepRow = (s: Step): string =>
  s.status === 'completed' ? `✓ ${s.title}` : s.status === 'in_progress' ? `▶ ${s.doing}` : `○ ${s.title}`

const paneWidth = (e: any): number => Math.max(24, Number(e?.props?.bodyColumns) || 40)

// The labels for LEVELS, so the two lists cannot drift apart.
const LEVEL_LABELS: Record<string, string> = { off: 'Off', commit: 'Commit', push: 'Push', pr: 'Open a PR', merge: 'Merge' }
const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] ?? value }))

// One "Create repo" request at a time: a double click must not cost two turns.
let repoAskedAt = 0
const createRepo = async ($: any) => {
  const now = await $.clock.now()
  if (now - repoAskedAt < 60_000) return
  repoAskedAt = now
  await say($, CREATE_REPO)
}
const AUTOSHIP_HELP = 'How far Claude goes on its own when a request is finished and the checks pass. ' +
  'Off: it asks before each step. Commit, Push, Open a PR or Merge: it does every step up to that one without asking.'
const NO_GIT_HELP = 'Autoship needs git, and this folder has none yet. Create repo starts one here, so your work ' +
  'is saved in versions you can go back to.'
const CHEAP_HELP = 'For the rest of this session, each request gets the fewest steps and a short reply. Cheaper, ' +
  'and less careful.'
const PLAIN_HELP = 'Short answers in plain words, without file names or code terms.'
const CREATE_REPO = 'This folder has no git repository yet. Start one here with git init, add a .gitignore ' +
  'that keeps out .env and installed packages if there is none, and tell me in one plain line what you did. ' +
  'Do not commit anything.'

// --- what a button does ---------------------------------------------------------------
// Each one runs what the user would otherwise type, so it costs the same as typing it.
const run = async ($: any, command: string, args = '') => {
  try { await $.command.run({ command, args }) } catch (e) { $.ui.toast(`Could not run /${command}: ${String(e)}`) }
}
const say = async ($: any, text: string) => {
  try { await $.prompt.submit({ text, asUser: true }) } catch (e) { $.ui.toast(`Could not send that: ${String(e)}`) }
}

// Two queues, so work started without awaiting still lands in order. A request's record is
// written in the background (see prompt.submit), and a fast first tool call could otherwise
// count itself and then be wiped by it; a slow figures read could otherwise redraw
// "working" after the request had finished. A failure is dropped from its queue and never
// stops the next piece of work.
let stateWork: Promise<unknown> = Promise.resolve()
let figuresWork: Promise<unknown> = Promise.resolve()
const inOrder = (work: () => Promise<unknown>): Promise<unknown> =>
  (stateWork = stateWork.then(work, work).catch(() => undefined))
const refreshLater = ($: any, atStart: boolean) => {
  figuresWork = figuresWork.then(() => refresh($, atStart)).catch(() => undefined)
}

// Reads the session's figures and redraws the status line, from the record as it is now.
// `atStart`: this is the request's starting cost.
const refresh = async ($: any, atStart: boolean) => {
  const u = await readUsage($)
  await update($, usage, () => u)
  if (atStart) await update($, request, (r) => (r && r.costAtStart === null ? { ...r, costAtStart: u.costUsd } : r))
  const r = await read($, request)
  if (!r) return
  const spent = u.costUsd !== null && r.costAtStart !== null ? u.costUsd - r.costAtStart : null
  $.ui.status(r.endedAt === null
    ? `easyClaude: ${stepLine(r.steps) ?? `${r.tools} actions`} · ${money(spent)}`
    : `easyClaude: last request ${money(spent)}, ${duration(r.endedAt - r.startedAt)}`)
}

const startRequest = async ($: any, said: string) => {
  const now = await $.clock.now()
  const text = said.replace(/\s+/g, ' ').trim()
  const r: Request = {
    text: text.length > 70 ? `${text.slice(0, 70)}...` : text,
    startedAt: now, endedAt: null, steps: [], tools: 0, costAtStart: null,
  }
  await update($, request, () => r)
  $.ui.status('easyClaude: working')
  refreshLater($, true)
}

// One tool call of the main loop, counted against the request in progress.
const recordTool = async ($: any, input: any, result: any) => {
  await update($, request, (r) => {
    if (!r || r.endedAt !== null) return r
    let steps = r.steps
    if (input.tool === 'TodoWrite' && Array.isArray(input.todos)) steps = fromTodos(input.todos)
    if (input.tool === 'TaskCreate') {
      const id = result?.result?.task?.id
      if (id) steps = [...steps, { id: `task-${id}`, title: input.subject ?? '', doing: input.activeForm || input.subject || '', status: 'pending' }]
    }
    if (input.tool === 'TaskUpdate' && input.taskId) steps = applyTaskUpdate(steps, { ...input, taskId: `task-${input.taskId}` })
    return { ...r, steps, tools: r.tools + 1 }
  })
  refreshLater($, false)
}

const endRequest = async ($: any) => {
  const now = await $.clock.now()
  await update($, request, (r) => (r ? { ...r, endedAt: now } : r))
  refreshLater($, false)
}

const openBoth = async ($: any) => {
  void $.ui.open({ id: PROGRESS, title: 'easyClaude: progress' })
  void $.ui.open({ id: CONTROLS, title: 'easyClaude: controls' })
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'easyclaude-panels', description: 'Open the easyClaude progress and control panels' })
    await update($, usage, () => ({ costUsd: null, contextTokens: null, contextWindow: null, contextPercent: null }))
    // A resumed or reloaded session starts with no request in progress.
    await update($, request, () => null)
    await openBoth($)
    return next(e)
  })

  on('command.run', { command: 'easyclaude-panels' }, async ($) => {
    await openBoth($)
    return { text: 'easyClaude panels opened.' }
  })

  // Nothing here is awaited before the request goes on: awaiting the figures held every
  // request back by about a second, and the state write alone by 0.4s. No response has
  // arrived yet, so the cost read a moment later is still the starting cost.
  on('prompt.submit', ($, e, next) => {
    void inOrder(() => startRequest($, e.text))
    return next(e)
  })

  // Awaited, so the panel is right when the tool's result returns; it waits only if the
  // request's own record is still being written, which takes well under a second.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    // The tool's arguments sit beside `tool` on the event: `e.todos`, `e.subject`.
    await inOrder(() => recordTool($, e, result))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await inOrder(() => endRequest($))
    return result
  })

  // --- the progress panel -------------------------------------------------------------
  on('ui.render', { component: 'Pane', requestId: PROGRESS }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, request)
    const u = await read($, usage)
    const now = await $.clock.now()
    const width = paneWidth(e)
    const sizeBar = (
      <Box flexDirection="column">
        <Text color="subtle">Conversation size</Text>
        <Box gap={1}>
          <Text color="inactive">{bar(u.contextTokens ?? 0, u.contextWindow ?? 0, width - 22)}</Text>
          <Text color="subtle">{tokens(u.contextTokens)} of {tokens(u.contextWindow)}</Text>
        </Box>
      </Box>
    )
    if (!r) {
      return (
        <Box flexDirection="column" paddingX={1} gap={1}>
          <Text color="subtle">Send a request, and its progress shows here.</Text>
          <Box flexDirection="column">
            <Text color="subtle">This session</Text>
            <Text bold>{money(u.costUsd)}</Text>
          </Box>
          {sizeBar}
        </Box>
      )
    }
    const running = r.endedAt === null
    const spent = u.costUsd !== null && r.costAtStart !== null ? u.costUsd - r.costAtStart : null
    const done = r.steps.filter((s) => s.status === 'completed').length
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 14)
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box justifyContent="space-between" gap={2}>
          <Text bold wrap="truncate-end">{r.text || 'Your request'}</Text>
          <Text color={running ? 'suggestion' : 'success'}>
            {running ? `Working ${duration(now - r.startedAt)}` : `Done in ${duration((r.endedAt ?? now) - r.startedAt)}`}
          </Text>
        </Box>
        {r.steps.length > 0 && (
          <Box gap={1}>
            <Text color="suggestion">{bar(done, r.steps.length, width - 12)}</Text>
            <Text color="subtle">{done} of {r.steps.length}</Text>
          </Box>
        )}
        {r.steps.length > 0 ? (
          <Box flexDirection="column">
            {r.steps.slice(0, room).map((s) => (
              <Text key={s.id} wrap="truncate-end" bold={s.status === 'in_progress'}
                color={s.status === 'completed' ? 'subtle' : s.status === 'in_progress' ? 'suggestion' : 'inactive'}>
                {stepRow(s)}
              </Text>
            ))}
            {r.steps.length > room && <Text color="subtle">  and {r.steps.length - room} more</Text>}
          </Box>
        ) : (
          <Text color="subtle">
            {running ? `${r.tools} actions so far. Claude keeps no step list for this request.` : `Finished after ${r.tools} actions.`}
          </Text>
        )}
        <Text color="promptBorder">{'─'.repeat(Math.max(10, width - 2))}</Text>
        <Box gap={4}>
          <Box flexDirection="column">
            <Text color="subtle">This request</Text>
            <Text bold>{money(spent)}</Text>
          </Box>
          <Box flexDirection="column">
            <Text color="subtle">This session</Text>
            <Text bold>{money(u.costUsd)}</Text>
          </Box>
        </Box>
        {sizeBar}
        <Text color="subtle" dimColor>List prices, as /cost shows them</Text>
      </Box>
    )
  })

  // --- the control panel --------------------------------------------------------------
  on('ui.render', { component: 'Pane', requestId: CONTROLS }, async ($, e) => {
    const table: any = $.ui.resolve(e)
    const { Box, Text, Button, Select } = table
    const s = await readSettings($)
    const width = paneWidth(e)
    // A setting's row: its name, its state and control on the right, and what it does,
    // revealed while the pointer is over the row.
    const row = (key: string, name: string, help: string, control: any) => (
      <Box key={key} justifyContent="space-between" alignItems="center" position="relative">
        <Text>{name} <Text color="subtle">(?)</Text></Text>
        {control}
        <Box display="none" hover={{ display: 'flex' }} position="absolute" top={1} left={0}
          width={Math.max(20, width - 4)} borderStyle="round" borderColor="promptBorder" backgroundColor="background" paddingX={1}>
          <Text wrap="wrap">{help}</Text>
        </Box>
      </Box>
    )
    const toggle = (isOn: boolean, onKey: string, offKey: string, turnOn: () => void, turnOff: () => void) => (
      <Box gap={1} alignItems="center">
        <Text color={isOn ? 'success' : 'subtle'}>{isOn ? 'On' : 'Off'}</Text>
        {isOn
          ? <Button key={offKey} label="Turn off" onPress={turnOff} />
          : <Button key={onKey} label="Turn on" onPress={turnOn} />}
      </Box>
    )
    const level = !s.git
      ? <Button key="create-repo" label="Create repo" onPress={() => createRepo($)} />
      : Select
        ? <Select key="autoship" options={LEVEL_OPTIONS} value={s.autoship} onSelect={(v: string) => run($, 'easyclaude:autoship', v)} />
        : <Box gap={1}>{LEVELS.map((l) => (
            <Button key={`autoship-${l}`} label={l} variant={l === s.autoship ? 'primary' : 'secondary'} onPress={() => run($, 'easyclaude:autoship', l)} />
          ))}</Box>
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        {!s.setUp && (
          <Box flexDirection="column" borderStyle="round" borderColor="suggestion" paddingX={1}>
            <Text bold>Set up this project</Text>
            <Text color="subtle" wrap="wrap">easyClaude then remembers it between sessions and runs its checks after each change.</Text>
            <Box><Button key="setup" variant="primary" label="Set up" onPress={() => run($, 'easyclaude:start')} /></Box>
          </Box>
        )}
        <Box gap={1} flexWrap="wrap">
          <Button key="continue" label="Continue" variant={s.setUp ? 'primary' : 'secondary'} onPress={() => say($, 'keep going')} />
          <Button key="ship" label="Save my work" onPress={() => say($, 'ship it')} />
          <Button key="undo" label="Undo last change" onPress={() => say($, 'I want to undo the last change. Tell me what you would restore before you change anything.')} />
        </Box>
        <Text color="promptBorder">{'─'.repeat(Math.max(10, width - 2))}</Text>
        <Box flexDirection="column" gap={1}>
          {row('autoship-row', 'Autoship level', s.git ? AUTOSHIP_HELP : NO_GIT_HELP, level)}
          {row('cheap-row', 'Cheap mode', CHEAP_HELP, toggle(s.cheap, 'cheap-on', 'cheap-off',
            () => run($, 'easyclaude:cheap-session'), () => run($, 'easyclaude:full')))}
          {row('plain-row', 'Plain answers', PLAIN_HELP, toggle(s.plain, 'plain', 'plain',
            () => run($, 'easyclaude:plain', 'on'), () => run($, 'easyclaude:plain', 'off')))}
        </Box>
        <Text color="promptBorder">{'─'.repeat(Math.max(10, width - 2))}</Text>
        <Box flexDirection="column">
          <Text color="subtle">Tools</Text>
          <Box gap={1} flexWrap="wrap">
            <Button key="skills" label="Find skills" onPress={() => run($, 'easyclaude:skills')} />
            <Button key="connect" label="Connect tools" onPress={() => run($, 'easyclaude:connect')} />
            <Button key="security" label="Security check" onPress={() => run($, 'easyclaude:security-check')} />
          </Box>
        </Box>
      </Box>
    )
  })
}
