import { expect, test } from 'claude-code/testing'

import { palettes } from '../hooks/palettes.mjs'

const C = palettes.claude
const CHROME = ['PromptHint', 'SessionMode', 'InfoNotice', 'ToolProgress', 'TurnDuration']

// The engine's own drawing, used when the hook passes.
function engine(on: any) {
  for (const component of CHROME) {
    on('ui.render', { component }, ($e: any, e: any) => {
      const { Text } = $e.ui.resolve(e)
      return <Text>ENGINE</Text>
    })
  }
}

async function draw($: any, component: string, props: object) {
  const ui = await $.ui.mount({ plugin: 'ccshine', surface: 'terminal', component, props })
  const texts = await ui.findAll({ type: 'Text' })
  await ui.unmount()
  return { texts, text: texts.map((t: any) => t.text).join('') }
}

const hint = (text: string) => ({ hint: text, isDraft: false, isWorking: true })
const pill = { kind: 'background_hint', hint: '(ctrl+b to run in background)', tool_use_id: 'x' }
const notice = { text: 'Using model from settings', command: '/model' }

// A tree or a rewritten hint replaces the line and its live pills, so the engine keeps drawing it.
test('hint line keeps the engine drawing', async ($, on) => {
  engine(on)
  expect((await draw($, 'PromptHint', hint('? for shortcuts · esc to interrupt'))).text).toBe('ENGINE')
})

test('modes draw as chips', async ($, on) => {
  engine(on)
  const { texts } = await draw($, 'SessionMode', { modes: ['focus', 'memory paused'] })
  const chips = texts.filter((t: any) => t.props.backgroundColor === C.seg).map((t: any) => t.text)
  expect(chips).toEqual([' focus ', ' memory paused '])
})

test('no modes keeps the engine drawing', async ($, on) => {
  engine(on)
  expect((await draw($, 'SessionMode', { modes: [] })).text).toBe('ENGINE')
})

test('notice draws the command in accent', async ($, on) => {
  engine(on)
  const { texts, text } = await draw($, 'InfoNotice', notice)
  expect(text).toBe('Using model from settings /model')
  expect(texts.find((t: any) => t.text.includes('/model'))?.props.color).toBe(C.accent)
})

test('background pill', async ($, on) => {
  engine(on)
  const { text } = await draw($, 'ToolProgress', pill)
  expect(text.startsWith('⇣ ')).toBe(true)
  expect(text).toContain('ctrl+b')
})

test('turn duration line is hidden', async ($, on) => {
  engine(on)
  expect((await draw($, 'TurnDuration', { word: 'Baked', durationMs: 3000 })).texts).toHaveLength(0)
})

// Hooks beneath the plugins must all be registered before the test first calls $.
function configEngine(on: any, rows: unknown) {
  const toasts: string[] = []
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return {}
  })
  on('config.list', () => {
    if (rows instanceof Error) throw rows
    return { value: rows }
  })
  on('settings.read', () => ({ value: {} }))
  // Session start also installs the bundled font: never let a test run real commands.
  on('process.run', () => {
    throw new Error('no host commands in tests')
  })
  on('env.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'ccshine-statusline', agent: '' } }))
  on('session.start', () => ({ cwd: '/repo' }))
  return toasts
}

async function startWith($: any, on: any, rows: unknown) {
  const toasts = configEngine(on, rows)
  await start($)
  return toasts
}

const start = ($: any) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

const themeRow = (value: unknown) => [{ key: 'theme', label: 'Theme', kind: 'choice', value, provider: { kind: 'engine' } }]
const TOAST = 'ccshine palettes are made for dark terminals — set a dark theme in /config'

test('light theme shows one toast', async ($, on) => {
  expect(await startWith($, on, themeRow('light-daltonized'))).toEqual([TOAST])
})

test('dark theme shows no toast', async ($, on) => {
  expect(await startWith($, on, themeRow('dark'))).toEqual([])
})

test('missing theme row shows no toast', async ($, on) => {
  expect(await startWith($, on, [])).toEqual([])
})

test('config read that throws does not break session start', async ($, on) => {
  expect(await startWith($, on, new Error('no config'))).toEqual([])
})

test('chrome off returns next(e) and shows no toast', { options: { chrome: false } }, async ($, on) => {
  engine(on)
  const toasts = configEngine(on, themeRow('light'))
  expect((await draw($, 'PromptHint', hint('? for shortcuts'))).text).toBe('ENGINE')
  expect((await draw($, 'SessionMode', { modes: ['focus'] })).text).toBe('ENGINE')
  expect((await draw($, 'InfoNotice', notice)).text).toBe('ENGINE')
  expect((await draw($, 'ToolProgress', pill)).text).toBe('ENGINE')
  expect((await draw($, 'TurnDuration', { word: 'Baked', durationMs: 3000 })).text).toBe('ENGINE')
  await start($)
  expect(toasts).toEqual([])
})
