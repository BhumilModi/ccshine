import { expect, mock, test } from 'claude-code/testing'

import { imageNumbers, imagePaths } from '../hooks/images'
import { bmp, toBase64 } from './bmp'

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

// A screenshot name as macOS writes it: a narrow no-break space before AM.
const SHOT = '/tmp/shots/Screenshot 2026-10-08 at 2.18.38\u202fAM.png'

function world(on: any, terminal?: string) {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: e.name === 'TERM_PROGRAM' ? terminal : undefined }))
  // A queued prompt: no turn starts for it, the row finds its image in the conversation by itself.
  on('session.messages', () => ({ value: [{ role: 'user', content: [text('what happened? [Image #10]'), image] }, { role: 'user', content: [text(`[Image: source: ${SHOT}]`)] }] }))
  const ran: string[][] = []
  // macOS sips: a 400×200 image, shrunk to whatever size the thumbnail asks for.
  let made = { w: 0, h: 0 }
  on('process.run', (_$: unknown, e: { argv: readonly string[] }) => {
    ran.push([...e.argv])
    const argv = e.argv
    if (argv[0] === 'sips' && argv.includes('-g')) return { value: { exitCode: 0, stdout: `${argv.at(-1)}\n  pixelWidth: 400\n  pixelHeight: 200\n`, stderr: '' } as never }
    if (argv[0] === 'sips') {
      const at = argv.indexOf('--resampleHeightWidth')
      made = { h: Number(argv[at + 1]), w: Number(argv[at + 2]) }
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } as never }
  })
  on('fs.read', () => ({ value: { base64: toBase64(bmp(made.w, made.h, () => 0x336699)) } }))
  return ran
}

test('a prompt with an image draws an open line, even for a prompt queued into a running turn', async ($, on) => {
  world(on)
  const ui = await $.ui.mount(row)
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
  expect(texts).toContain('Screenshot 2026-10-08')
  expect((await ui.find({ type: 'Button', key: 'img:10' }))?.text).toContain('open ↗')
})

test('outside Orca, open hands the file to the system viewer', async ($, on) => {
  const ran = world(on, 'iTerm.app')
  const ui = await $.ui.mount(row)
  await ui.press({ key: 'img:10' })
  expect(ran).toContainEqual(['open', SHOT])
})

test('in Orca, open shows the image in an Orca browser tab beside the terminal', async ($, on) => {
  const ran = world(on, 'Orca')
  const ui = await $.ui.mount(row)
  await ui.press({ key: 'img:10' })
  expect(ran).toContainEqual(['orca', 'tab', 'create', '--url', 'file:///tmp/shots/Screenshot%202026-10-08%20at%202.18.38%E2%80%AFAM.png'])
  expect(ran.some(argv => argv[0] === 'open')).toBe(false)
})

test('a prompt whose image has no known path draws no open line', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.messages', () => ({ value: [{ role: 'user', content: [text('what happened? [Image #10]'), image] }] }))
  const ui = await $.ui.mount(row)
  expect(await ui.find({ type: 'Button', key: 'img:10' })).toBeUndefined()
})

test('an attached image draws a thumbnail under its line, and larger toggles a bigger one', async ($, on) => {
  world(on, 'Orca')
  const ui = await $.ui.mount(row)
  const sizes = async () => (await ui.findAll({ type: 'Raster' })).map((r: any) => [r.props.columns, r.props.rows])
  // 400×200 inside 40×10 cells: 40 wide, 10 tall (two pixels a cell).
  expect(await sizes()).toEqual([[40, 10]])
  expect((await ui.find({ type: 'Button', key: 'thumb:10' }))?.text).toContain('larger')
  await ui.press({ key: 'thumb:10' })
  const [big] = await sizes()
  expect(big![0]).toBeGreaterThan(40)
  expect((await ui.find({ type: 'Button', key: 'thumb:10' }))?.text).toContain('smaller')
})

test('without sips the line keeps open and draws no thumbnail', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.messages', () => ({ value: [{ role: 'user', content: [text('what happened? [Image #10]'), image] }, { role: 'user', content: [text(`[Image: source: ${SHOT}]`)] }] }))
  on('process.run', () => ({ value: { exitCode: 127, stdout: '', stderr: 'sips: not found' } as never }))
  const ui = await $.ui.mount(row)
  expect(await ui.findAll({ type: 'Raster' })).toEqual([])
  expect((await ui.find({ type: 'Button', key: 'img:10' }))?.text).toContain('open ↗')
})
