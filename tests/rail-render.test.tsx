import { expect, mock, test } from 'claude-code/testing'

// Quiet the rest of the plugin: only the tracker and the rail matter here.
const OFF = { options: { dock: false, installAssets: false, chrome: false } }

type Result = { result: unknown; isError?: true; text?: string }

function world(on: any) {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  const usage = { startedAt: 1, context: { window: 200_000, percent: 38 }, rateLimits: [], cost: { usd: 1 } }
  const results: Record<string, Result> = {}
  const waits: Record<string, number> = {}
  const closed: string[] = []
  const opened: { id: string; title?: string }[] = []
  on('session.usage', () => ({ value: usage }))
  on('session.root', () => ({ value: '/repo' }))
  on('turn.start', (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('prompt.submit', (_$: unknown, e: { text: string }) => ({ text: e.text }))
  on('agent.spawn', () => ({ model: 'm', agentId: 'ag1' }))
  on('tool.call', async (_$: unknown, e: { tool_use_id: string }) => {
    if (waits[e.tool_use_id]) await clock.sleep(waits[e.tool_use_id]!)
    return results[e.tool_use_id] ?? { result: {} }
  })
  on('ui.close', (_$: unknown, e: { id: string }) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('ui.open', (_$: unknown, e: { id: string; title?: string }) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  return { clock, usage, results, waits, closed, opened }
}

type World = ReturnType<typeof world>

async function call($: any, w: World, id: string, tool: string, input: Record<string, unknown>, ms = 0, result?: Result) {
  if (result) w.results[id] = result
  w.waits[id] = ms
  const pending = $.tool.call({ tool, tool_use_id: id, ...input })
  if (ms) await w.clock.advance(ms)
  await pending
}

const complete = (turnId: string, extra: Record<string, unknown> = {}) => ({
  answer: 'ok', durationMs: 1, isAborted: false, turnId, reason: 'answer' as const, ...extra,
})

const pane = (placement: 'dock' | 'inline' = 'dock', bodyColumns = 46) => ({
  plugin: 'tidepool', surface: 'terminal', component: 'Pane', requestId: 'tidepool-rail',
  props: { title: 'tidepool', isFocused: false, bodyColumns, placement, scroll: { offset: 0, bodyRows: 40 }, view: {} },
}) as const

const textOf = async (ui: any) =>
  [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))].map((n: any) => n.text ?? '').join('|')

async function twoCallTurn($: any, w: World) {
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await call($, w, 'r1', 'Read', { file_path: '/repo/src/a.ts' }, 400)
  await call($, w, 'b1', 'Bash', { command: 'npm test' }, 4000, { isError: true, result: 'Exit code 1', text: 'Exit code 1\nexpected 200' })
  w.usage.context.percent = 52
  w.usage.cost.usd = 1.31
  await $.turn.complete(complete('t1'))
}

test('docked pane draws header, rows with span bars, axis and summary', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(pane())
  const text = await textOf(ui)
  for (const part of ['turn 1', 'Read', 'src/a.ts', 'npm test', '━', '✕', '0s', 'ctx', '38% → 52%', '$0.31']) expect(text).toContain(part)
  expect(text).not.toContain('live')
})

test('pressing a row expands its detail; pressing again collapses', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(pane())
  expect(await textOf(ui)).not.toContain('$ npm test')
  await ui.press({ key: 'row:b1' })
  expect(await textOf(ui)).toContain('$ npm test')
  expect(await textOf(ui)).toContain('Exit code 1')
  await ui.press({ key: 'row:b1' })
  expect(await textOf(ui)).not.toContain('$ npm test')
})

test('pressing an agent row lists its child calls with └', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'look', turnId: 't1' })
  await call($, w, 'tu1', 'Agent', { description: 'Explore auth', prompt: 'p', subagent_type: 'Explore' }, 100)
  await $.agent.spawn({
    tool_use_id: 'tu1', prompt: 'p', description: 'Explore auth', subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' }, parentModel: 'm', background: true, fork: false,
  })
  await call($, w, 'c1', 'Grep', { pattern: 'token', agentId: 'ag1' }, 100)
  await call($, w, 'c2', 'Read', { file_path: '/repo/auth.ts', agentId: 'ag1' }, 100)
  const ui = await $.ui.mount(pane())
  expect(await textOf(ui)).toContain('2 tools')
  expect(await textOf(ui)).not.toContain('└ Grep')
  await ui.press({ key: 'row:tu1' })
  expect(await textOf(ui)).toContain('└ Grep')
})

test('inline placement shows the live turn only, at most 6 rows, then one summary line', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'read', turnId: 't1' })
  for (let i = 0; i < 8; i++) await call($, w, `r${i}`, 'Read', { file_path: `/repo/f${i}.ts` }, 100)
  const ui = await $.ui.mount(pane('inline', 80))
  const text = await textOf(ui)
  expect(text).toContain('2 earlier')
  expect(text).not.toContain('f1.ts')
  expect(text).toContain('f7.ts')
  expect(text).toContain('live')
  await ui.unmount()
  await $.turn.complete(complete('t1'))
  const idle = await textOf(await $.ui.mount(pane('inline', 80)))
  expect(idle).toContain('turn 1 · ')
  expect(idle).toContain('8 tools')
  expect(idle).not.toContain('f7.ts')
})

test('the one-line inline summary counts every failed call', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await call($, w, 'b2', 'Bash', { command: 'npm test' }, 100, { isError: true, result: 'Exit code 1', text: 'Exit code 1' })
  await call($, w, 'b3', 'Bash', { command: 'npm test' }, 100, { isError: true, result: 'Exit code 1', text: 'Exit code 1' })
  await $.turn.complete(complete('t2'))
  expect(await textOf(await $.ui.mount(pane('inline', 80)))).toContain('2 failed')
})

test('narrow dock drops bars', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(pane('dock', 39))
  const text = await textOf(ui)
  expect(text).toContain('npm test')
  expect(text).not.toContain('━')
})

test('a turn with no tools says so', OFF, async ($, on) => {
  world(on)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete(complete('t1'))
  const ui = await $.ui.mount(pane())
  expect(await textOf(ui)).toContain('no tools this turn')
})

test('a background shell runs past its turn until its notification ends it', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'serve', turnId: 't1' })
  await call($, w, 'b1', 'Bash', { command: 'npm run dev', run_in_background: true }, 100, { result: { backgroundTaskId: 'j1' } })
  await w.clock.advance(5000)
  await $.turn.complete(complete('t1'))
  await w.clock.advance(60_000)
  const ui = await $.ui.mount(pane())
  expect(await textOf(ui)).toContain('running')
  expect(await textOf(ui)).toContain('⇢')
  await ui.unmount()
  await $.prompt.submit({ text: '<task-notification><task-id>j1</task-id><status>completed</status></task-notification>', origin: { kind: 'task-notification' } } as never)
  const after = await $.ui.mount(pane())
  expect(await textOf(after)).not.toContain('running')
})

test('a turn stopped with Esc still closes', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await call($, w, 'r1', 'Read', { file_path: '/repo/a.ts' }, 100)
  await $.turn.complete(complete('t1', { isAborted: true, reason: 'aborted' }))
  const ui = await $.ui.mount(pane())
  const text = await textOf(ui)
  expect(text).toContain('stopped')
  expect(text).not.toContain('live')
})

test('/clear empties the rail', OFF, async ($, on) => {
  const w = world(on)
  await $.prompt.submit({ text: 'first', origin: { kind: 'composer' } } as never)
  await twoCallTurn($, w)
  w.usage.startedAt = 2
  await $.prompt.submit({ text: 'after clear', origin: { kind: 'composer' } } as never)
  const ui = await $.ui.mount(pane())
  expect(await textOf(ui)).toContain('no turns yet')
})

function startup(on: any, panes: { id: string }[]) {
  on('env.get', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('settings.read', () => ({ value: {} }))
  on('command.register', (_$: unknown, e: { name: string }) => ({ value: { command: e.name, agent: '' } }))
  on('command.run', (_$: unknown, e: { command: string }) => ({ text: e.command }))
  on('session.start', () => ({ cwd: '/repo' }))
  on('ui.panes', () => ({ value: panes }))
}

const start = ($: any) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

test('session start closes a stale rail then opens a fresh one', OFF, async ($, on) => {
  const w = world(on)
  startup(on, [{ id: 'tidepool-rail' }])
  await start($)
  expect(w.closed).toEqual(['tidepool-rail'])
  expect(w.opened.map(o => [o.id, o.title])).toEqual([['tidepool-rail', 'tidepool']])
})

test('with rail off nothing opens', { options: { ...OFF.options, rail: false } }, async ($, on) => {
  const w = world(on)
  startup(on, [])
  await start($)
  expect(w.opened).toEqual([])
})

test('/tidepool-rail closes an open rail and opens a closed one', OFF, async ($, on) => {
  const w = world(on)
  const panes: { id: string }[] = []
  startup(on, panes)
  await start($)
  panes.push({ id: 'tidepool-rail' })
  await $.command.run({ command: 'tidepool-rail', args: '' } as never)
  expect(w.closed).toEqual(['tidepool-rail'])
  panes.length = 0
  await $.command.run({ command: 'tidepool-rail', args: '' } as never)
  expect(w.opened.length).toBe(2)
})

test('with the warm theme the rail paints the Warm Claude background', { options: { ...OFF.options, theme: 'warm' } }, async ($, on) => {
  world(on)
  const ui = await $.ui.mount(pane())
  expect((await ui.find({ type: 'Box' }))?.props.backgroundColor).toBe('#1A1817')
})

test('with any other theme the rail keeps Claude Code\'s panel colour', OFF, async ($, on) => {
  world(on)
  const ui = await $.ui.mount(pane())
  expect((await ui.find({ type: 'Box' }))?.props.backgroundColor).toBeUndefined()
})

test('fixed-width pieces never shrink, so a narrow rail truncates instead of wrapping', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(pane('dock', 30))
  const title = await ui.find({ type: 'Text', text: 'turn 1' })
  expect(title).toBeDefined()
  const fixed = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.flexShrink === 0)
  // The turn line, each tool row, and the summary labels.
  expect(fixed.length).toBeGreaterThan(4)
})
