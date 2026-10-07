import { expect, mock, test } from 'claude-code/testing'

import type { Hunk } from '../types'
import { cutPatch, editPatch } from '../hooks/files'

const hunk = (n: number, at = 1): Hunk => ({ oldStart: at, oldLines: n, newStart: at, newLines: n, lines: Array.from({ length: n }, (_, i) => ` line ${i}`) })

test('cutPatch keeps 400 lines and counts the rest', async () => {
  const { patch, cut } = cutPatch([hunk(150), hunk(150, 200), hunk(150, 400)])
  expect(patch.reduce((n, h) => n + h.lines.length, 0)).toBe(400)
  expect(cut).toBe(50)
  expect(cutPatch([hunk(3)])).toEqual({ patch: [hunk(3)], cut: 0 })
})

test('editPatch reads an Edit result\'s structuredPatch', async () => {
  const h = hunk(4, 40)
  expect(editPatch('Edit', { file_path: '/r/a.ts' }, { structuredPatch: [h] })).toEqual([h])
  expect(editPatch('Edit', {}, undefined)).toEqual([])
})

test('a Write that created a file is one all-added hunk', async () => {
  expect(editPatch('Write', { content: 'a\nb\n' }, { type: 'create', structuredPatch: [] })).toEqual([
    { oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+a', '+b'] },
  ])
})

test('tracker keeps the patch on the call', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  const written: Record<string, any> = {}
  on('state.set', async (_$, e: any, next) => {
    if (e.plugin === 'tidepool') written[e.key] = e.value
    return next(e)
  })
  const h = hunk(2, 10)
  on('tool.call', { tool: 'Edit' }, async () => ({ result: { filePath: '/repo/a.ts', structuredPatch: [h] } as never }))
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/a.ts', old_string: 'x', new_string: 'y' })
  expect(written.calls.e1).toMatchObject({ file: '/repo/a.ts', patch: [h] })
  expect(written.calls.e1.patchCut).toBeUndefined()
})
