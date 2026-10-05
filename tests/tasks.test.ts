import { expect, test } from 'claude-code/testing'

import type { PlanTask, TurnRecord } from '../types'
import { agentRows, estimate, newlyDone, planStats, summary, syncTodos, window } from '../hooks/plan'
import { bar, powerline } from '../hooks/theme'

const MIN = 60000
const task = (id: string, over: Partial<PlanTask>): PlanTask => ({ id, subject: id, status: 'pending', createdAt: 0, ...over })

test('no estimate until one task finishes', async () => {
  const list = [task('a', { status: 'in_progress', startedAt: 0 }), task('b', {})]
  expect(summary(list, 5 * MIN)).toBe('Plan 0/2 · ETA after first task')
})

test('averages finished tasks and subtracts running time', async () => {
  const list = [
    task('a', { status: 'completed', startedAt: 0, doneAt: 10 * MIN }),
    task('b', { status: 'completed', startedAt: 10 * MIN, doneAt: 30 * MIN }),
    task('c', { status: 'in_progress', startedAt: 30 * MIN }),
    task('d', {}),
  ]
  // avg 15m, 2 left = 30m, c running 5m -> 25m
  expect(estimate(list, 35 * MIN).msLeft).toBe(25 * MIN)
  expect(summary(list, 35 * MIN)).toBe('Plan 2/4 · ~25m left')
})

test('task completed without in_progress counts from previous finish', async () => {
  const list = [
    task('a', { status: 'completed', startedAt: 0, doneAt: 10 * MIN }),
    task('b', { status: 'completed', doneAt: 30 * MIN }),
    task('c', {}),
  ]
  expect(estimate(list, 30 * MIN).msLeft).toBe(15 * MIN)
})

test('TodoWrite sync keeps timestamps of known todos', async () => {
  const old = [task('a', { status: 'in_progress', startedAt: 5 })]
  const next = syncTodos(old, [{ content: 'a', status: 'completed' }, { content: 'b', status: 'pending' }], 20)
  expect(next[0]).toMatchObject({ startedAt: 5, doneAt: 20, status: 'completed' })
  expect(next[1]).toMatchObject({ id: 'b', createdAt: 20, status: 'pending' })
})

test('all done shows total time', async () => {
  const list = [task('a', { status: 'completed', startedAt: 0, doneAt: 90 * MIN })]
  expect(summary(list, 90 * MIN)).toBe('Plan 1/1 done in 1h 30m')
})

test('window keeps one finished task and the running one in view', async () => {
  const list = Array.from({ length: 12 }, (_, i) =>
    task(String(i), { status: i < 6 ? 'completed' : i === 6 ? 'in_progress' : 'pending' }),
  )
  const w = window(list, 4)
  expect(w.start).toBe(5)
  expect(w.shown.map(t => t.id)).toEqual(['5', '6', '7', '8'])
  expect(w.after).toBe(3)
  expect(window(list.slice(0, 3), 4)).toMatchObject({ start: 0, after: 0 })
})

test('past plans give an estimate before the first task finishes', async () => {
  const list = [task('a', { status: 'in_progress', startedAt: 0 }), task('b', {}), task('c', {})]
  // median of history = 10m; 3 left = 30m, minus 4m already running
  expect(estimate(list, 4 * MIN, [8 * MIN, 10 * MIN, 60 * MIN]).msLeft).toBe(26 * MIN)
  expect(summary(list, 4 * MIN, [10 * MIN])).toBe('Plan 0/3 · ~26m left (from past plans)')
})

test("this plan's pace outweighs history after a few tasks", async () => {
  const list = [
    task('a', { status: 'completed', startedAt: 0, doneAt: 20 * MIN }),
    task('b', { status: 'completed', startedAt: 20 * MIN, doneAt: 40 * MIN }),
    task('c', {}),
  ]
  // (20 + 20 + 2 * 5) / 4 = 12.5m for the one task left
  expect(estimate(list, 40 * MIN, [5 * MIN]).msLeft).toBe(12.5 * MIN)
})

test('newlyDone returns only tasks that just finished', async () => {
  const before = [task('a', { status: 'completed', startedAt: 0, doneAt: 5 }), task('b', { status: 'in_progress', startedAt: 5 })]
  const after = [before[0]!, { ...before[1]!, status: 'completed' as const, doneAt: 25 }]
  expect(newlyDone(before, after)).toEqual([20])
})

test('powerline chains segments with caps and coloured separators', async () => {
  const runs = powerline([{ bg: '#111', parts: [{ text: 'a', color: '#fff' }] }, { bg: '#222', parts: [{ text: 'b', color: '#eee' }] }], true)
  expect(runs).toEqual([
    { text: '', color: '#111' },
    { text: 'a', color: '#fff', backgroundColor: '#111' },
    { text: '', color: '#111', backgroundColor: '#222' },
    { text: 'b', color: '#eee', backgroundColor: '#222' },
    { text: '', color: '#222' },
  ])
  expect(powerline([{ bg: '#111', parts: [{ text: 'a', color: '#fff' }] }], false)).toEqual([{ text: 'a', color: '#fff', backgroundColor: '#111' }])
})

test('bar has half-cell precision and is never empty once started', async () => {
  expect(bar(0.5)).toEqual({ filled: '━━━━━━', track: '──────' })
  expect(bar(1 / 9).filled).toBe('━╸')
  expect(bar(0.01).filled).toBe('╸')
  expect(bar(0)).toEqual({ filled: '', track: '────────────' })
})

test('agentRows derives status, end time and tokens from turn records', async () => {
  const agents = [
    { id: 'a', description: 'd', type: 'Explore', startedAt: 0 },
    { id: 'b', description: 'd', type: 'general-purpose', startedAt: 0 },
    { id: 'c', description: 'd', type: 'Plan', startedAt: 0 },
  ]
  const turns: TurnRecord[] = [
    { turnId: '1', agentId: 'a', startedAt: 0, durationMs: 5000, steps: [], usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } },
    { turnId: '2', agentId: 'b', startedAt: 0, durationMs: 7000, steps: [], aborted: true as const },
  ]
  expect(agentRows(agents, turns)).toEqual([
    { ...agents[0], status: 'done', endedAt: 5000, tokens: 10 },
    { ...agents[1], status: 'stopped', endedAt: 7000, tokens: 0 },
    { ...agents[2], status: 'running' },
  ])
})

test('an agent marked finished stays finished after its turns are trimmed', async () => {
  const agents = [{ id: 'a', description: 'd', type: 'Explore', startedAt: 0, endedAt: 9000, tokens: 50, stopped: false }]
  expect(agentRows(agents, [])).toEqual([{ ...agents[0], status: 'done', endedAt: 9000, tokens: 50 }])
})

test('a finished plan keeps its total time instead of counting on', async () => {
  const list = [
    task('a', { status: 'completed', startedAt: 0, doneAt: 10 * MIN }),
    task('b', { status: 'completed', startedAt: 10 * MIN, doneAt: 20 * MIN }),
  ]
  expect(summary(list, 20 * MIN)).toBe('Plan 2/2 done in 20m')
  expect(summary(list, 50 * MIN)).toBe('Plan 2/2 done in 20m')
})

test('planStats counts tasks and sub-items and finds the fastest and longest task', async () => {
  const t = (id: string, startedAt: number, doneAt: number, parent?: string): PlanTask => ({
    id, subject: id, status: 'completed', createdAt: 0, startedAt, doneAt, ...(parent ? { parent } : {}),
  })
  const stats = planStats([t('a', 0, 60_000), t('a1', 0, 1000, 'a'), t('b', 60_000, 600_000), t('c', 600_000, 660_000)])
  expect(stats).toEqual({ tasks: 3, subs: 1, ms: 660_000, fastest: 60_000, longest: 540_000 })
})
