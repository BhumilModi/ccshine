import { expect, test } from 'claude-code/testing'

import type { CallTiming, Job, PlanAgent, TurnSpan } from '../types'
import { callDetail, pickTurn, railBudget, railRows, railSummary, sectionCap, showBars, turnOfCall } from '../hooks/rail'
import { gauge, span } from '../hooks/theme'

const SPAN: TurnSpan = { turnId: 't1', startedAt: 1000, endedAt: 11000, ctxStart: 38, ctxEnd: 52, costStart: 1, costEnd: 1.31 }

test('span draws heavy line on track with half cells', async () => {
  expect(span(0, 0.5, 4)).toEqual({ before: '', filled: '━━', after: '──' })
  expect(span(0.125, 0.5, 4).filled).toBe('╺━')
  expect(span(0, 0.375, 4)).toEqual({ before: '', filled: '━╸', after: '──' })
  expect(span(0.5, 0.5, 4)).toEqual({ before: '──', filled: '╸', after: '─' })
  expect(span(0, 1, 3)).toEqual({ before: '', filled: '━━━', after: '' })
})

test('railRows keeps main-thread calls of the turn sorted by start', async () => {
  const calls: Record<string, CallTiming> = {
    late: { tool: 'Bash', startedAt: 5000, endedAt: 9000, target: 'npm test' },
    early: { tool: 'Read', startedAt: 1000, endedAt: 1400, target: 'a.ts' },
    before: { tool: 'Read', startedAt: 10, endedAt: 20 },
    sub: { tool: 'Grep', startedAt: 2000, endedAt: 2100, agentId: 'ag' },
  }
  const rows = railRows(calls, [], [], SPAN, 20000)
  expect(rows.map(r => r.id)).toEqual(['early', 'late'])
  expect(rows[0]).toMatchObject({ tool: 'Read', target: 'a.ts', from: 0, to: 0.04, kind: 'tool', running: false, ms: 400 })
})

test('agent row counts its child calls', async () => {
  const calls: Record<string, CallTiming> = {
    a1: { tool: 'Agent', startedAt: 2000, endedAt: 8000, target: 'Explore' },
    c1: { tool: 'Grep', startedAt: 2100, endedAt: 2200, agentId: 'ag' },
    c2: { tool: 'Read', startedAt: 2300, endedAt: 2400, agentId: 'ag' },
    c3: { tool: 'Read', startedAt: 2500, endedAt: 2600, agentId: 'ag' },
  }
  const agents: PlanAgent[] = [{ id: 'ag', description: 'Explore', type: 'Explore', startedAt: 2000, callId: 'a1' }]
  const [row] = railRows(calls, agents, [], SPAN, 20000)
  expect(row).toMatchObject({ kind: 'agent', children: 3 })
})

test('background job past turn end is over', async () => {
  const calls: Record<string, CallTiming> = { b1: { tool: 'Bash', startedAt: 3000, endedAt: 3100, target: 'npm run dev' } }
  const jobs: Job[] = [{ id: 'j1', callId: 'b1', startedAt: 3000, status: 'running' }]
  const [row] = railRows(calls, [], jobs, SPAN, 20000)
  expect(row).toMatchObject({ kind: 'job', over: true, running: true, to: 1, ms: 17000 })
})

test('running call in a live turn grows to now', async () => {
  const live: TurnSpan = { turnId: 't2', startedAt: 0 }
  const [row] = railRows({ b: { tool: 'Bash', startedAt: 2000 } }, [], [], live, 4000)
  expect(row).toMatchObject({ running: true, from: 0.5, to: 1, over: false, ms: 2000 })
})

test('call left open after its turn ended stops at the turn end', async () => {
  const [row] = railRows({ b: { tool: 'Bash', startedAt: 6000 } }, [], [], SPAN, 99000)
  expect(row).toMatchObject({ running: false, to: 1, ms: 5000 })
})

test('railSummary folds files and repeated failures', async () => {
  const calls: Record<string, CallTiming> = {
    e1: { tool: 'Edit', startedAt: 1000, endedAt: 1100, target: 'auth.ts', added: 2, removed: 1 },
    e2: { tool: 'Edit', startedAt: 1200, endedAt: 1300, target: 'auth.ts', added: 10, removed: 2 },
    t1: { tool: 'Bash', startedAt: 2000, endedAt: 3000, target: 'npm test', failed: true },
    t2: { tool: 'Bash', startedAt: 4000, endedAt: 5000, target: 'npm test', failed: true },
  }
  const rows = railRows(calls, [], [], SPAN, 20000)
  const sum = railSummary(rows, SPAN, 20000)
  expect(sum.files).toEqual([{ path: 'auth.ts', added: 12, removed: 3 }])
  expect(sum.failures).toEqual([{ label: 'Bash npm test', times: 2 }])
  expect(sum).toMatchObject({ ms: 10000, tools: 4, agents: 0, ctx: [38, 52] })
  expect(Math.round((sum.cost ?? 0) * 100)).toBe(31)
})

test('turnOfCall finds the span a call started in', async () => {
  const spans: TurnSpan[] = [SPAN, { turnId: 't2', startedAt: 12000 }]
  expect(turnOfCall(spans, 5000)?.turnId).toBe('t1')
  expect(turnOfCall(spans, 15000)?.turnId).toBe('t2')
  expect(turnOfCall(spans, 500)).toBeUndefined()
})

test('showBars needs 40 columns', async () => {
  expect(showBars(39)).toBe(false)
  expect(showBars(40)).toBe(true)
})

const T1: TurnSpan = { turnId: 't1', startedAt: 0, endedAt: 10 }
const T2: TurnSpan = { turnId: 't2', startedAt: 20, endedAt: 30 }
const LIVE: TurnSpan = { turnId: 't3', startedAt: 40 }

test('pickTurn: a pinned turn wins', async () => {
  expect(pickTurn([T1, T2, LIVE], { turnId: 't1', pinned: true }, { t3: true })?.turnId).toBe('t1')
})

test('pickTurn: the live turn while its anchor is on screen or not drawn yet', async () => {
  expect(pickTurn([T1, LIVE], { pinned: false }, { t1: true })?.turnId).toBe('t3')
  expect(pickTurn([T1, LIVE], { pinned: false }, { t1: true, t3: true })?.turnId).toBe('t3')
})

test('pickTurn: otherwise the first turn whose anchor is on screen', async () => {
  expect(pickTurn([T1, T2, LIVE], { pinned: false }, { t1: false, t2: true, t3: false })?.turnId).toBe('t2')
})

test('pickTurn: nothing on screen falls back to the newest turn', async () => {
  expect(pickTurn([T1, T2], { pinned: false }, {})?.turnId).toBe('t2')
  expect(pickTurn([], { pinned: false }, {})).toBeUndefined()
})

test('callDetail: Bash shows the command and its last output lines', async () => {
  const out = callDetail('Bash', { command: 'npm test\n# second line' }, { result: { stdout: 'a\nb\n\nc\nd\n', stderr: '' } })
  expect(out).toEqual(['$ npm test', 'b', 'c', 'd'])
})

test('callDetail: an error shows its first line', async () => {
  expect(callDetail('Bash', { command: 'false' }, { isError: true, text: 'Exit code 1\nmore' })).toEqual(['$ false', 'Exit code 1'])
  expect(callDetail('Read', { file_path: '/x' }, { isError: true, text: 'File not found' })).toEqual(['File not found'])
  expect(callDetail('Read', { file_path: '/x' }, { result: {} })).toEqual([])
})

test('a background agent keeps running past its Agent call until its own end', async () => {
  const calls: Record<string, CallTiming> = { a1: { tool: 'Agent', startedAt: 2000, endedAt: 2100, target: 'Explore' } }
  const agents: PlanAgent[] = [{ id: 'ag', description: 'Explore', type: 'Explore', startedAt: 2000, callId: 'a1' }]
  const live: TurnSpan = { turnId: 't', startedAt: 1000 }
  expect(railRows(calls, agents, [], live, 6000)[0]).toMatchObject({ running: true, to: 1, ms: 4000 })
  expect(railRows(calls, agents, [], SPAN, 20000)[0]).toMatchObject({ running: true, over: true, to: 1, ms: 18000 })
})

test('an agent that finished ends where its own turn ended', async () => {
  const calls: Record<string, CallTiming> = { a1: { tool: 'Agent', startedAt: 2000, endedAt: 2100, target: 'Explore' } }
  const agents: PlanAgent[] = [{ id: 'ag', description: 'Explore', type: 'Explore', startedAt: 2000, callId: 'a1', endedAt: 8000 }]
  expect(railRows(calls, agents, [], SPAN, 20000)[0]).toMatchObject({ running: false, over: false, ms: 6000 })
})

test('gauge splits a meter into what the turn started with and what it added', async () => {
  // 25% → 50% on 4 cells: one cell of base, one of added, two of track.
  expect(gauge(0.25, 0.5, 4)).toEqual({ base: '━', added: '━', track: '──' })
  // The cell holding the start stays base-coloured; the added part takes what follows.
  expect(gauge(0.125, 0.375, 4)).toEqual({ base: '━', added: '╸', track: '──' })
  expect(gauge(0.5, 0.5, 4)).toEqual({ base: '━━', added: '', track: '──' })
})


// Rows the docked rail draws for a budget: brand, title, two margins when kept, the plan section, the axis under
// shown tool rows, then the tool rows or the "no tools" line, and the marker.
const drawn = (a: { tools: number; bars: boolean }, b: ReturnType<typeof railBudget>) =>
  2 + (b.margins ? 2 : 0) + b.section + (a.bars && b.shown > 0 ? 1 : 0) + (a.tools === 0 ? 1 : b.shown + (b.shown < a.tools ? 1 : 0))

test('the docked rail fits its rows for any mix of tools', async () => {
  for (let bodyRows = 7; bodyRows <= 60; bodyRows++) {
    for (const tools of [0, 1, 5, 40]) {
      const a = { bodyRows, tools, bars: true }
      const b = railBudget({ ...a, section: sectionCap(bodyRows, 4, false) })
      expect(drawn(a, b)).toBeLessThanOrEqual(bodyRows)
    }
  }
})

test('every tool row shows when there is room, with no marker', async () => {
  const a = { bodyRows: 40, tools: 6, bars: true }
  const b = railBudget({ ...a, section: 8 })
  expect(b.shown).toBe(6)
  expect(drawn(a, b)).toBe(2 + 2 + 8 + 1 + 6)
})

test('the plan takes up to 60% of the rail, and the tool rows keep the rest', async () => {
  expect(sectionCap(40, 4, false)).toBe(24)
  const b = railBudget({ bodyRows: 40, tools: 30, bars: true, section: 24 })
  // 40 - brand, title, two margins - plan 24 = 12, marker and axis included.
  expect(b.shown).toBe(10)
})

test('show all lifts the section cap', async () => {
  expect(sectionCap(30, 4, true)).toBe(Number.MAX_SAFE_INTEGER)
  expect(sectionCap(8, 4, false)).toBe(3)
})

test('a short rail drops its two margins rather than overflow', async () => {
  const a = { bodyRows: 6, tools: 5, bars: true }
  const b = railBudget({ ...a, section: sectionCap(6, 4, false) })
  expect(b.margins).toBe(false)
  expect(drawn(a, b)).toBeLessThanOrEqual(6)
  expect(railBudget({ ...a, bodyRows: 30, section: sectionCap(30, 4, false) }).margins).toBe(true)
})
