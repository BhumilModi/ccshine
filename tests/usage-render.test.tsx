import { expect, mock, test } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const

function engine(on: any) {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  on('turn.complete', () => ({ text: 'ok' }))
  // The engine's own band: what the hook draws when it has nothing to show.
  on('ui.render', { component: 'AbovePrompt' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  return clock
}

const complete = ($: any, turnId: string, cacheRead: number, cacheWrite: number) =>
  $.turn.complete({
    answer: 'ok', durationMs: 1000, isAborted: false, turnId, reason: 'answer',
    usage: { model: 'm', input_tokens: 1000, output_tokens: 1200, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite },
  })

const textOf = async ($: any) => {
  const ui = await $.ui.mount({ plugin: 'ccshine', surface: 'terminal', ...BAND })
  const text = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
  await ui.unmount()
  return text
}

test('usage line hidden after a warm turn with one source', { options: { dock: false } }, async ($, on) => {
  const clock = engine(on)
  await clock.advance(1000)
  await complete($, 't1', 91_000, 8000)
  await clock.advance(8 * 60_000)
  expect(await textOf($)).toBe('ENGINE')
})

test('usage shows the agent split when subagents ran', async ($, on) => {
  const clock = engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'ag1' }))
  await clock.advance(1000)
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'run', description: 'Find entry points', subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  })
  await $.turn.complete({
    answer: 'done', durationMs: 1, isAborted: false, turnId: 'a1', agentId: 'ag1', reason: 'answer',
    usage: { model: 'm', input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0 },
  })
  await complete($, 't1', 91_000, 8000)
  const text = await textOf($)
  expect(text).toContain('main ')
  expect(text).toContain('Explore ')
  expect(text).not.toContain('Usage')
})

test('cold warning appears only after a cold turn', { options: { dock: false } }, async ($, on) => {
  const clock = engine(on)
  await clock.advance(1000)
  await complete($, 't1', 50_000, 1000)
  expect(await textOf($)).toBe('ENGINE')
  await clock.advance(2 * 60 * 60_000)
  await complete($, 't2', 2000, 41_000)
  expect(await textOf($)).toContain('⚠ cache was cold · this turn re-sent 41.0k at full price')
})

test('usage off and no plan returns next(e)', { options: { dock: false, usage: false } }, async ($, on) => {
  const clock = engine(on)
  on('ui.render', { component: 'AbovePrompt' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  await clock.advance(1000)
  await complete($, 't1', 91_000, 8000)
  expect(await textOf($)).toBe('ENGINE')
})

test('band keeps the done header after the plan finishes', async ($, on) => {
  const clock = engine(on)
  on('tool.call', { tool: 'TaskCreate' }, (_$: unknown, e) => ({ result: { task: { id: String(e.subject), subject: String(e.subject) } } }))
  on('tool.call', { tool: 'TaskUpdate' }, (_$: unknown, e) => ({ result: { success: true, taskId: String(e.taskId), updatedFields: ['status'] } }))
  await $.tool.call({ tool: 'TaskCreate', subject: 'a', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'a', status: 'in_progress' })
  await clock.advance(5000)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'a', status: 'completed' })
  await complete($, 't1', 91_000, 8000)
  const text = await textOf($)
  expect(text).toContain('✓ Plan')
  expect(text).toContain('1/1')
  expect(text).not.toContain('Usage')
})
