import { expect, mock, test } from 'claude-code/testing'

const SPINNER = { component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' } } as const

function engineSpinner(on: any) {
  on('ui.render', { component: 'Spinner' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>{e.props.message ?? e.props.word}</Text>
  })
}

test('spinner message reads Editing queue.ts while an Edit runs', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engineSpinner(on)
  on('tool.call', { tool: 'Edit' }, async () => {
    await clock.sleep(1000)
    return { result: {} as never }
  })
  const pending = $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/src/queue.ts', old_string: 'a', new_string: 'b' })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'terminal-plus', surface: 'terminal', ...SPINNER })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['Editing queue.ts'])
  await ui.unmount()
  await clock.advance(1000)
  await pending
})

test('spinner off returns next(e)', { options: { spinner: false } }, async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engineSpinner(on)
  on('tool.call', { tool: 'Read' }, async () => {
    await clock.sleep(1000)
    return { result: {} as never }
  })
  const pending = $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/a.ts' })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'terminal-plus', surface: 'terminal', ...SPINNER })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['Sauteing'])
  await clock.advance(1000)
  await pending
})
