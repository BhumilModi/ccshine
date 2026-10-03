import { expect, test } from 'claude-code/testing'

import { palettes } from '../hooks/palettes.mjs'

const C = palettes.claude

// The engine's own row, drawn when the hook passes.
function engine(on: any, component: string) {
  on('ui.render', { component }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
}

async function draw($: any, component: string, props: object, columns = 100) {
  const ui = await $.ui.mount({ plugin: 'ccshine', surface: 'terminal', component, props, viewport: { columns, rows: 40 } })
  const texts = await ui.findAll({ type: 'Text' })
  const markdown = await ui.findAll({ type: 'Markdown' })
  await ui.unmount()
  return { texts, text: texts.map((t: any) => t.text).join(''), markdown: markdown.map((m: any) => m.text) }
}

const prompt = (text: string, kind = 'composer') => ({ text, origin: { kind }, isExpanded: false })
const reply = (text: string, isFirstOfReply: boolean) => ({ text, isFirstOfReply })
const command = (text: string, isErrored = false) => ({ command: 'cost', args: '', text, isErrored })

test('prompt row draws the you marker', async ($, on) => {
  engine(on, 'UserMessage')
  const { texts, text } = await draw($, 'UserMessage', prompt('fix the queue test'))
  expect(text).toContain('▌ you')
  expect(text).toContain('fix the queue test')
  expect(texts.find((t: any) => t.text.includes('▌ you'))?.props.color).toBe(C.accent)
})

test('notification rows keep the engine drawing', async ($, on) => {
  engine(on, 'UserMessage')
  expect((await draw($, 'UserMessage', prompt('task done', 'task-notification'))).text).toBe('ENGINE')
})

test('long prompt wraps at 40 columns', async ($, on) => {
  engine(on, 'UserMessage')
  const { texts } = await draw($, 'UserMessage', prompt('x'.repeat(300)), 40)
  expect(texts.find((t: any) => t.text === 'x'.repeat(300))?.props.wrap).toBe('wrap')
})

test('first reply block has the claude header, later blocks do not', async ($, on) => {
  engine(on, 'AssistantMessage')
  const first = await draw($, 'AssistantMessage', reply('Bug in retry loop.', true))
  expect(first.text).toContain('◆ claude')
  expect(first.markdown).toEqual(['Bug in retry loop.'])
  const later = await draw($, 'AssistantMessage', reply('Fixed in queue.ts.', false))
  expect(later.text).not.toContain('◆ claude')
  expect(later.markdown).toEqual(['Fixed in queue.ts.'])
})

test('command output gets a title and rule', async ($, on) => {
  engine(on, 'CommandOutput')
  const { text, markdown } = await draw($, 'CommandOutput', command('Total: $1'))
  expect(text).toContain('/cost')
  expect(text).toContain('─')
  expect(markdown).toEqual(['Total: $1'])
})

test('errored command output keeps the engine drawing', async ($, on) => {
  engine(on, 'CommandOutput')
  expect((await draw($, 'CommandOutput', command('boom', true))).text).toBe('ENGINE')
})

test('text the elements cannot hold keeps the engine drawing', async ($, on) => {
  for (const component of ['UserMessage', 'AssistantMessage', 'CommandOutput']) engine(on, component)
  for (const bad of ['y'.repeat(10_001), 'progress\r50%', 'ansi \u001b[31mred']) {
    expect((await draw($, 'UserMessage', prompt(bad))).text).toBe('ENGINE')
    expect((await draw($, 'AssistantMessage', reply(bad, true))).text).toBe('ENGINE')
    expect((await draw($, 'CommandOutput', command(bad))).text).toBe('ENGINE')
  }
})

test('transcript off returns next(e)', { options: { transcript: false } }, async ($, on) => {
  for (const component of ['UserMessage', 'AssistantMessage', 'CommandOutput']) engine(on, component)
  expect((await draw($, 'UserMessage', prompt('hi'))).text).toBe('ENGINE')
  expect((await draw($, 'AssistantMessage', reply('hi', true))).text).toBe('ENGINE')
  expect((await draw($, 'CommandOutput', command('hi'))).text).toBe('ENGINE')
})

test('prompts and reply blocks keep a blank line above them', async ($, on) => {
  const top = async (component: any, props: any) => {
    const ui = await $.ui.mount({ plugin: 'ccshine', surface: 'terminal', component, props })
    const [root] = await ui.findAll({ type: 'Box' })
    await ui.unmount()
    return root?.props.marginTop
  }
  expect(await top('UserMessage', prompt('hi'))).toBe(1)
  expect(await top('AssistantMessage', reply('first', true))).toBe(1)
  expect(await top('AssistantMessage', reply('later', false))).toBe(1)
})
