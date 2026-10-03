import { expect, mock, test } from 'claude-code/testing'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const

function engine(on: any) {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  on('turn.complete', () => ({ text: 'ok' }))
  return clock
}

const complete = ($: any, turnId: string, cacheRead: number, cacheWrite: number) =>
  $.turn.complete({
    answer: 'ok', durationMs: 1000, isAborted: false, turnId, reason: 'answer',
    usage: { model: 'm', input_tokens: 1000, output_tokens: 1200, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite },
  })

const textOf = async ($: any) => {
  const ui = await $.ui.mount({ plugin: 'terminal-plus', surface: 'terminal', ...BAND })
  const text = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
  await ui.unmount()
  return text
}

test('usage line shows last turn tokens, cache rate and time left', async ($, on) => {
  const clock = engine(on)
  await clock.advance(1000)
  await complete($, 't1', 91_000, 8000)
  await clock.advance(8 * 60_000)
  const text = await textOf($)
  expect(text).toContain('Usage')
  expect(text).toContain('101.2k last turn')
  expect(text).toContain('cache 91%')
  expect(text).toContain('warm 52m')
  expect(text).not.toContain('cold')
})

test('cold warning appears only after a cold turn', async ($, on) => {
  const clock = engine(on)
  await clock.advance(1000)
  await complete($, 't1', 50_000, 1000)
  expect(await textOf($)).not.toContain('⚠')
  await clock.advance(2 * 60 * 60_000)
  await complete($, 't2', 2000, 41_000)
  expect(await textOf($)).toContain('⚠ cache was cold · this turn re-sent 41.0k at full price')
})

test('usage off and no plan returns next(e)', { options: { usage: false } }, async ($, on) => {
  const clock = engine(on)
  on('ui.render', { component: 'AbovePrompt' }, ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>ENGINE</Text>
  })
  await clock.advance(1000)
  await complete($, 't1', 91_000, 8000)
  expect(await textOf($)).toBe('ENGINE')
})
