// Run with `claude plugin test plugins/blast-radius`. These cover what easyClaude changed
// (PROVENANCE.md): PowerShell commands, measuring through $.fs on a Windows path, and no
// hold when nobody is at the screen.
import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// A Windows project: C:/p holds dist/ with two files and a folder of one.
const windows = (on: On, ran: string[]) => {
  const dirs: Record<string, { name: string; kind: 'file' | 'dir'; size: number }[]> = {
    'C:/p/dist': [{ name: 'app.js', kind: 'file', size: 2048 }, { name: 'img', kind: 'dir', size: 0 }, { name: 'index.html', kind: 'file', size: 1024 }],
    'C:/p/dist/img': [{ name: 'logo.png', kind: 'file', size: 4096 }],
  }
  mock.clock(on, { now: 1_000_000 })
  const norm = (p: string) => p.replace(/\\/g, '/')
  on('session.cwd', async () => ({ value: 'C:/p' }) as any)
  on('env.get', async (_$, e: any) => ({ value: e.name === 'OS' ? 'Windows_NT' : e.name === 'USERPROFILE' ? 'C:/Users/me' : undefined }) as any)
  on('fs.stat', async (_$, e: any) => {
    const p = norm(e.path)
    if (p in dirs) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: p } } as any
    throw new Error(`not found: ${p}`)
  })
  on('fs.list', async (_$, e: any) => ({ value: (dirs[norm(e.path)] ?? []).map((d) => ({ ...d, mtimeMs: 0, isLink: false })) }) as any)
  on('process.run', async (_$, e: any) => {
    ran.push(e.argv.join(' '))
    // A real wait, as the hold's pause is: an instant one would never let the test act.
    await new Promise((resolve) => setTimeout(resolve, 5))
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as any
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  on('ui.close', async () => ({ value: undefined }) as any)
  on('tool.call', async () => ({ result: 'removed' }) as any)
}

const pane = {
  component: 'Pane' as const,
  requestId: 'blast-radius',
  props: { title: 'Blast Radius', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 20 }, view: {} } as any,
}

test('a PowerShell Remove-Item -Recurse is held, measured on a Windows path, and runs on Proceed', async ($, on) => {
  const ran: string[] = []
  windows(on, ran)
  const call = $.tool.call({ tool: 'PowerShell', command: 'Remove-Item -Recurse -Force .\\dist' } as any)
  // The pane is drawn once the measure is done; until then the hold has nothing to show.
  let ui: any
  let why = ''
  for (let i = 0; i < 200 && !ui; i++) {
    try {
      const mounted = await $.ui.mount({ plugin: 'blast-radius', surface: 'terminal', ...pane })
      if (await mounted.find({ key: 'proceed' })) ui = mounted
      else await mounted.unmount()
    } catch (err) { why = String(err) /* not drawn yet */ }
  }
  if (!ui) throw new Error(`the pane with Proceed never drew: ${why}`)
  expect(await ui.find({ type: 'Text', text: /delete 3 files \(about 7\.0 KB\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /dist\/img\/logo\.png/ })).toBeDefined()
  await ui.press({ key: 'proceed' })
  await ui.unmount()
  const result: any = await call
  expect(result.deny).toBeUndefined()
  // Nothing ran bash or sleep: neither works on Windows.
  expect(ran.some((r) => /^(bash|sleep)\b/.test(r))).toBe(false)
})

test('a plain Remove-Item of one file is not held', async ($, on) => {
  const ran: string[] = []
  windows(on, ran)
  const plain: any = await $.tool.call({ tool: 'PowerShell', command: 'Remove-Item notes.txt' } as any)
  expect(plain.deny).toBeUndefined()
  expect(ran.length).toBe(0)
})

test('nothing is held when nobody is at the screen', async ($, on) => {
  const ran: string[] = []
  windows(on, ran)
  on('session.start', async (_$, e: any) => ({ cwd: e.cwd }) as any)
  await $.session.start({ cwd: 'C:/p', surface: null, isInteractive: false })
  const result: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf dist' } as any)
  expect(result.deny).toBeUndefined()
  expect(ran.length).toBe(0)
})
