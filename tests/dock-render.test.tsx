import { expect, mock, test } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const
const SPINNER = { component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } } as const

// Hooks beneath the plugins must all be registered before the test first calls $.
function engine(on: any) {
  const clock = mock.clock(on, { now: 10_000 })
  mock.store(on)
  on('session.root', () => ({ value: '/Users/a/ccshine' }))
  on('turn.start', (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('ui.blit', () => ({ value: {} }))
  for (const component of ['AbovePrompt', 'Spinner']) {
    on('ui.render', { component }, ($e: any, e: any) => {
      const { Text } = $e.ui.resolve(e)
      return <Text>ENGINE</Text>
    })
  }
  return clock
}

async function band($: any, surface: 'terminal' | 'desktop' = 'terminal') {
  const ui = await $.ui.mount({ plugin: 'ccshine', surface, ...BAND })
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
  const ui = await $.ui.mount({ plugin: 'ccshine', surface: 'terminal', ...SPINNER })
  expect(await ui.findAll({ type: 'Text' })).toHaveLength(0)
  await ui.unmount()
})

test('spinner line stays when the dock is off', { options: { dock: false } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ plugin: 'ccshine', surface: 'terminal', ...SPINNER })
  expect((await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')).toBe('ENGINE')
  await ui.unmount()
})
