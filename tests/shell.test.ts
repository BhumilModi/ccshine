import { expect, test } from 'claude-code/testing'

import { commandKey, lastLine, parseOutputPath, recordRun, shellEta, shellRows } from '../hooks/shell'

test('commandKey trims and collapses whitespace', async () => {
  expect(commandKey('  npm   test\n')).toBe('npm test')
  expect(commandKey('')).toBe('')
})

test('parseOutputPath reads the path from a background Bash result', async () => {
  const text = 'Command running in background with ID: b1. Output is being written to: /tmp/x/tasks/b1.output. You will be notified.'
  expect(parseOutputPath(text)).toBe('/tmp/x/tasks/b1.output')
  expect(parseOutputPath('Output is being written to: /tmp/a b/tasks/b2.output')).toBe('/tmp/a b/tasks/b2.output')
  expect(parseOutputPath('no path here')).toBeUndefined()
})

test('lastLine keeps the last non-empty line without colour codes or carriage-return overwrites', async () => {
  expect(lastLine('one\ntwo\n\n  \n')).toBe('two')
  expect(lastLine('\u001b[32m✓ 3/10\u001b[0m\n')).toBe('✓ 3/10')
  expect(lastLine('10%\r50%\r90%')).toBe('90%')
  expect(lastLine('')).toBeUndefined()
})

test('recordRun keeps the last 10 runs per command and the newest 200 commands', async () => {
  let h: Record<string, number[]> = {}
  for (let i = 0; i < 12; i++) h = recordRun(h, 'npm test', i)
  expect(h['npm test']).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  for (let i = 0; i < 205; i++) h = recordRun(h, `cmd ${i}`, 1)
  expect(Object.keys(h).length).toBe(200)
  expect(h['npm test']).toBeUndefined()
  // Recording again moves a command to the newest end.
  h = recordRun(h, 'cmd 5', 2)
  h = recordRun(h, 'new', 1)
  expect(h['cmd 5']).toEqual([1, 2])
})

test('shellEta counts down from the median past run', async () => {
  const h = { 'npm test': [100_000, 90_000, 300_000] }
  expect(shellEta(h, 'npm test', 40_000)).toEqual({ left: 60_000 })
  expect(shellEta(h, 'npm test', 130_000)).toEqual({ over: 30_000 })
  expect(shellEta(h, 'never ran', 5_000)).toBeUndefined()
})

test('shellRows lists running shells and slow finished ones until they fade', async () => {
  const calls = {
    fg: { tool: 'Bash', startedAt: 1000, target: 'Run tests' },
    quick: { tool: 'Bash', startedAt: 0, endedAt: 900, target: 'git status' },
    slow: { tool: 'Bash', startedAt: 0, endedAt: 9000, target: 'Build' },
    bgCall: { tool: 'Bash', startedAt: 500, endedAt: 600, target: 'Dev server' },
    agentCall: { tool: 'Bash', startedAt: 0, agentId: 'a1', target: 'agent shell' },
    read: { tool: 'Read', startedAt: 0, target: 'x' },
  }
  const live = { fg: { tool: 'Bash', input: { command: 'npm test' } } }
  const jobs = [{ id: 'j1', callId: 'bgCall', startedAt: 500, status: 'running' as const, command: 'npm run dev', outputFile: '/t/j1.output' }]
  const rows = shellRows(calls, live, jobs, 10_000)
  expect(rows.map(r => [r.label, r.status, r.background])).toEqual([
    ['Build', 'done', false],
    ['Dev server', 'running', true],
    ['Run tests', 'running', false],
  ])
  expect(rows[1]?.outputFile).toBe('/t/j1.output')
  expect(rows[2]?.command).toBe('npm test')
  // 30s after it ended, the finished build folds away.
  expect(shellRows(calls, live, jobs, 40_000).map(r => r.label)).toEqual(['Dev server', 'Run tests'])
})
