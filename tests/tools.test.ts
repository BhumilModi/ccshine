import { expect, test } from 'claude-code/testing'

import { describeCall, editStats, fmtShort, groupSummary } from '../hooks/tools'

const ROOT = '/repo'

test('Read shows the path relative to the session root', async () => {
  expect(describeCall('Read', { file_path: '/repo/src/a.ts' }, ROOT)).toEqual({ icon: '◇', target: 'src/a.ts' })
})

test('path outside session root stays absolute', async () => {
  expect(describeCall('Read', { file_path: '/etc/hosts' }, ROOT)?.target).toBe('/etc/hosts')
})

test('Edit, MultiEdit and Write use the edit icon', async () => {
  for (const tool of ['Edit', 'MultiEdit', 'Write']) {
    expect(describeCall(tool, { file_path: '/repo/x.ts' }, ROOT)).toEqual({ icon: '◆', target: 'x.ts' })
  }
})

test('Bash prefers the description', async () => {
  expect(describeCall('Bash', { command: 'npm test', description: 'Run tests' }, ROOT)).toEqual({ icon: '❯', target: 'Run tests' })
})

test('Bash with no description truncates command to 60 chars', async () => {
  const command = 'x'.repeat(80)
  expect(describeCall('Bash', { command }, ROOT)?.target).toBe('x'.repeat(60))
})

test('Grep shows the pattern and where', async () => {
  expect(describeCall('Grep', { pattern: 'TODO', path: '/repo/src' }, ROOT)).toEqual({ icon: '⌕', target: 'TODO in src' })
  expect(describeCall('Glob', { pattern: '**/*.ts' }, ROOT)).toEqual({ icon: '⌕', target: '**/*.ts' })
})

test('web tools show the host or the query', async () => {
  expect(describeCall('WebFetch', { url: 'https://docs.anthropic.com/en/x', prompt: 'p' }, ROOT)).toEqual({ icon: '↗', target: 'docs.anthropic.com' })
  expect(describeCall('WebSearch', { query: 'ink truncate' }, ROOT)).toEqual({ icon: '↗', target: 'ink truncate' })
})

test('Agent and task tools', async () => {
  expect(describeCall('Agent', { description: 'Find entry points', prompt: 'p' }, ROOT)).toEqual({ icon: '◈', target: 'Find entry points' })
  expect(describeCall('TaskCreate', { subject: 'Add tests', description: 'd' }, ROOT)).toEqual({ icon: '☐', target: 'Add tests' })
  expect(describeCall('TaskUpdate', { taskId: '3', status: 'completed' }, ROOT)).toEqual({ icon: '☐', target: '#3 completed' })
  expect(describeCall('TodoWrite', { todos: [{}, {}] }, ROOT)).toEqual({ icon: '☐', target: '2 todos' })
})

test('mcp and unknown tools are left to the engine', async () => {
  expect(describeCall('mcp__linear__save_issue', { title: 'x' }, ROOT)).toBeUndefined()
  expect(describeCall('Read', null, ROOT)).toBeUndefined()
})

test('Edit counts lines of old_string as removed and new_string as added', async () => {
  expect(editStats('Edit', { old_string: 'a\nb', new_string: 'a\nB\nc' })).toEqual({ added: 3, removed: 2 })
  expect(editStats('MultiEdit', { edits: [{ old_string: 'a', new_string: 'b\nc' }, { old_string: 'd', new_string: '' }] })).toEqual({ added: 2, removed: 2 })
})

test('Write counts content lines as added, 0 removed', async () => {
  expect(editStats('Write', { content: 'one\ntwo\nthree' })).toEqual({ added: 3, removed: 0 })
})

test('Read has no edit stats', async () => {
  expect(editStats('Read', { file_path: '/a' })).toBeUndefined()
})

test('fmtShort', async () => {
  expect(fmtShort(400)).toBe('0.4s')
  expect(fmtShort(2400)).toBe('2s')
  expect(fmtShort(63_000)).toBe('1m 3s')
})

test('groupSummary counts calls per tool in first-use order', async () => {
  expect(groupSummary([{ tool: 'Read' }, { tool: 'Bash' }, { tool: 'Read' }, { tool: 'mcp__x__y' }])).toEqual([
    { tool: 'Read', icon: '◇', count: 2 },
    { tool: 'Bash', icon: '❯', count: 1 },
    { tool: 'mcp__x__y', icon: '·', count: 1 },
  ])
})
