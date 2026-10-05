import { expect, test } from 'claude-code/testing'

import type { PlanTask } from '../types'
import { DOCK_ROWS, fitBand } from '../hooks/layout'
import type { BandAsk, BandFit } from '../hooks/layout'
import { finishedAt, topLevel, windowLines } from '../hooks/plan'

const ask: BandAsk = { maxRows: 30, dock: 'live', header: true, focus: true, shell: 0, plan: 6, tails: 0, usage: 0, expanded: false }
const rows = (a: BandAsk, f: BandFit) =>
  DOCK_ROWS[f.dock] + (f.margin ? 1 : 0) + (f.header ? 1 : 0) + (f.focus ? 1 : 0) + f.shell + f.plan + (f.tails ? a.tails : 0) + (f.usage ? a.usage : 0)

test('a roomy band keeps the full dock and every plan row', async () => {
  expect(fitBand(ask)).toEqual({ dock: 'full', margin: true, header: true, focus: true, shell: 0, plan: 6, tails: false, usage: false })
})

test('a tight band drops the dock picture before the plan, and the plan rows before the dock line', async () => {
  expect(fitBand({ ...ask, maxRows: 9 })).toMatchObject({ dock: 'compact', header: true, focus: true, plan: 3 })
  // Claude Code's own task list leaves five rows: dock line, header, task, blank, calls line.
  expect(fitBand({ ...ask, maxRows: 5 })).toMatchObject({ dock: 'tiny', header: true, focus: true, plan: 0, margin: true })
  expect(fitBand({ ...ask, maxRows: 3 })).toMatchObject({ dock: 'tiny', header: true, focus: false, plan: 0 })
  expect(fitBand({ ...ask, maxRows: 2 })).toMatchObject({ dock: 'tiny', header: false })
})

test('the band never passes maxRows and always keeps the dock line', async () => {
  for (let maxRows = 2; maxRows <= 40; maxRows++) {
    for (const dock of ['none', 'idle', 'live'] as const) {
      const a = { ...ask, maxRows, dock, shell: 4, tails: 2, usage: 2, plan: 20 }
      const f = fitBand(a)
      expect(rows(a, f)).toBeLessThanOrEqual(maxRows)
      expect(f.dock === 'none').toBe(dock === 'none')
    }
  }
})

test('show all asks for every plan row and may scroll', async () => {
  const f = fitBand({ ...ask, maxRows: 20, plan: 30, expanded: true })
  expect(f.plan).toBe(30)
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
  const used = (w: ReturnType<typeof windowLines<number>>) => w.shown.length + (w.before > 0 ? 1 : 0) + (w.after > 0 ? 1 : 0)
  expect(windowLines(lines, 0, 20)).toEqual({ start: 0, shown: lines, before: 0, after: 0 })
  expect(windowLines(lines, 1, 4)).toEqual({ start: 0, shown: [0, 1, 2], before: 0, after: 7 })
  expect(windowLines(lines, 5, 4)).toEqual({ start: 4, shown: [4, 5], before: 4, after: 4 })
  expect(windowLines(lines, 9, 4)).toEqual({ start: 7, shown: [7, 8, 9], before: 7, after: 0 })
  expect(windowLines(lines, 5, 1)).toEqual({ start: 5, shown: [5], before: 0, after: 0 })
  expect(windowLines(lines, 5, 2)).toEqual({ start: 5, shown: [5], before: 0, after: 4 })
  for (let room = 1; room <= 12; room++) {
    for (let focus = 0; focus < 10; focus++) {
      const w = windowLines(lines, focus, room)
      expect(used(w)).toBeLessThanOrEqual(room)
      expect(w.shown).toContain(focus)
    }
  }
})

test('finishedAt is the last finish of a fully done plan, else undefined', async () => {
  expect(finishedAt([task('a', 'completed', undefined, 5), task('b', 'completed', undefined, 9)])).toBe(9)
  expect(finishedAt([task('a', 'completed', undefined, 5), task('b', 'pending')])).toBeUndefined()
  expect(finishedAt([])).toBeUndefined()
})
