import { expect, mock, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

type RowProps = { tool_use_id: string; tool: string; input: unknown; isErrored?: boolean }

function toolUse(props: RowProps) {
  return {
    component: 'ToolUse' as const,
    props: { isRunning: false, isErrored: false, isInterrupted: false, isFirstOfReply: false, ...props },
  }
}

const textOf = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')

test('Edit row shows icon, path, +2 −1 and 2s', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  on('tool.call', { tool: 'Edit' }, async () => {
    await clock.sleep(2000)
    return { result: { filePath: '/repo/src/a.ts' } as never }
  })
  const input = { file_path: '/repo/src/a.ts', old_string: 'x', new_string: 'y\nz' }
  const pending = $.tool.call({ tool: 'Edit', tool_use_id: 'e1', ...input })
  await clock.advance(2000)
  await pending
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'tidepool', surface, ...toolUse({ tool_use_id: 'e1', tool: 'Edit', input }) })
    const text = await textOf(ui)
    expect(text).toContain('◆ Edit src/a.ts')
    expect(text).toContain('+2 −1')
    expect(text).toContain('2s')
    await ui.unmount()
  }
})

test('row for a call the tracker never saw renders without duration', async ($, on) => {
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...toolUse({ tool_use_id: 'old', tool: 'Read', input: { file_path: '/repo/a.ts' } }) })
  const text = await textOf(ui)
  expect(text).toBe('◇ Read a.ts')
})

test('errored Bash row uses crit colour', { options: { theme: 'claude' } }, async ($, on) => {
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...toolUse({ tool_use_id: 'b1', tool: 'Bash', input: { command: 'false' }, isErrored: true }) })
  const icon = await ui.find({ type: 'Text', text: '✕' })
  expect(icon?.props.color).toBe('#EC7070')
})

test('mcp tool row equals next(e)', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...toolUse({ tool_use_id: 'm1', tool: 'mcp__linear__save_issue', input: {} }) })
  expect(await textOf(ui)).toBe('ENGINE')
})

test('tools off returns next(e)', { options: { tools: false } }, async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...toolUse({ tool_use_id: 'r1', tool: 'Read', input: { file_path: '/a' } }) })
  expect(await textOf(ui)).toBe('ENGINE')
})

test('tool group line lists tools with counts', async ($, on) => {
  mock.store(on)
  const calls = [
    { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
    { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
    { tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  ]
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
  expect(await textOf(ui)).toBe('◇ Read ×2  ❯ Bash')
})

test('a group containing an mcp tool is left to the engine', async ($, on) => {
  on('ui.render', { component: 'ToolGroup' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  const calls = [
    { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
    { tool: 'mcp__linear__list_issues', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  ]
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
  expect(await textOf(ui)).toBe('ENGINE')
})

test('group line truncates instead of wrapping', async ($, on) => {
  mock.store(on)
  const calls = [{ tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }]
  const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.every((t: any) => t.props.wrap === 'truncate-end')).toBe(true)
})

test('group names how many calls failed', async ($, on) => {
  mock.store(on)
  const bash = (isErrored: boolean) => ({ tool: 'Bash', input: {}, isRunning: false, isErrored, isInterrupted: false })
  const ui = await $.ui.mount({
    plugin: 'tidepool', surface: 'terminal', component: 'ToolGroup',
    props: { calls: [bash(false), bash(true), bash(false)], isActive: false, isExpanded: false },
  })
  // The line is one Text; its own text holds the coloured pieces nested in it.
  const text = (await ui.find({ type: 'Text' }))?.text
  expect(text).toBe('❯ Bash ×3  · 1 failed')
  expect(text).not.toContain('✕')
})

test('tool rows and groups keep a blank line above them', async ($, on) => {
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  const top = async (mounted: any) => {
    const ui = await $.ui.mount({ plugin: 'tidepool', surface: 'terminal', ...mounted })
    const [root] = await ui.findAll({ type: 'Box' })
    await ui.unmount()
    return root?.props.marginTop
  }
  expect(await top(toolUse({ tool_use_id: 'r1', tool: 'Read', input: { file_path: '/repo/a.ts' } }))).toBe(1)
  const calls = [{ tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }]
  expect(await top({ component: 'ToolGroup', props: { calls, isActive: false, isExpanded: false } })).toBe(1)
})
