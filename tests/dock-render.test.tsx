import { expect, mock, test } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const
const SPINNER = { component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } } as const

// Hooks beneath the plugins must all be registered before the test first calls $.
function engine(on: any, blit: () => unknown = () => ({ value: {} })) {
  const clock = mock.clock(on, { now: 10_000 })
  mock.store(on)
  on('session.root', () => ({ value: '/Users/a/ccshine' }))
  on('turn.start', (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('tool.call', { tool: 'TaskCreate' }, (_$: unknown, e: { subject: string }) => ({ result: { task: { id: e.subject, subject: e.subject } } }))
  on('ui.blit', blit)
  for (const component of ['AbovePrompt', 'Spinner']) {
    on('ui.render', { component }, ($e: any, e: any) => {
      const { Text } = $e.ui.resolve(e)
      return <Text>ENGINE</Text>
    })
  }
  return clock
}

async function band($: any, surface: 'terminal' | 'desktop' = 'terminal', props: Record<string, unknown> = {}) {
  const ui = await $.ui.mount({ plugin: 'tidepool', surface, ...BAND, props: { ...BAND.props, ...props } })
  const rasters = await ui.findAll({ type: 'Raster' })
  const text = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
  await ui.unmount()
  return { rasters: rasters.map((r: any) => r.props), text }
}

test('idle dock shows the crab corner and the prompt label', async ($, on) => {
  engine(on)
  const { rasters, text } = await band($)
  expect(rasters).toHaveLength(1)
  expect(rasters[0].key ?? rasters[0].columns).toBeDefined()
  expect([rasters[0].columns, rasters[0].rows]).toEqual([14, 3])
  expect(text).toContain('Ask Claude')
  expect(text).toContain('ccshine')
})

test('a running turn draws the scene, the step and the clock', async ($, on) => {
  const clock = engine(on)
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await clock.advance(2000)
  const { rasters, text } = await band($)
  expect([rasters[0].columns, rasters[0].rows]).toEqual([64, 6])
  expect(text).toContain('2s')
  expect(text).toContain('Working')
})

test('dock off keeps the engine band when there is nothing else', { options: { dock: false } }, async ($, on) => {
  engine(on)
  expect((await band($)).text).toBe('ENGINE')
})

test('desktop keeps the engine band', async ($, on) => {
  engine(on)
  const { rasters, text } = await band($, 'desktop')
  expect(rasters).toHaveLength(0)
  expect(text).toBe('ENGINE')
})

test('spinner line is hidden on the terminal while the dock is on', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...SPINNER })
  expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
  await ui.unmount()
})

test('spinner line stays when the dock is off', { options: { dock: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...SPINNER })
  expect((await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')).toBe('ENGINE')
  await ui.unmount()
})

test('refused repaints keep the animation running', async ($, on) => {
  let blits = 0
  const clock = engine(on, () => {
    blits++
    return { value: { deny: 'not mounted' } }
  })
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(1000)
  await band($)
  blits = 0
  await clock.advance(3000)
  expect(blits).toBeGreaterThan(40)
})

test('a new prompt starts a fresh clock even if the last turn never ended', async ($, on) => {
  const clock = engine(on)
  await $.turn.start({ text: 'one', turnId: 't1' })
  await clock.advance(5000)
  await $.turn.start({ text: 'two', turnId: 't2' })
  await clock.advance(1000)
  const { text } = await band($)
  expect(text).toContain('   1s')
  expect(text).not.toContain('   6s')
})

test('a narrow band drops the key hints and the phase times, and truncates the rest', async ($, on) => {
  const clock = engine(on)
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 60 } })
  const idle = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  expect(idle.map((t: any) => t.text).join('')).not.toContain('shortcuts')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  const ui2 = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 44 } })
  const work = await ui2.findAll({ type: 'Text' })
  await ui2.unmount()
  expect(work.map((t: any) => t.text).join('')).not.toContain('think')
  for (const t of [...idle, ...work]) if (t.text.trim()) expect([t.text, t.props.wrap]).toEqual([t.text, 'truncate-end'])
})

test('the plan leaves room for the dock', async ($, on) => {
  engine(on)
  for (let i = 1; i <= 10; i++) await $.tool.call({ tool: 'TaskCreate', subject: `task ${i}`, description: '' })
  const { text } = await band($, 'terminal', { maxRows: 12 })
  const shown = (text.match(/task \d+/g) ?? []).length
  expect(shown).toBeLessThanOrEqual(12 - 3 - 3)
})

test('the dock keeps a blank row above it, idle and working', async ($, on) => {
  const clock = engine(on)
  const top = async () => {
    const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...BAND })
    const dock = (await ui.findAll({ type: 'Box' })).find((b: any) => b.key === 'dock')
    await ui.unmount()
    return dock?.props.marginTop
  }
  expect(await top()).toBe(1)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(2000)
  expect(await top()).toBe(1)
})

test('one crate reads as one crate', async ($, on) => {
  const clock = engine(on)
  on('turn.complete', () => ({ text: 'ok' }))
  on('tool.call', { tool: 'Read' }, () => ({ result: { type: 'text', file: { filePath: '/a', content: '', numLines: 0, startLine: 1, totalLines: 0 } } as never }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(1500)
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a' })
  await clock.advance(1500)
  await $.turn.complete({ answer: 'ok', durationMs: 3000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(300)
  expect((await band($)).text).toContain('· 1 crate ·')
})

test('a finished turn shows the score; a stopped one says so', async ($, on) => {
  const clock = engine(on)
  on('turn.complete', () => ({ text: 'ok' }))
  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(5000)
  await $.turn.complete({ answer: 'ok', durationMs: 5000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(500)
  const done = (await band($)).text
  expect(done).toContain('Done!')
  expect(done).toMatch(/★ \d+ jumped · 0 crates · 5s/)
  await $.turn.start({ text: 'again', turnId: 't2' })
  await clock.advance(3000)
  await $.turn.complete({ answer: '', durationMs: 3000, isAborted: true, turnId: 't2', reason: 'aborted' })
  await clock.advance(100)
  const stopped = (await band($)).text
  expect(stopped).toContain('Stopped')
  expect(stopped).not.toContain('jumped')
})

test('a plan in a tight band shrinks the running dock to its step line instead of scrolling it away', async ($, on) => {
  const clock = engine(on)
  on('tool.call', { tool: 'TaskUpdate' }, (_$: unknown, e) => ({ result: { success: true, taskId: String(e.taskId), updatedFields: ['status'] } }))
  for (const s of ['one', 'two', 'three', 'four', 'five']) await $.tool.call({ tool: 'TaskCreate', subject: s, description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'one', status: 'in_progress' })
  await $.turn.start({ text: 'build', turnId: 't1' })
  await clock.advance(2000)

  const roomy = await band($, 'terminal', { maxRows: 30 })
  expect(roomy.rasters.map((r: any) => r.rows)).toEqual([6])
  expect(roomy.text).toContain('5. five')

  const tight = await band($, 'terminal', { maxRows: 9 })
  // Nine rows: dock line, header, running task, a four-row crab, calls line.
  expect(tight.rasters.map((r: any) => r.rows)).toEqual([4])
  expect(tight.text).toContain('Working')
  expect(tight.text).toContain('▶ 1. one')
})

test("with Claude Code's own task list leaving five rows, the idle dock label and the plan header both stay", async ($, on) => {
  engine(on)
  on('tool.call', { tool: 'TaskUpdate' }, (_$: unknown, e) => ({ result: { success: true, taskId: String(e.taskId), updatedFields: ['status'] } }))
  for (const s of ['a', 'b', 'c', 'd', 'e', 'f']) await $.tool.call({ tool: 'TaskCreate', subject: s, description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 'c', status: 'in_progress' })
  const { rasters, text } = await band($, 'terminal', { maxRows: 5 })
  expect(rasters).toHaveLength(0)
  expect(text).toContain('Ask Claude')
  expect(text).toContain(' Plan ')
  expect(text).toContain('▶ 3. c')
  expect(text).not.toContain('1. a')
})

test('a band squeezed to seven rows still draws the crab, in a four-row scene', async ($, on) => {
  const clock = engine(on)
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await clock.advance(2000)
  const { rasters, text } = await band($, 'terminal', { maxRows: 7 })
  expect(rasters.map((r: any) => r.rows)).toEqual([4])
  expect(text).toContain('Working')
})

test('a six-row band keeps the crab over the usage line and the calls line', { options: { usage: true } }, async ($, on) => {
  const clock = engine(on)
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await clock.advance(2000)
  const { rasters } = await band($, 'terminal', { maxRows: 6 })
  expect(rasters.map((r: any) => r.rows)).toEqual([4])
})
