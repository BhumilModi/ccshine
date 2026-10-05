import { expect, test } from 'claude-code/testing'

import type { CallTiming, TurnSpan } from '../types'
import { addCall, closeSpan, closeTurn, endCall, openSpan, promptLabel, totalTokens } from '../hooks/timing'

const call = (tool: string, startedAt: number, endedAt?: number, agentId?: string): CallTiming => ({ tool, startedAt, endedAt, agentId })

test('endCall sets endedAt only for the given id', async () => {
  const calls = { a: call('Read', 0), b: call('Bash', 1) }
  const next = endCall(calls, 'a', 5)
  expect(next.a?.endedAt).toBe(5)
  expect(next.b?.endedAt).toBeUndefined()
})

test('closeTurn sums step time per tool in call order', async () => {
  const calls = {
    a: call('Read', 1000, 1200),
    b: call('Bash', 1300, 4300),
    c: call('Read', 4400, 4700),
    other: call('Edit', 1500, 1600, 'agent-1'),
  }
  const turn = closeTurn(calls, { turnId: 't', durationMs: 5000, endedAt: 5000 })
  expect(turn.startedAt).toBe(0)
  expect(turn.steps).toEqual([
    { tool: 'Read', ms: 500, count: 2 },
    { tool: 'Bash', ms: 3000, count: 1 },
  ])
})

test('closeTurn on a turn with no calls has empty steps', async () => {
  expect(closeTurn({}, { turnId: 't', durationMs: 900, endedAt: 1000 }).steps).toEqual([])
})

test('closeTurn ignores calls from before the turn', async () => {
  const calls = { old: call('Read', 0, 50), now: call('Bash', 600, 700) }
  expect(closeTurn(calls, { turnId: 't', durationMs: 500, endedAt: 1000 }).steps).toEqual([{ tool: 'Bash', ms: 100, count: 1 }])
})

test('trim keeps the newest 500 calls', async () => {
  let calls: Record<string, CallTiming> = {}
  for (let i = 0; i < 520; i++) calls = addCall(calls, `c${i}`, call('Read', i))
  expect(Object.keys(calls)).toHaveLength(500)
  expect(calls.c0).toBeUndefined()
  expect(calls.c519).toBeDefined()
})

test('totalTokens adds every kind', async () => {
  expect(totalTokens({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toBe(10)
})

// The tracker's hooks are covered where their output shows: the agent band (turn records and tokens),
// tool-row durations and the spinner. The test kit has no
// $.state, and the plugin's module instance is not the test's, so neither can be read directly.

test('openSpan then closeSpan records context and cost at both ends', async () => {
  const opened = openSpan([], { turnId: 't1', at: 100, ctx: 38, cost: 1 })
  expect(opened).toEqual([{ turnId: 't1', startedAt: 100, ctxStart: 38, costStart: 1 }])
  const closed = closeSpan(opened, { at: 900, ctx: 52, cost: 1.31 })
  expect(closed).toEqual([{ turnId: 't1', startedAt: 100, ctxStart: 38, costStart: 1, endedAt: 900, ctxEnd: 52, costEnd: 1.31 }])
})

test('closeSpan marks an aborted turn and leaves closed spans alone', async () => {
  const spans = [{ turnId: 'old', startedAt: 0, endedAt: 50 }, { turnId: 't', startedAt: 60 }]
  const closed = closeSpan(spans, { at: 70, aborted: true })
  expect(closed[0]).toEqual(spans[0])
  expect(closed[1]).toEqual({ turnId: 't', startedAt: 60, endedAt: 70, aborted: true })
  expect(closeSpan(closed, { at: 80 })).toEqual(closed)
})

test('openSpan keeps the newest 200 spans', async () => {
  let spans: TurnSpan[] = []
  for (let i = 0; i < 210; i++) spans = openSpan(spans, { turnId: String(i), at: i })
  expect(spans.length).toBe(200)
  expect(spans[0]?.turnId).toBe('10')
})

test('endCall can mark a call failed', async () => {
  expect(endCall({ a: call('Bash', 0) }, 'a', 5, true).a).toEqual({ tool: 'Bash', startedAt: 0, endedAt: 5, failed: true })
  expect(endCall({ a: call('Bash', 0) }, 'a', 5).a?.failed).toBeUndefined()
})

test('openSpan keeps the first line of the prompt, shortened', async () => {
  const [span] = openSpan([], { turnId: 't', at: 0, prompt: 'fix the login bug\nand more' })
  expect(span?.prompt).toBe('fix the login bug')
  const [long] = openSpan([], { turnId: 't', at: 0, prompt: 'x'.repeat(200) })
  expect(long?.prompt?.length).toBe(80)
})

test('a turn started by a task notification is labelled by its summaries', async () => {
  const body = (s: string) => `<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n<summary>${s}</summary>\n<result>long text</result>\n</task-notification>`
  expect(promptLabel(body('Agent "Find retry counting" finished'))).toBe('Agent "Find retry counting" finished')
  expect(promptLabel(`${body('Agent "a" finished')}\n${body('Background command "npm test" completed')}`)).toBe('Agent "a" finished · Background command "npm test" completed')
  expect(promptLabel('<task-notification><task-id>x</task-id></task-notification>')).toBe('background task finished')
  expect(promptLabel('fix the <b> tag')).toBe('fix the <b> tag')
})
