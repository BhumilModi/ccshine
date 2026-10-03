import { expect, mock, test } from 'claude-code/testing'

function engine(on: any) {
  mock.clock(on)
  const played: string[] = []
  const toasts: string[] = []
  on('audio.play', (_$: unknown, e: { clip: { asset?: string } }) => {
    played.push(String(e.clip.asset))
    return { value: undefined }
  })
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: 'ok' }))
  on('classic.Notification', () => ({}))
  return { played, toasts }
}

const turn = (durationMs: number, extra: Record<string, unknown> = {}) => ({
  answer: 'ok', durationMs, isAborted: false, turnId: 't', reason: 'answer' as const, ...extra,
})

test('long main turn plays done.wav and toasts', async ($, on) => {
  const { played, toasts } = engine(on)
  await $.turn.complete(turn(45_000))
  expect(played).toEqual(['sounds/done.wav'])
  expect(toasts).toEqual(['Claude finished · 45.0s'])
})

test('short turn plays nothing', async ($, on) => {
  const { played } = engine(on)
  await $.turn.complete(turn(5000))
  expect(played).toEqual([])
})

test('subagent turn plays nothing', async ($, on) => {
  const { played } = engine(on)
  await $.turn.complete(turn(90_000, { agentId: 'a1' }))
  expect(played).toEqual([])
})

test('aborted turn plays nothing', async ($, on) => {
  const { played } = engine(on)
  await $.turn.complete(turn(90_000, { isAborted: true, reason: 'aborted' }))
  expect(played).toEqual([])
})

test('notification plays attention.wav and toasts its message', async ($, on) => {
  const { played, toasts } = engine(on)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  expect(played).toEqual(['sounds/attention.wav'])
  expect(toasts).toEqual(['Claude needs your permission to use Bash'])
})

test('alerts off plays nothing', { options: { alerts: false } }, async ($, on) => {
  const { played } = engine(on)
  await $.turn.complete(turn(90_000))
  await $.classic.Notification({ message: 'x', notification_type: 'idle_prompt' })
  expect(played).toEqual([])
})

test('a long turn that ended in an API error still alerts', async ($, on) => {
  const { played, toasts } = engine(on)
  await $.turn.complete(turn(120_000, { reason: 'error' }))
  expect(played).toEqual(['sounds/done.wav'])
  expect(toasts).toEqual(['Claude stopped on an error · 2m 00s'])
})

test('idle reminders do not chime again', async ($, on) => {
  const { played } = engine(on)
  await $.classic.Notification({ message: 'Claude is waiting for your input', notification_type: 'idle_prompt' })
  expect(played).toEqual([])
})
