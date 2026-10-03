import { expect, mock, test } from 'claude-code/testing'

const LINE = (durationMs: number) => ({ component: 'TurnDuration', props: { word: 'Baked', durationMs } }) as const

function engineLine(on: any) {
  on('ui.render', { component: 'TurnDuration' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>{`${e.props.word} for ${e.props.durationMs}`}</Text>
  })
}

async function oneTurn($: any, clock: any) {
  const pending = $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'b1' })
  await clock.advance(3000)
  await pending
  await clock.advance(1000)
  await $.turn.complete({
    answer: 'ok', durationMs: 4000, isAborted: false, turnId: 't1', reason: 'answer',
    usage: { model: 'm', input_tokens: 1000, output_tokens: 1200, cache_read_input_tokens: 91_000, cache_creation_input_tokens: 8000 },
  })
}

function engine(on: any) {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  engineLine(on)
  on('tool.call', { tool: 'Bash' }, async () => {
    await clock.sleep(3000)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('turn.complete', () => ({ text: 'ok' }))
  return clock
}

test('receipt shows duration, timeline, tokens and cache rate', async ($, on) => {
  const clock = engine(on)
  await oneTurn($, clock)
  const ui = await $.ui.mount({ plugin: 'terminal-plus', surface: 'terminal', ...LINE(4000) })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(text).toContain('4.0s')
  expect(text).toContain('101.2k tokens · cache 91%')
  expect(text).toContain('Bash 3s · thinking 1s')
  expect(text).toContain('▇')
})

test('TurnDuration with no matching record returns next(e)', async ($, on) => {
  const clock = engine(on)
  await oneTurn($, clock)
  const ui = await $.ui.mount({ plugin: 'terminal-plus', surface: 'terminal', ...LINE(1234) })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['Baked for 1234'])
})

test('receipt off returns next(e)', { options: { receipt: false } }, async ($, on) => {
  const clock = engine(on)
  await oneTurn($, clock)
  const ui = await $.ui.mount({ plugin: 'terminal-plus', surface: 'terminal', ...LINE(4000) })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual(['Baked for 4000'])
})
