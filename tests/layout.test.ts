import { expect, test } from 'claude-code/testing'

import type { PlanTask } from '../types'
import { dockRows, fitBand } from '../hooks/layout'
import type { BandAsk, BandFit } from '../hooks/layout'
import { finishedAt, topLevel, windowLines } from '../hooks/plan'

const ask: BandAsk = { maxRows: 30, dock: 'live', header: true, focus: true, shell: 0, plan: 6, tails: 0, usage: 0, expanded: false }
const rows = (a: BandAsk, f: BandFit) =>
  dockRows(f) + (f.margin ? 1 : 0) + (f.header ? 1 : 0) + (f.focus ? 1 : 0) + f.shell + f.plan + (f.tails ? a.tails : 0) + (f.usage ? a.usage : 0)

test('a roomy band keeps the full dock and every plan row', async () => {
  expect(fitBand(ask)).toEqual({ dock: 'full', scene: 6, calls: true, margin: true, header: true, focus: true, shell: 0, plan: 6, tails: false, usage: false })
})

test('a tight band keeps the dock line, the plan header and task, then the crab, before more plan rows', async () => {
  expect(fitBand({ ...ask, maxRows: 9 })).toMatchObject({ dock: 'full', scene: 4, calls: true, header: true, focus: true, plan: 0 })
  expect(fitBand({ ...ask, maxRows: 12 })).toMatchObject({ dock: 'full', scene: 4, calls: true, margin: true, plan: 2 })
  // Five rows: dock line, header, task, calls line; no room for the crab.
  expect(fitBand({ ...ask, maxRows: 5 })).toMatchObject({ dock: 'compact', header: true, focus: true, plan: 0, scene: 0 })
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

test('show all asks for every plan row and may scroll; the crab keeps its shortest scene', async () => {
  const f = fitBand({ ...ask, maxRows: 20, plan: 14, expanded: true })
  expect(f.plan).toBe(14)
  expect([f.dock, f.scene]).toEqual(['full', 4])
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

test('a squeezed dock shrinks its scene to four rows before dropping it, so the crab still runs', async () => {
  const none = { ...ask, header: false, focus: false, plan: 0 }
  // Claude Code's task list left seven rows: status line, a four-row scene, calls line.
  expect(fitBand({ ...none, maxRows: 7 })).toMatchObject({ dock: 'full', scene: 4, calls: true })
  expect(fitBand({ ...none, maxRows: 9 })).toMatchObject({ dock: 'full', scene: 6, calls: true })
  // Six rows, as in the live band: the crab before the calls line.
  expect(fitBand({ ...none, maxRows: 6 })).toMatchObject({ dock: 'full', scene: 4, calls: false })
  expect(fitBand({ ...none, maxRows: 5 })).toMatchObject({ dock: 'compact', scene: 0, calls: true })
  // A usage line does not take the crab's rows.
  expect(fitBand({ ...none, maxRows: 6, usage: 1 })).toMatchObject({ scene: 4, usage: false, margin: false })
  for (let maxRows = 2; maxRows <= 12; maxRows++) expect(rows({ ...none, maxRows }, fitBand({ ...none, maxRows }))).toBeLessThanOrEqual(maxRows)
})
