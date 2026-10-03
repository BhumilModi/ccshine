import { expect, test } from 'claude-code/testing'

import type { TurnRecord } from '../types'
import { bySource, cacheLeftMs, lastTurn, wasCold } from '../hooks/usage'

const MIN = 60_000
const turn = (over: Partial<TurnRecord>): TurnRecord => ({ turnId: 't', startedAt: 0, durationMs: 1000, steps: [], ...over })
const u = (cacheRead: number, cacheWrite: number) => ({ input: 100, output: 100, cacheRead, cacheWrite })

test('wasCold false on the first turn', async () => {
  expect(wasCold(turn({ usage: u(0, 40_000) }), undefined)).toBe(false)
})

test('wasCold true for 2k read / 41k write after a turn', async () => {
  expect(wasCold(turn({ usage: u(2000, 41_000) }), turn({ usage: u(50_000, 1000) }))).toBe(true)
  expect(wasCold(turn({ usage: u(45_000, 3000) }), turn({ usage: u(50_000, 1000) }))).toBe(false)
  expect(wasCold(turn({ usage: u(0, 5000) }), turn({ usage: u(50_000, 1000) }))).toBe(false)
})

test('lastTurn picks the newest main-loop turn with usage', async () => {
  const turns = [turn({ turnId: 'a', usage: u(1, 1) }), turn({ turnId: 'b', agentId: 'x', usage: u(1, 1) }), turn({ turnId: 'c' })]
  expect(lastTurn(turns)?.turnId).toBe('a')
})

test('bySource groups agents by type, main first', async () => {
  const turns = [
    turn({ usage: u(1000, 0), startedAt: 10 * MIN }),
    turn({ agentId: 'a1', usage: u(5000, 0), startedAt: 10 * MIN }),
    turn({ agentId: 'a2', usage: u(3000, 0), startedAt: 10 * MIN }),
    turn({ agentId: 'a3', usage: u(9000, 0), startedAt: 10 * MIN }),
    turn({ agentId: 'a1', usage: u(70_000, 0), startedAt: 0 }),
  ]
  const agents = [
    { id: 'a1', description: '', type: 'Explore', startedAt: 0 },
    { id: 'a2', description: '', type: 'Explore', startedAt: 0 },
    { id: 'a3', description: '', type: 'general-purpose', startedAt: 0 },
  ]
  expect(bySource(turns, agents, 5 * MIN)).toEqual([
    { source: 'main', tokens: 1200 },
    { source: 'general-purpose', tokens: 9200 },
    { source: 'Explore', tokens: 8400 },
  ])
})

test('cacheLeftMs clamps at 0', async () => {
  expect(cacheLeftMs(0, 2 * 60 * MIN, '1h')).toBe(0)
})

test('5m ttl counts from the last turn end', async () => {
  expect(cacheLeftMs(10 * MIN, 12 * MIN, '5m')).toBe(3 * MIN)
  expect(cacheLeftMs(10 * MIN, 12 * MIN, '1h')).toBe(58 * MIN)
})
