import { expect, mock, test } from 'claude-code/testing'

import type { CallTiming, Job, LiveCall, PlanTask } from '../types'
import type { PlanData } from '../hooks/planview'
import { planLines, planWanted } from '../hooks/planview'
import type { AgentRow } from '../hooks/plan'
import { currentTaskId } from '../hooks/plan'
import type { ShellRow } from '../hooks/shell'
import { shellRows } from '../hooks/shell'

const task = (id: string, status: PlanTask['status'], over: Partial<PlanTask> = {}): PlanTask => ({ id, subject: id, status, createdAt: 0, ...over })
const data = (over: Partial<PlanData>): PlanData => ({ tasks: [], agents: [], shells: [], tails: {}, shellHistory: {}, planHistory: [], now: 100_000, all: false, ...over })
const shell = (id: string, over: Partial<ShellRow> = {}): ShellRow => ({ id, label: id, startedAt: 90_000, status: 'running', background: false, ...over })
const agent = (id: string, over: Partial<AgentRow> = {}): AgentRow => ({ id, description: id, type: 'Explore', startedAt: 90_000, status: 'running', ...over })

// One line per row, as `<kind> <name>` with its indent, so a test reads like the drawing.
const outline = (d: PlanData) =>
  planLines(d).lines.map(l =>
    l.kind === 'task' ? `${l.task.id}`
      : l.kind === 'sub' ? `  ${l.task.id}`
        : l.kind === 'agent' ? `${l.indent}agent ${l.agent.id}`
          : l.kind === 'shell' ? `${l.indent}shell ${l.shell.id}`
            : l.kind === 'tail' ? `${l.indent}> ${l.text}`
              : l.text,
  )

test('the running sub-item owns new work before its parent, and a newer parent elsewhere', async () => {
  const tasks = [
    task('a', 'in_progress', { startedAt: 1 }),
    task('a1', 'in_progress', { parent: 'a', startedAt: 2 }),
    task('b', 'in_progress', { startedAt: 3 }),
  ]
  expect(currentTaskId(tasks)).toBe('a1')
  expect(currentTaskId([task('a', 'in_progress', { startedAt: 1 }), task('b', 'in_progress', { startedAt: 3 })])).toBe('b')
  expect(currentTaskId([task('a', 'pending')])).toBeUndefined()
})

test('shell rows carry the task their call or job started under', async () => {
  const calls: Record<string, CallTiming> = {
    fg: { tool: 'Bash', startedAt: 0, target: 'npm test', taskId: 'a' },
    bg: { tool: 'Bash', startedAt: 0, target: 'dev server', taskId: 'b' },
  }
  const live: Record<string, LiveCall> = { fg: { tool: 'Bash', input: { command: 'npm test' } } }
  const jobs: Job[] = [{ id: 'j1', callId: 'bg', startedAt: 0, status: 'running', taskId: 'b' }]
  expect(shellRows(calls, live, jobs, 1000).map(r => [r.id, r.taskId])).toEqual([['fg', 'a'], ['j1', 'b']])
})

test('work nests under the task or sub-item it started under, with no separate shell section', async () => {
  const d = data({
    tasks: [
      task('a', 'completed', { startedAt: 0, doneAt: 80_000 }),
      task('b', 'in_progress', { startedAt: 80_000 }),
      task('b1', 'completed', { parent: 'b', startedAt: 80_000, doneAt: 85_000 }),
      task('b2', 'in_progress', { parent: 'b', startedAt: 85_000 }),
      task('c', 'pending'),
    ],
    agents: [agent('scout', { taskId: 'b2' })],
    shells: [
      shell('build', { taskId: 'a', status: 'done', endedAt: 95_000 }),
      shell('tests', { taskId: 'b2' }),
      shell('server', { taskId: 'b', background: true, outputFile: '/t/server.output' }),
    ],
    tails: { '/t/server.output': 'listening on :3000' },
  })
  expect(outline(d)).toEqual([
    'a',
    '    shell build',
    'b',
    '  b1',
    '  b2',
    '        agent scout',
    '        shell tests',
    '    shell server',
    '      > listening on :3000',
    'c',
  ])
})

test('a running sub-item shows under a parent that was never started', async () => {
  const d = data({ tasks: [task('a', 'pending'), task('a1', 'in_progress', { parent: 'a', startedAt: 1 }), task('a2', 'pending', { parent: 'a' })] })
  expect(outline(d)).toEqual(['a', '  a1', '  a2'])
})

test('work from no task, or a task since deleted, goes in one group at the end', async () => {
  const d = data({
    tasks: [task('a', 'in_progress', { startedAt: 1 })],
    shells: [shell('loose'), shell('gone', { taskId: 'zz' })],
    agents: [agent('stray')],
  })
  expect(outline(d)).toEqual(['a', '  outside the plan', '    agent stray', '    shell loose', '    shell gone'])
})

test('with no plan, shells still draw under their own label, agents are left to the tool rows', async () => {
  const d = data({ shells: [shell('server', { background: true })], agents: [agent('stray')] })
  expect(outline(d)).toEqual(['  shell', '    shell server'])
  expect(planWanted(d)).toEqual({ plan: 0, shell: 2, tails: 0, focus: false })
})

test('finished work folds away after 30s, running work never does', async () => {
  const d = data({
    now: 200_000,
    tasks: [task('a', 'completed', { startedAt: 0, doneAt: 10_000 })],
    agents: [agent('old', { taskId: 'a', status: 'done', endedAt: 100_000 })],
    shells: [shell('daemon', { taskId: 'a', startedAt: 0, background: true })],
  })
  expect(outline(d)).toEqual(['a', '    shell daemon'])
})

test('the plan asks for up to twelve rows before show all', async () => {
  const many = Array.from({ length: 20 }, (_, i) => task(`t${i}`, i === 0 ? 'in_progress' : 'pending'))
  expect(planWanted(data({ tasks: many })).plan).toBe(12)
  expect(planWanted(data({ tasks: many, all: true })).plan).toBe(19)
})

test('a shell started while a task runs records that task', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  const written: Record<string, any> = {}
  on('state.set', async (_$, e: any, next) => {
    if (e.plugin === 'tidepool') written[e.key] = e.value
    return next(e)
  })
  on('tool.call', { tool: 'TaskCreate' }, async () => ({ result: { task: { id: '1', subject: 'build' } } as never }))
  on('tool.call', { tool: 'TaskUpdate' }, async () => ({ result: { success: true, taskId: '1', updatedFields: ['status'] } as never }))
  on('tool.call', { tool: 'Bash' }, async () => ({ result: { stdout: '' } as never }))

  await $.tool.call({ tool: 'Bash', tool_use_id: 'before', command: 'ls', description: 'List' })
  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'c1', subject: 'build', description: 'd' })
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u1', taskId: '1', status: 'in_progress' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'during', command: 'npm test', description: 'Run tests' })

  expect(written.calls.before.taskId).toBeUndefined()
  expect(written.calls.during.taskId).toBe('1')
})
