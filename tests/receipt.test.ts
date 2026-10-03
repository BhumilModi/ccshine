import { expect, test } from 'claude-code/testing'

import { fmtTurn } from '../hooks/receipt'

test('fmtTurn', async () => {
  expect(fmtTurn(9911)).toBe('9.9s')
  expect(fmtTurn(63_000)).toBe('1m 03s')
  expect(fmtTurn(3_725_000)).toBe('1h 02m')
})
