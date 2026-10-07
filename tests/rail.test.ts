import { expect, test } from 'claude-code/testing'

import type { CallTiming, Job, PlanAgent, TurnSpan } from '../types'
import { callDetail, pickTurn, railRows, railSummary, sections, showBars, turnOfCall } from '../hooks/rail'
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


const asks = (timeline: number, plan: number, files: number) => ({ timeline, plan, files })
const allOpen = { timeline: true, plan: true, files: true }

test('sections splits 40 rows in thirds, remainder to plan', async () => {
  expect(sections({ bodyRows: 40, asks: asks(99, 99, 99), open: allOpen, all: false })).toEqual(asks(12, 12, 12))
  expect(sections({ bodyRows: 41, asks: asks(99, 99, 99), open: allOpen, all: false })).toEqual(asks(12, 13, 12))
})

test('a small ask gives its rows away, plan first', async () => {
  expect(sections({ bodyRows: 40, asks: asks(3, 99, 2), open: allOpen, all: false })).toEqual(asks(3, 31, 2))
  expect(sections({ bodyRows: 40, asks: asks(99, 4, 2), open: allOpen, all: false })).toEqual(asks(30, 4, 2))
})

test('folded and collapsed sections give their rows away', async () => {
  expect(sections({ bodyRows: 40, asks: asks(99, 99, 0), open: allOpen, all: false })).toEqual(asks(18, 18, 0))
  expect(sections({ bodyRows: 40, asks: asks(99, 99, 99), open: { ...allOpen, plan: false }, all: false })).toEqual(asks(18, 0, 18))
})

test('show all gives the plan its whole tree', async () => {
  expect(sections({ bodyRows: 40, asks: asks(99, 60, 99), open: allOpen, all: true })).toEqual(asks(12, 60, 12))
})

test('a rail too short for three headers draws no bodies, and no split passes the rail', async () => {
  expect(sections({ bodyRows: 4, asks: asks(9, 9, 9), open: allOpen, all: false })).toEqual(asks(0, 0, 0))
  for (let bodyRows = 1; bodyRows <= 60; bodyRows++) {
    for (const a of [asks(1, 99, 0), asks(40, 3, 7), asks(99, 99, 99), asks(0, 0, 0)]) {
      const s = sections({ bodyRows, asks: a, open: allOpen, all: false })
      expect(Math.max(0, bodyRows - 4)).toBeGreaterThanOrEqual(s.timeline + s.plan + s.files)
    }
  }
})

test('show all with a short plan leaves no rows unused', async () => {
  // Every row is used; what the plan leaves goes to the timeline first, as without show all.
  expect(sections({ bodyRows: 40, asks: asks(99, 2, 99), open: allOpen, all: true })).toEqual(asks(22, 2, 12))
})
