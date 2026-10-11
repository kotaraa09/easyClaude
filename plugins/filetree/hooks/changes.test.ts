// Run with `claude plugin test plugins/filetree`.
import { describe, expect, test } from 'claude-code/testing'

import { changesOf, countLines, fitHunks, fromHunk, hunkCount, hunksOf, isBinary, newFileHunks } from './changes'

const GIT_DIFF = [
  'diff --git a/src/checkout.js b/src/checkout.js',
  'index 1a2b3c4..5d6e7f8 100644',
  '--- a/src/checkout.js',
  '+++ b/src/checkout.js',
  '@@ -5,4 +5,5 @@ export function amountToPay(cart, discount) {',
  '   const total = cartTotal(cart)',
  '-  const code = discount.code.toUpperCase()',
  '+  const code = discount?.code?.toUpperCase()',
  '+  if (!code) return total',
  '   return total * 0.9',
  '',
].join('\r\n')

describe('the changes panel', () => {
  test('shows the hunks of a git diff, without its header, and counts the lines', () => {
    const hunks = hunksOf(GIT_DIFF)
    expect(hunks.startsWith('@@ -5,4 +5,5 @@')).toBe(true)
    expect(hunks).not.toContain('\r')
    expect(hunks).not.toContain('+++ b/')
    expect(countLines(hunks)).toEqual([2, 1])
    const c = changesOf('/p/src/checkout.js', hunks)
    expect([c.added, c.removed, c.note]).toEqual([2, 1, ''])
  })

  test('a file git does not know yet is one hunk of new lines', () => {
    expect(newFileHunks('a\r\nb\n')).toBe('@@ -0,0 +1,2 @@\n+a\n+b')
    expect(newFileHunks('')).toBe('')
  })

  test('no change, or a binary file, says so instead of drawing nothing', () => {
    expect(changesOf('/p/a.js', '').note).toBe('No changes since the last save.')
    expect(isBinary('diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n')).toBe(true)
    expect(isBinary(GIT_DIFF)).toBe(false)
  })

  test('a diff too long for the panel is cut between hunks, and a single long hunk still parses', () => {
    const hunk = (n: number) => [`@@ -${n},1 +${n},1 @@`, `-old ${n}`, `+new ${n}`].join('\n')
    const many = Array.from({ length: 50 }, (_, i) => hunk(i * 10 + 1)).join('\n')
    const cut = fitHunks(many, 200)
    expect(cut.cut).toBe(true)
    expect(cut.diff.length).toBeLessThanOrEqual(200)
    expect(cut.diff.endsWith('\n')).toBe(false)
    expect(cut.diff.split('\n').length % 3).toBe(0)

    const long = ['@@ -1,40 +1,40 @@', ...Array.from({ length: 40 }, (_, i) => (i % 2 ? `+line ${i}` : ` line ${i}`))].join('\n')
    const one = fitHunks(long, 120)
    const lines = one.diff.split('\n').slice(1)
    const before = lines.filter(l => !l.startsWith('+')).length
    const after = lines.filter(l => !l.startsWith('-')).length
    expect(one.diff.split('\n')[0]).toBe(`@@ -1,${before} +1,${after} @@`)
    expect(changesOf('/p/a.js', long.repeat(3000)).note).toMatch(/Only the first changes fit/)
  })

  test('the view steps from hunk to hunk, and never past the last one', () => {
    const diff = ['@@ -1,1 +1,1 @@', '-a', '+b', '@@ -9,1 +9,1 @@', '-c', '+d'].join('\n')
    expect(hunkCount(diff)).toBe(2)
    expect(fromHunk(diff, 0)).toBe(diff)
    expect(fromHunk(diff, 1).startsWith('@@ -9,1')).toBe(true)
    expect(fromHunk(diff, 7).startsWith('@@ -9,1')).toBe(true)
    expect(changesOf('/p/a.js', diff).hunk).toBe(0)
  })
})
