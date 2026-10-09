// easyClaude's control panel, a button for each easyClaude feature, and the record of the
// request in progress: its steps, its recent actions and its cost.
//
// A beginner could not see how far a request had got, or what it cost, without asking -
// and asking is another paid message. And each feature was a command to remember. The
// record feeds the status line here and the progress bar above the prompt
// (hooks/savvy-progress). All of it runs outside the model: it adds nothing to any request.
//
// This is a Claude Code hooks module (early access). Where installed plugins may not load
// one - an older Claude Code, or an account the feature has not reached - nothing here
// runs, and everything else in easyClaude works as before.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Request, Step, Usage } from '../types'
import { clearHeld, clearHistory, clearOnStart, clearOnTurnEnd, holdText } from './clear-reminder'
import { HELPERS_DESCRIPTION, helperEnded } from './savvy-progress/register'

const CONTROLS = 'easyclaude-controls'

const request = atom({ plugin: 'easyclaude', key: 'request' } as const, null)
const usage = atom({ plugin: 'easyclaude', key: 'usage' } as const, {
  costUsd: null, contextTokens: null, contextWindow: null, contextPercent: null,
})
// The helpers panel's list and clock (savvy-progress/), written here when a helper's turn ends.
const helpers = atom({ plugin: 'easyclaude', key: 'agents' } as const, [])
const helpersNow = atom({ plugin: 'easyclaude', key: 'agentsNow' } as const, 0)
// Whether the control panel explains each control. Off: the panel is short.
const controlsHelp = atom({ plugin: 'easyclaude', key: 'controlsHelp' } as const, false)

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

// --- the recent actions, for a request with no step list -------------------------------
// A user testing 1.1.2 saw only "working" and then "done": Claude kept no step list, and the
// panel had nothing else to show. Each action of the main loop now gets a line in plain
// words, so the panel always shows what is happening.
const base = (p: unknown): string => String(p ?? '').split(/[\\/]/).filter(Boolean).pop() ?? 'a file'
const clip = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 3)}...` : s)

// What one tool call did, said plainly, or null for one that is not news (the step list).
export function actionLabel(e: { tool?: string; [k: string]: any }): string | null {
  const tool = String(e.tool ?? '')
  switch (tool) {
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return `Changed ${base(e.file_path ?? e.notebook_path)}`
    case 'Write': return `Wrote ${base(e.file_path)}`
    case 'Read': return `Read ${base(e.file_path)}`
    case 'Grep': case 'Glob': return 'Searched the code'
    case 'Bash': case 'PowerShell': return e.description ? clip(String(e.description)) : 'Ran a command'
    case 'WebFetch': return 'Read a web page'
    case 'WebSearch': return 'Searched the web'
    case 'Agent': case 'Task': return e.description ? clip(`Asked a helper: ${e.description}`) : 'Asked a helper'
    case 'Skill': return e.skill ? `Used the ${String(e.skill).replace(/^.*:/, '')} skill` : 'Used a skill'
    case 'AskUserQuestion': return 'Asked you a question'
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': case 'TaskList': case 'TaskGet': case 'ToolSearch': return null
  }
  if (/browser|chrome|preview/i.test(tool)) return 'Looked at the page'
  if (tool.startsWith('mcp__')) return 'Used a connected tool'
  return tool ? `Used ${tool}` : null
}

const RECENT_KEPT = 8
// Newest last. The same line twice in a row is kept once: three reads of one file are news once.
export function addRecent(recent: string[], label: string | null): string[] {
  if (!label || recent[recent.length - 1] === label) return recent
  return [...recent, label].slice(-RECENT_KEPT)
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

// The plan file, if the project has one, and whether cheap mode is on: for the /clear note.
async function planAndCheap($: any): Promise<{ plan: string | null; cheap: boolean }> {
  let root: string
  try { root = await $.session.root() } catch { return { plan: null, cheap: false } }
  let plan = 'docs/STATE.md'
  try { plan = JSON.parse((await readText($, root, '.claude/easyclaude.json')) ?? 'null')?.files?.state ?? plan } catch { /* default */ }
  return {
    plan: (await readText($, root, plan)) !== null ? plan : null,
    cheap: (await readText($, root, '.claude/cheap-session')) !== null && !(await tracked($, root, '.claude/cheap-session')),
  }
}

// Whether git tracks the file. A cheap-session file that came with the repository is not this
// user's, and prompt-check.mjs ignores it (personal.mjs); so does the /clear note.
async function tracked($: any, root: string, rel: string): Promise<boolean> {
  try {
    const run = await $.process.run(['git', 'ls-files', '--error-unmatch', rel], { cwd: root, timeoutMs: 5000 })
    return run.exitCode === 0
  } catch { return false }
}

// --- drawing helpers --------------------------------------------------------------------
const RULE = '─'.repeat(200)

const paneWidth = (e: any): number => Math.max(24, Number(e?.props?.bodyColumns) || 40)

// The labels for LEVELS, so the two lists cannot drift apart. Said as what happens to the
// user's work, not in git's words: a beginner does not know what "Push" or "Merge" does.
const LEVEL_LABELS: Record<string, string> = {
  off: 'Ask me first', commit: 'Save a version', push: 'Save and upload', pr: 'Upload for review', merge: 'Add to main version',
}
const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value] ?? value }))

// One "Create repo" request at a time: a double click must not cost two turns.
let repoAskedAt = 0
const createRepo = async ($: any) => {
  const now = await $.clock.now()
  if (now - repoAskedAt < 60_000) return
  repoAskedAt = now
  await say($, CREATE_REPO)
}
// What each setting does, shown under it while the explanations are on.
const AUTOSHIP_NAME = 'When a task is done'
const AUTOSHIP_HELP = 'When a task is finished and its checks pass, Claude does this much by itself, and each ' +
  'choice includes the ones above it. "Ask me first" saves and uploads nothing without asking you.'
const NO_GIT_NOTE = 'Saved versions are not set up yet'
const NO_GIT_HELP = 'Turn on versions starts a git repository in this folder, so every version you save can ' +
  'be brought back. Nothing is uploaded.'
const CHEAP_NOTE = 'Fewer steps and shorter replies'
const CHEAP_HELP = 'For this session only. It costs less, and Claude checks less.'
const PLAIN_NOTE = 'Short answers without code words'
const PLAIN_HELP = 'Replies leave out file names and technical words.'

// Each button can say what it does, and whether it changes anything: a beginner should
// neither press one by mistake nor be afraid to press it. "Save my work" and "Helpers" said
// neither what nor where. Said all the time, the notes made the panel too long, so they show
// when "What do these do?" is pressed.
// The buttons' column when the note sits beside them: the longest label and its brackets.
const ACTION_COLUMNS = 22
const SAVE_NOTE = (autoship: string, git: boolean): string =>
  !git ? 'Turn on versions first, below'
    : ['push', 'pr', 'merge'].includes(autoship) ? 'Runs the checks, saves, then uploads it'
      : 'Runs the checks and saves. Asks before uploading'
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
  // The conversation's size once a request has ended: the /clear reminder's measure.
  if (r.endedAt !== null) clearOnTurnEnd(u.contextTokens)
  const spent = u.costUsd !== null && r.costAtStart !== null ? u.costUsd - r.costAtStart : null
  $.ui.status(r.endedAt === null
    ? `easyClaude: ${stepLine(r.steps) ?? r.recent?.[r.recent.length - 1] ?? `${r.tools} actions`} · ${money(spent)}`
    : `easyClaude: last request ${money(spent)}, ${duration(r.endedAt - r.startedAt)}`)
}

const startRequest = async ($: any, said: string) => {
  const now = await $.clock.now()
  const text = said.replace(/\s+/g, ' ').trim()
  const r: Request = {
    text: text.length > 70 ? `${text.slice(0, 70)}...` : text,
    startedAt: now, endedAt: null, steps: [], recent: [], tools: 0, costAtStart: null,
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
    return { ...r, steps, recent: addRecent(r.recent ?? [], actionLabel(input)), tools: r.tools + 1 }
  })
  refreshLater($, false)
}

// Whether a submission carries on the request in progress: a background task's report,
// which Claude Code sends when a task Claude started in the background ends.
export const continuesRequest = (origin: { kind?: string } | undefined, text: string): boolean =>
  origin?.kind === 'task-notification' || /^s*<task-notification>/.test(text)

// The request runs again, under the title the user gave it. With none, it gets a plain one.
const resumeRequest = async ($: any) => {
  if (!(await read($, request))) return startRequest($, 'Background work')
  await update($, request, (r) => (r ? { ...r, endedAt: null } : r))
  $.ui.status('easyClaude: working')
  refreshLater($, false)
}

const endRequest = async ($: any) => {
  const now = await $.clock.now()
  await update($, request, (r) => (r ? { ...r, endedAt: now } : r))
  refreshLater($, false)
}

const openControls = async ($: any) => {
  void $.ui.open({ id: CONTROLS, title: 'easyClaude: controls' })
}

// Claude Code takes one hook per event from a plugin, so the three events the other parts
// also need - session.start, prompt.submit and turn.complete - are hooked here alone, and
// call into clear-reminder.ts and savvy-progress/ for their share.
export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    clearOnStart(e.isInteractive !== false)
    await $.command.register({ name: 'easyclaude-helpers', description: HELPERS_DESCRIPTION })
    // Ticks the running helpers' clocks in their panel; quiet when none runs.
    $.clock.every(1000, () => {
      void (async () => {
        if (!(await read($, helpers)).some((a) => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, helpersNow, () => at)
      })()
    })
    await $.command.register({ name: 'easyclaude-panels', description: 'Open the easyClaude control panel' })
    await update($, usage, () => ({ costUsd: null, contextTokens: null, contextWindow: null, contextPercent: null }))
    // A resumed or reloaded session starts with no request in progress.
    await update($, request, () => null)
    await openControls($)
    return next(e)
  })

  on('command.run', { command: 'easyclaude-panels' }, async ($) => {
    await openControls($)
    return { text: 'easyClaude control panel opened.' }
  })

  // Nothing here is awaited before the request goes on: awaiting the figures held every
  // request back by about a second, and the state write alone by 0.4s. No response has
  // arrived yet, so the cost read a moment later is still the starting cost. The /clear
  // reminder reads files only on the one message it holds.
  on('prompt.submit', async ($, e, next) => {
    const text = typeof e.text === 'string' ? e.text : ''
    // Only a person's own message is held: a helper's report or a scheduled prompt cannot be
    // sent again. A test's submission carries no origin.
    const fromPerson = !e.origin || e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    const history = clearHistory(text, fromPerson)
    if (history !== null) {
      const { plan, cheap } = await planAndCheap($)
      // Cheap mode holds a long conversation itself, more strictly: prompt-check.mjs.
      if (!cheap) {
        clearHeld()
        return { drop: holdText(history, plan, text) }
      }
    }
    // A background task's report is Claude carrying on with the request, not a new one: as a
    // new request, the bar and the progress panel took "<task-notification>..." as its title.
    void inOrder(() => (continuesRequest(e.origin, text) ? resumeRequest($) : startRequest($, text)))
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
    // A helper's turn: the helpers panel marks it done or failed.
    if (e.agentId !== undefined) {
      const at = await $.clock.now()
      await update($, helpers, (list) => helperEnded(list, e, at))
      await update($, helpersNow, () => at)
    }
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await inOrder(() => endRequest($))
    return result
  })

  // --- the control panel --------------------------------------------------------------
  on('ui.render', { component: 'Pane', requestId: CONTROLS }, async ($, e) => {
    const table: any = $.ui.resolve(e)
    const { Box, Text, Button, Select } = table
    const s = await readSettings($)
    const u = await read($, usage)
    const help = await read($, controlsHelp)
    const width = paneWidth(e)
    // A setting's row: its name on the left, its control on the right. With the explanations
    // on, what it does goes under the name.
    const row = (key: string, name: string, note: string | null, control: any) => (
      <Box key={key} justifyContent="space-between" alignItems="center" gap={1}>
        <Box flexDirection="column" flexShrink={1}>
          <Text>{name}</Text>
          {note && <Text color="subtle" wrap="wrap">{note}</Text>}
        </Box>
        {control}
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
    // Short, the buttons sit side by side and wrap. With the explanations on, each button has
    // what it does beside it, or under it in a narrow pane, so the line is never cut short.
    const wide = width >= 56
    type Action = { key: string; label: string; note: string; onPress: () => void; primary?: boolean }
    const group = (actions: Action[]) => help
      ? (
        <Box flexDirection="column" gap={wide ? 0 : 1}>
          {actions.map((a) => (
            <Box key={`${a.key}-row`} flexDirection={wide ? 'row' : 'column'} alignItems={wide ? 'center' : 'flex-start'} gap={wide ? 1 : 0}>
              <Box width={wide ? ACTION_COLUMNS : undefined} flexShrink={0}>
                <Button key={a.key} label={a.label} variant={a.primary ? 'primary' : 'secondary'} onPress={a.onPress} />
              </Box>
              <Box flexShrink={1}>
                <Text color="subtle" wrap="wrap">{a.note}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )
      : (
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {actions.map((a) => <Button key={a.key} label={a.label} variant={a.primary ? 'primary' : 'secondary'} onPress={a.onPress} />)}
        </Box>
      )
    const level = !s.git
      ? <Button key="create-repo" label="Turn on versions" onPress={() => createRepo($)} />
      : Select
        ? <Select key="autoship" options={LEVEL_OPTIONS} value={s.autoship} onSelect={(v: string) => run($, 'easyclaude:autoship', v)} />
        : <Box gap={1}>{LEVELS.map((l) => (
            <Button key={`autoship-${l}`} label={LEVEL_LABELS[l] ?? l} variant={l === s.autoship ? 'primary' : 'secondary'} onPress={() => run($, 'easyclaude:autoship', l)} />
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
        {group([
          { key: 'continue', label: 'Build next step', primary: s.setUp, onPress: () => say($, 'keep going'),
            note: s.setUp ? 'Builds the next task in your plan' : 'Carries on with what Claude was doing' },
          { key: 'ship', label: 'Save a version', note: SAVE_NOTE(s.autoship, s.git), onPress: () => say($, 'ship it') },
          { key: 'undo', label: 'Undo last change', note: 'Shows what it would undo, then asks you',
            onPress: () => say($, 'I want to undo the last change. Tell me what you would restore before you change anything.') },
        ])}
        <Box flexDirection="column" gap={help ? 1 : 0}>
          {/* With no git, the row says so even when short: the button alone does not say why. */}
          {row('autoship-row', AUTOSHIP_NAME, !s.git ? NO_GIT_NOTE : help ? AUTOSHIP_HELP : null, level)}
          {help && !s.git && <Text color="subtle" wrap="wrap">{NO_GIT_HELP}</Text>}
          {row('cheap-row', 'Cheap mode', help ? `${CHEAP_NOTE}. ${CHEAP_HELP}` : null, toggle(s.cheap, 'cheap-on', 'cheap-off',
            () => run($, 'easyclaude:cheap-session'), () => run($, 'easyclaude:full')))}
          {row('plain-row', 'Plain answers', help ? `${PLAIN_NOTE}. ${PLAIN_HELP}` : null, toggle(s.plain, 'plain', 'plain',
            () => run($, 'easyclaude:plain', 'on'), () => run($, 'easyclaude:plain', 'off')))}
        </Box>
        {group([
          { key: 'filetree', label: 'Project files', note: 'A list of your files beside the chat. Changes nothing', onPress: () => run($, 'filetree') },
          { key: 'helpers', label: 'Progress', note: 'Each step of your request, what Claude did, and its helpers. Changes nothing',
            onPress: () => run($, 'easyclaude-helpers') },
          { key: 'security', label: 'Check security', note: 'Looks for leaked passwords and keys. Changes nothing',
            onPress: () => run($, 'easyclaude:security-check') },
          { key: 'skills', label: 'Find skills', note: 'Suggests add-ons. Installs only the ones you pick', onPress: () => run($, 'easyclaude:skills') },
          { key: 'connect', label: 'Connect services', note: 'Advanced: links outside services with an API key',
            onPress: () => run($, 'easyclaude:connect') },
        ])}
        <Text color="promptBorder" wrap="truncate">{RULE}</Text>
        <Box justifyContent="space-between" alignItems="center" gap={1}>
          <Text color="subtle" wrap="truncate">Session {money(u.costUsd)} · {tokens(u.contextTokens)} of {tokens(u.contextWindow)}</Text>
          <Button key="controls-help" plain label={help ? 'Hide explanations' : 'What do these do?'}
            onPress={() => update($, controlsHelp, (shown) => !shown)} />
        </Box>
      </Box>
    )
  })
}
