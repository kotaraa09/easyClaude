// What the changes under the file tree show: the file against the last save to git (HEAD), as the
// unified-diff hunks the engine's Code element draws. Plain values only: register.tsx runs
// git and reads the file, and hands the text here.

import type { Changes } from '../types'

// The Code element draws at most 100000 characters; leave room for the rest of the panel.
export const DIFF_LIMIT = 90_000

// `git diff` output from the first hunk on: the `diff --git`, `index`, mode and `---`/`+++`
// lines before it are the file's header, which the panel shows in its own words.
export function hunksOf(out: string): string {
  const at = out.search(/^@@ /m)
  return at < 0 ? '' : out.slice(at).replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

// A file git does not know yet is all new: one hunk that adds every line.
export function newFileHunks(text: string): string {
  const body = text.replace(/\r\n/g, '\n').replace(/\n$/, '')
  if (body === '') return ''
  const lines = body.split('\n')
  return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map(l => `+${l}`)].join('\n')
}

// Added and removed lines, counted from the hunks.
export function countLines(hunks: string): [number, number] {
  let added = 0
  let removed = 0
  for (const line of hunks.split('\n')) {
    if (line.startsWith('@@')) continue
    if (line.startsWith('+')) added++
    else if (line.startsWith('-')) removed++
  }
  return [added, removed]
}

// Cut at the last whole hunk that fits: a diff cut mid-hunk does not parse.
export function fitHunks(hunks: string, limit = DIFF_LIMIT): { diff: string; cut: boolean } {
  if (hunks.length <= limit) return { diff: hunks, cut: false }
  const starts = [...hunks.matchAll(/^@@ /gm)].map(m => m.index ?? 0)
  const end = starts.filter(i => i > 0 && i <= limit).pop()
  if (end !== undefined) return { diff: hunks.slice(0, end).replace(/\n+$/, ''), cut: true }
  // One hunk larger than the room: keep its first lines and say how many it has.
  // The header is rewritten to the line counts kept, so the cut hunk still parses.
  const lines = hunks.slice(0, limit).split('\n').slice(1, -1)
  const before = lines.filter(l => !l.startsWith('+')).length
  const after = lines.filter(l => !l.startsWith('-')).length
  const [, a = '1', b = '1'] = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(hunks) ?? []
  return { diff: [`@@ -${a},${before} +${b},${after} @@`, ...lines].join('\n'), cut: true }
}

export function changesOf(path: string, hunks: string, note = ''): Changes {
  const [added, removed] = countLines(hunks)
  const { diff, cut } = fitHunks(hunks)
  const why = note || (hunks === '' ? 'No changes since the last save.' : cut ? 'Only the first changes fit here. Open the file to see the rest.' : '')
  return { path, diff, added, removed, note: why, hunk: 0 }
}

// git's way of saying it cannot show the change as lines.
export function isBinary(out: string): boolean {
  return /^Binary files .* differ$/m.test(out)
}

// The panel shows the changes from one hunk on, and steps through them, so a long diff never
// needs a scroll of its own beside the tree's.
export function hunkCount(diff: string): number {
  return (diff.match(/^@@ /gm) ?? []).length
}

export function fromHunk(diff: string, index: number): string {
  const starts = [...diff.matchAll(/^@@ /gm)].map(m => m.index ?? 0)
  const at = starts[Math.max(0, Math.min(index, starts.length - 1))]
  return at === undefined ? diff : diff.slice(at)
}
