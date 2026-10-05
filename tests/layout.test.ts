import { expect, test } from 'claude-code/testing'

import type { PlanTask } from '../types'
import { DOCK_ROWS, fitBand } from '../hooks/layout'
import type { BandAsk } from '../hooks/layout'
import { finishedAt, topLevel, windowLines } from '../hooks/plan'

const ask: BandAsk = { maxRows: 30, dock: 'live', pinned: 2, plan: 6, shell: 0, tails: 0, usage: 0, expanded: false }
const rows = (a: BandAsk, f: ReturnType<typeof fitBand>) =>
  1 + DOCK_ROWS[f.dock] + a.pinned + a.shell + f.plan + (f.tails ? a.tails : 0) + (f.usage ? a.usage : 0)

test('a roomy band keeps the full dock and every plan row', async () => {
  expect(fitBand(ask)).toEqual({ dock: 'full', plan: 6, tails: false, usage: false })
})

test('a tight band shrinks the dock to its status lines before squeezing the plan', async () => {
  const a = { ...ask, maxRows: 12 }
  const f = fitBand(a)
  expect(f.dock).toBe('compact')
  expect(rows(a, f)).toBeLessThanOrEqual(12)
})

test('usage and output tails give way before the plan drops below two rows', async () => {
  const a = { ...ask, maxRows: 10, shell: 2, tails: 1, usage: 2 }
  const f = fitBand(a)
  expect(f).toEqual({ dock: 'compact', plan: 2, tails: false, usage: false })
  expect(rows(a, f)).toBeLessThanOrEqual(10)
})

test('nothing ever exceeds maxRows while the plan fits', async () => {
  for (let maxRows = 9; maxRows <= 40; maxRows++) {
    for (const dock of ['none', 'idle', 'live'] as const) {
      const a = { ...ask, maxRows, dock, shell: 3, tails: 2, usage: 2, plan: 20 }
      expect(rows(a, fitBand(a))).toBeLessThanOrEqual(maxRows)
    }
  }
})

test('show all asks for every plan row and lets the dock shrink to make room', async () => {
  const f = fitBand({ ...ask, maxRows: 20, plan: 14, expanded: true })
  expect(f.plan).toBe(14)
  expect(f.dock).toBe('compact')
})

const task = (id: string, status: PlanTask['status'], parent?: string, doneAt?: number): PlanTask => ({
  id, subject: id, status, createdAt: 0, ...(parent ? { parent } : {}), ...(doneAt ? { doneAt } : {}),
})

test('topLevel drops sub-items but keeps orphans whose parent is gone', async () => {
  const list = [task('a', 'pending'), task('a1', 'pending', 'a'), task('x1', 'pending', 'gone')]
  expect(topLevel(list).map(t => t.id)).toEqual(['a', 'x1'])
})

test('windowLines fits room exactly, markers included, and keeps the focus in view', async () => {
  const lines = Array.from({ length: 10 }, (_, i) => i)
  expect(windowLines(lines, 0, 20)).toEqual({ start: 0, shown: lines, after: 0 })
  const head = windowLines(lines, 1, 4)
  expect(head).toEqual({ start: 0, shown: [0, 1, 2], after: 7 })
  const mid = windowLines(lines, 5, 4)
  expect(mid).toEqual({ start: 4, shown: [4, 5], after: 4 })
  const tail = windowLines(lines, 9, 4)
  expect(tail).toEqual({ start: 7, shown: [7, 8, 9], after: 0 })
  for (const w of [head, mid, tail]) expect(w.shown.length + (w.start > 0 ? 1 : 0) + (w.after > 0 ? 1 : 0)).toBe(4)
})

test('finishedAt is the last finish of a fully done plan, else undefined', async () => {
  expect(finishedAt([task('a', 'completed', undefined, 5), task('b', 'completed', undefined, 9)])).toBe(9)
  expect(finishedAt([task('a', 'completed', undefined, 5), task('b', 'pending')])).toBeUndefined()
  expect(finishedAt([])).toBeUndefined()
})
