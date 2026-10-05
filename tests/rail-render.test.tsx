import { expect, mock, test } from 'claude-code/testing'

// Quiet the rest of the plugin: only the tracker and the timeline matter here.
const OFF = { options: { dock: false, installAssets: false, chrome: false } }

type Result = { result: unknown; isError?: true; text?: string }

function world(on: any) {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  const usage = { startedAt: 1, context: { window: 200_000, percent: 38 }, rateLimits: [], cost: { usd: 1 } }
  const results: Record<string, Result> = {}
  const waits: Record<string, number> = {}
  const closed: string[] = []
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
  return { clock, usage, results, waits, closed }
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

// A turn's first tool row in the fullscreen chat: it carries the anchor line and the timeline under it.
const anchor = (id: string, tool = 'Read', columns = 100, isFullscreen = true) => ({
  plugin: 'tidepool', surface: 'terminal', component: 'ToolUse', requestId: id, viewport: { columns, rows: 40, isFullscreen },
  props: { tool_use_id: id, tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false },
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

test('a finished turn folds to its anchor line; pressing it opens the timeline', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(anchor('r1'))
  const folded = await textOf(ui)
  expect(folded).toContain('◇ 2 tools')
  expect(folded).toContain('▸ timeline')
  expect(folded).not.toContain('npm test')
  await ui.press({ key: 'anchor' })
  const text = await textOf(ui)
  for (const part of ['▾ timeline', 'Read', 'src/a.ts', 'npm test', '━', '✕', '0s', 'ctx', '38% → 52%', '$0.31']) expect(text).toContain(part)
  await ui.press({ key: 'anchor' })
  expect(await textOf(ui)).not.toContain('npm test')
})

test('the live turn is open while it runs, newest rows only, and folds when it ends', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'read', turnId: 't1' })
  for (let i = 0; i < 10; i++) await call($, w, `r${i}`, 'Read', { file_path: `/repo/f${i}.ts` }, 100)
  const ui = await $.ui.mount(anchor('r0'))
  const text = await textOf(ui)
  await ui.unmount()
  expect(text).toContain('▾ timeline')
  expect(text).toContain('2 earlier')
  expect(text).not.toContain('f1.ts')
  expect(text).toContain('f9.ts')
  expect(text).toContain('…')
  await $.turn.complete(complete('t1'))
  const after = await textOf(await $.ui.mount(anchor('r0')))
  expect(after).toContain('▸ timeline')
  expect(after).not.toContain('f9.ts')
})

test('a live turn folded by hand stays folded', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'read', turnId: 't1' })
  await call($, w, 'r1', 'Read', { file_path: '/repo/a.ts' }, 100)
  const ui = await $.ui.mount(anchor('r1'))
  await ui.press({ key: 'anchor' })
  await call($, w, 'r2', 'Read', { file_path: '/repo/b.ts' }, 100)
  expect(await textOf(ui)).not.toContain('b.ts')
})

test('pressing a row expands its detail; pressing again collapses', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(anchor('r1'))
  await ui.press({ key: 'anchor' })
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
  const ui = await $.ui.mount(anchor('tu1', 'Agent'))
  expect(await textOf(ui)).toContain('2 tools ▸')
  expect(await textOf(ui)).not.toContain('└ Grep')
  await ui.press({ key: 'row:tu1' })
  expect(await textOf(ui)).toContain('└ Grep')
})

test('a narrow chat drops bars', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(anchor('r1', 'Read', 45))
  await ui.press({ key: 'anchor' })
  const text = await textOf(ui)
  expect(text).toContain('npm test')
  expect(text).not.toContain('━')
})

test('fixed-width pieces never shrink, so a narrow chat truncates instead of wrapping', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const ui = await $.ui.mount(anchor('r1', 'Read', 45))
  await ui.press({ key: 'anchor' })
  const button = await ui.find({ type: 'Button', key: 'anchor' })
  expect(button).toBeDefined()
  for (const box of await ui.findAll({ type: 'Box' })) if (box.props.height === 1) expect(box.props.backgroundColor).toBeUndefined()
  const rows = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.height === 1)
  expect(rows.length).toBeGreaterThan(3)
  const shrinkers = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.flexShrink === 0)
  expect(shrinkers.length).toBeGreaterThan(3)
})

test('outside fullscreen tool rows stay one line each', OFF, async ($, on) => {
  const w = world(on)
  await twoCallTurn($, w)
  const text = await textOf(await $.ui.mount({ ...anchor('r1', 'Read', 100, false), props: { ...anchor('r1').props, input: { file_path: '/repo/src/a.ts' } } }))
  expect(text).toContain('Read')
  expect(text).not.toContain('timeline')
})

test('a turn with no drawn rows says so', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await call($, w, 'td1', 'TodoWrite', { todos: [] }, 50)
  const ui = await $.ui.mount(anchor('td1', 'TodoWrite'))
  expect(await textOf(ui)).toContain('1 tool')
})

test('a background shell runs past its turn until its notification ends it', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'serve', turnId: 't1' })
  await call($, w, 'b1', 'Bash', { command: 'npm run dev', run_in_background: true }, 100, { result: { backgroundTaskId: 'j1' } })
  await w.clock.advance(5000)
  await $.turn.complete(complete('t1'))
  await w.clock.advance(60_000)
  const ui = await $.ui.mount(anchor('b1', 'Bash'))
  await ui.press({ key: 'anchor' })
  expect(await textOf(ui)).toContain('running')
  expect(await textOf(ui)).toContain('⇢')
  await ui.unmount()
  await $.prompt.submit({ text: '<task-notification><task-id>j1</task-id><status>completed</status></task-notification>', origin: { kind: 'task-notification' } } as never)
  const after = await $.ui.mount(anchor('b1', 'Bash'))
  expect(await textOf(after)).not.toContain('running')
})

test('a turn stopped with Esc says so on its anchor', OFF, async ($, on) => {
  const w = world(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await call($, w, 'r1', 'Read', { file_path: '/repo/a.ts' }, 100)
  await $.turn.complete(complete('t1', { isAborted: true, reason: 'aborted' }))
  const text = await textOf(await $.ui.mount(anchor('r1')))
  expect(text).toContain('stopped')
  expect(text).not.toContain('…')
})

function startup(on: any, panes: { id: string }[]) {
  on('env.get', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('settings.read', () => ({ value: {} }))
  on('command.register', (_$: unknown, e: { name: string }) => ({ value: { command: e.name, agent: '' } }))
  on('session.start', () => ({ cwd: '/repo' }))
  on('ui.panes', () => ({ value: panes }))
}

test('session start closes the pane an older version left open', OFF, async ($, on) => {
  const w = world(on)
  startup(on, [{ id: 'tidepool-rail' }])
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(w.closed).toEqual(['tidepool-rail'])
})
