import { expect, test } from 'claude-code/testing'

import { cacheRate, fmtTurn, legend, timeline } from '../hooks/receipt'

const steps = [
  { tool: 'Read', ms: 4000, count: 6 },
  { tool: 'Bash', ms: 31_000, count: 1 },
]

test('timeline cells sum to width', async () => {
  for (const width of [8, 24, 37]) expect(timeline(steps, 63_000, width)).toHaveLength(width)
})

test('thinking fills the gap not covered by tools', async () => {
  const cells = timeline(steps, 63_000, 63)
  expect(cells.filter(c => c.tool === 'thinking')).toHaveLength(28)
  expect(cells.filter(c => c.tool === 'Bash')).toHaveLength(31)
  expect(cells[0]?.char).toBe('▇')
})

test('turn with no steps is all thinking', async () => {
  expect(new Set(timeline([], 5000, 24).map(c => c.tool))).toEqual(new Set(['thinking']))
})

test('a short step still gets one cell', async () => {
  const cells = timeline([{ tool: 'Grep', ms: 10, count: 1 }], 60_000, 24)
  expect(cells.filter(c => c.tool === 'Grep')).toHaveLength(1)
})

test('legend orders by time and groups Read ×6', async () => {
  expect(legend(steps, 63_000)).toBe('Bash 31s · thinking 28s · Read ×6 4s')
})

test('cacheRate 0 when all fields 0', async () => {
  expect(cacheRate({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(0)
  expect(cacheRate({ input: 1000, output: 5, cacheRead: 91_000, cacheWrite: 8000 })).toBe(0.91)
})

test('fmtTurn', async () => {
  expect(fmtTurn(9911)).toBe('9.9s')
  expect(fmtTurn(63_000)).toBe('1m 03s')
  expect(fmtTurn(3_725_000)).toBe('1h 02m')
})
