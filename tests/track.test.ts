import { expect, test } from 'claude-code/testing'

import type { CallTiming } from '../types'
import { addCall, closeTurn, endCall, totalTokens } from '../hooks/timing'

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
    { tool: 'Read', ms: 500 },
    { tool: 'Bash', ms: 3000 },
  ])
})

test('closeTurn on a turn with no calls has empty steps', async () => {
  expect(closeTurn({}, { turnId: 't', durationMs: 900, endedAt: 1000 }).steps).toEqual([])
})

test('closeTurn ignores calls from before the turn', async () => {
  const calls = { old: call('Read', 0, 50), now: call('Bash', 600, 700) }
  expect(closeTurn(calls, { turnId: 't', durationMs: 500, endedAt: 1000 }).steps).toEqual([{ tool: 'Bash', ms: 100 }])
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
// tool-row durations (Task 3), the spinner (Task 4) and the receipt (Task 5). The test kit has no
// $.state, and the plugin's module instance is not the test's, so neither can be read directly.
