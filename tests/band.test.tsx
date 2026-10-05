import { expect, mock, test } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 80, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const

test('band lists tasks once a plan starts', { options: { powerline: true } }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.root', () => ({ value: '/repo/a' }))
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }))
  on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }))

  await $.tool.call({ tool: 'TaskCreate', subject: 'schema', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'routes', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'schema', status: 'in_progress' })
  await clock.advance(10 * 60000)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'schema', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'routes', status: 'in_progress' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'tidepool', surface, ...BAND })
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    expect(text).toContain(' Plan ')
    expect(text).toContain(' 1/2 ━━━━━━──────')
    expect(text).toContain(' ~10m left ')
    expect(text).toContain('✓ 1. schema  10m')
    expect(text).toContain('▶ 2. routes  0s')
    // Powerline glyphs only where a Nerd Font is likely.
    expect(text.includes('\uE0B0')).toBe(surface === 'terminal')
    await ui.unmount()
  }
})

test('history is kept per project, borrowed by a project with none', async ($, on) => {
  const clock = mock.clock(on)
  let root = '/repo/a'
  on('session.root', () => ({ value: root }))
  mock.store(on, { 'history-by-project': { '/repo/a': [6 * 60000], '/repo/b': [30 * 60000] } })
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }))
  on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }))
  const header = async () => {
    const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND })
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    await ui.unmount()
    return text.match(/~\S+ left \(from past plans\)/)?.[0]
  }

  // Project a uses only its own 6m, not b's 30m.
  await $.tool.call({ tool: 'TaskCreate', subject: 'a1', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'a2', description: '' })
  expect(await header()).toBe('~12m left (from past plans)')

  // Finishing a task in a adds 9m to a's history only: median of 6m and 9m is 7.5m.
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'a1', status: 'in_progress' })
  await clock.advance(9 * 60000)
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'a1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'a2', status: 'completed' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'a3', description: '' })
  expect(await header()).toBe('~6m left (from past plans)') // a: 6m, 9m, 0m -> median 6m

  // A project with no history borrows everyone's: a's 6, 9, 0, 0 and b's 30 -> median 6m.
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'a3', status: 'completed' })
  root = '/repo/new'
  await $.tool.call({ tool: 'TaskCreate', subject: 'n1', description: '' })
  expect(await header()).toBe('~6m left (from past plans)')
})

test('agents nest under the running task and fold away after finishing', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo/a' }))
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }))
  on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'ag1' }))
  on('turn.complete', () => ({ text: 'ok' }))
  const text = async () => {
    const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND })
    const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    await ui.unmount()
    return all
  }

  await $.tool.call({ tool: 'TaskCreate', subject: 'tests', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'tests', status: 'in_progress' })
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'run', description: 'Running engine tests', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  })
  await clock.advance(167_000)
  expect(await text()).toContain('◆ general-purpose  Running engine tests  2m 47s')

  await $.turn.complete({
    answer: 'done', durationMs: 1, isAborted: false, turnId: 't', agentId: 'ag1', reason: 'answer',
    usage: { model: 'm', input_tokens: 100_000, output_tokens: 1_100, cache_read_input_tokens: 95_000, cache_creation_input_tokens: 0 },
  })
  expect(await text()).toContain('✓ general-purpose  Running engine tests  2m 47s · 196.1k tokens')

  await clock.advance(31_000)
  expect(await text()).not.toContain('general-purpose')
})

// Hooks beneath the plugin must all be registered before the test first calls $.
function engine(on: any) {
  mock.clock(on)
  mock.store(on)
  on('session.root', () => ({ value: '/repo/a' }))
  on('tool.call', { tool: 'TaskCreate' }, (_$: unknown, e: { subject: string }) => ({ result: { task: { id: e.subject, subject: e.subject } } }))
}

async function onePlan($: any, on: any) {
  engine(on)
  await $.tool.call({ tool: 'TaskCreate', subject: 'only', description: '' })
}

test('band uses no powerline glyphs when the option is off', async ($, on) => {
  await onePlan($, on)
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(text).toContain(' Plan ')
  expect(text.includes('\uE0B0') || text.includes('\uE0B6')).toBe(false)
})

test('band header drops the time-left segment at 40 columns', async ($, on) => {
  await onePlan($, on)
  const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 40 } }
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...narrow })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(text).toContain('0/1')
  expect(text).not.toContain('ETA')
})

test('tasks off: band hook returns next(e)', { options: { dock: false, tasks: false, usage: false } }, async ($, on) => {
  engine(on)
  on('ui.render', { component: 'AbovePrompt' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  await $.tool.call({ tool: 'TaskCreate', subject: 'only', description: '' })
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['ENGINE'])
})

test('band leaves agent rows to a docked rail and keeps them otherwise', { options: { dock: false } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.root', () => ({ value: '/repo/a' }))
  on('tool.call', { tool: 'TaskCreate' }, (_$, e) => ({ result: { task: { id: e.subject, subject: e.subject } } }))
  on('tool.call', { tool: 'TaskUpdate' }, (_$, e) => ({ result: { success: true, taskId: e.taskId, updatedFields: ['status'] } }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'ag1' }))
  on('ui.panes', () => ({ value: [{ id: 'tidepool-rail', title: 'tidepool', isShown: true, isFocused: false, isPlaced: true }] }))
  await $.tool.call({ tool: 'TaskCreate', subject: 'tests', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'tests', status: 'in_progress' })
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'run', description: 'Running engine tests', subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false,
  })
  const text = async (viewport: { columns: number; rows: number; isFullscreen: boolean }) => {
    const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND, viewport })
    const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
    await ui.unmount()
    return all
  }
  const docked = await text({ columns: 140, rows: 40, isFullscreen: true })
  expect(docked).toContain('tests')
  expect(docked).not.toContain('general-purpose')
  expect(await text({ columns: 140, rows: 40, isFullscreen: false })).toContain('general-purpose')
  expect(await text({ columns: 100, rows: 40, isFullscreen: true })).toContain('general-purpose')
})
