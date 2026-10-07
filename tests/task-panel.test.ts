import { expect, mock, test } from 'claude-code/testing'

// TaskCreate and TaskUpdate open Claude Code's own task panel through the progress callback the session hands it.
// Tidepool re-runs the call as its own, which has no such callback, so the panel stays shut.
test('task calls reach the engine once, re-run by tidepool, and are tracked as one call each', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  const callers: string[] = []
  // A test's $ has no state noun; the writes pass through here on their way to the kit.
  const written: Record<string, any> = {}
  on('state.set', async (_$, e: any, next) => {
    if (e.plugin === 'tidepool') written[e.key] = e.value
    return next(e)
  })
  on('tool.call', { tool: 'TaskCreate' }, async (_$, _e, next) => {
    callers.push(next.origin.plugin)
    return { result: { task: { id: '1', subject: 'a' } } as never }
  })
  on('tool.call', { tool: 'TaskUpdate' }, async (_$, _e, next) => {
    callers.push(next.origin.plugin)
    return { result: { success: true, taskId: '1', updatedFields: ['status'] } as never }
  })

  await $.tool.call({ tool: 'TaskCreate', tool_use_id: 'c1', subject: 'a', description: 'd' })
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u1', taskId: '1', status: 'in_progress' })

  expect(callers).toEqual(['tidepool', 'tidepool'])
  expect(written.tasks.map((t: { status: string }) => t.status)).toEqual(['in_progress'])
  const calls = written.calls as Record<string, { tool: string }>
  expect(Object.keys(calls).filter(id => calls[id]?.tool.startsWith('Task'))).toEqual(['c1', 'u1'])
})
