import { expect, mock, test } from 'claude-code/testing'

import { imageNumbers, imagePaths } from '../hooks/images'

const text = (t: string) => ({ type: 'text', text: t })
const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: '' } }

test('imagePaths pairs each prompt\'s image numbers with the source paths that follow it', async () => {
  const messages = [
    { role: 'user', content: [text('look at [Image #7] and [Image #8]'), image, image] },
    { role: 'user', content: [text('[Image: source: /a/x.png]'), text('[Image: source: /b/y z.png]')] },
    { role: 'assistant', content: [text('ok')] },
    { role: 'user', content: [text('and [Image #9]'), image, text('[Image: source: /c/w.png]')] },
  ]
  expect(imagePaths(messages)).toEqual({ 7: '/a/x.png', 8: '/b/y z.png', 9: '/c/w.png' })
})

test('an image pasted with no source path gets no entry', async () => {
  expect(imagePaths([{ role: 'user', content: [text('see [Image #3]'), image] }, { role: 'user', content: 'thanks' }])).toEqual({})
})

test('imageNumbers reads a prompt row\'s placeholders in order', async () => {
  expect(imageNumbers('[Image #7] , and [Image #12]')).toEqual([7, 12])
  expect(imageNumbers('no images')).toEqual([])
})

const row = { plugin: 'tidepool', surface: 'terminal', component: 'UserMessage', props: { text: 'what happened? [Image #10]', origin: { kind: 'composer' }, isExpanded: false }, viewport: { columns: 100, rows: 40 } } as const

test('a prompt with an image draws an open line that opens the file', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.root', () => ({ value: '/repo' }))
  on('session.usage', () => ({ value: { startedAt: 1, context: { window: 1, percent: 1 }, rateLimits: [], cost: { usd: 0 } } }))
  on('turn.start', (_$: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('session.messages', () => ({ value: [{ role: 'user', content: [text('what happened? [Image #10]'), image] }, { role: 'user', content: [text('[Image: source: /tmp/shots/Screenshot 1.png]')] }] }))
  const ran: string[][] = []
  on('process.run', (_$: unknown, e: { argv: readonly string[] }) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } as never }
  })
  await $.turn.start({ text: 'what happened? [Image #10]', turnId: 't1' })
  const ui = await $.ui.mount(row)
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
  expect(texts).toContain('Screenshot 1.png')
  const open = await ui.find({ type: 'Button', key: 'img:10' })
  expect(open?.text).toContain('open ↗')
  await ui.press({ key: 'img:10' })
  expect(ran).toContainEqual(['open', '/tmp/shots/Screenshot 1.png'])
})

test('a prompt whose image has no known path draws no open line', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount(row)
  expect(await ui.find({ type: 'Button', key: 'img:10' })).toBeUndefined()
})
