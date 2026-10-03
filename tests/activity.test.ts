import { expect, test } from 'claude-code/testing'

import { activity } from '../hooks/activity'

const task = { id: '1', subject: 'Write tests', status: 'in_progress' as const, createdAt: 0, activeForm: 'Writing tests' }

test('one Bash call with a description says the description', async () => {
  expect(activity([{ tool: 'Bash', input: { command: 'npm test', description: 'Run the test suite' } }])).toBe('Run the test suite')
})

test('Bash without a description names the program', async () => {
  expect(activity([{ tool: 'Bash', input: { command: 'npm test -- --watch' } }])).toBe('Running npm')
})

test('file tools say the basename of a deep path', async () => {
  expect(activity([{ tool: 'Read', input: { file_path: '/a/b/c/orchestrator.ts' } }])).toBe('Reading orchestrator.ts')
  expect(activity([{ tool: 'Edit', input: { file_path: '/a/queue.ts' } }])).toBe('Editing queue.ts')
  expect(activity([{ tool: 'Write', input: { file_path: '/a/new.ts' } }])).toBe('Writing new.ts')
})

test('search, web and agent calls', async () => {
  expect(activity([{ tool: 'Grep', input: { pattern: 'TODO' } }])).toBe('Searching TODO')
  expect(activity([{ tool: 'WebFetch', input: { url: 'https://example.com/a' } }])).toBe('Fetching example.com')
  expect(activity([{ tool: 'WebSearch', input: { query: 'x' } }])).toBe('Searching the web')
  expect(activity([{ tool: 'Agent', input: { description: 'Find entry points' } }])).toBe('Agent: Find entry points')
})

test('several running calls are counted', async () => {
  expect(activity([{ tool: 'Read', input: {} }, { tool: 'Grep', input: {} }])).toBe('2 tools running')
})

test('nothing running falls back to the task in progress', async () => {
  expect(activity([], task)).toBe('Writing tests')
  expect(activity([], { ...task, activeForm: undefined })).toBe('Write tests')
  expect(activity([])).toBeUndefined()
})

test('an mcp tool running alone leaves the engine word', async () => {
  expect(activity([{ tool: 'mcp__linear__save_issue', input: {} }], task)).toBeUndefined()
})
