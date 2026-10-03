import { expect, test } from 'claude-code/testing'

test('command prints the settings line with the plugin root', async ($, on) => {
  on('session.root', () => ({ value: '/repo' }))
  const { text } = await $.command.run({ command: 'ccshine-statusline', args: '' } as never)
  expect(text).toContain('"statusLine"')
  expect(text).toContain('"type": "command"')
  expect(text).toMatch(/"command": "node \\"\/.+\/statusline\/ccshine-statusline\.mjs\\""/)
  expect(text).toContain('settings.json')
})

test('a status line pointing at an old ccshine install gets a nudge', async ($, on) => {
  const toasts: string[] = []
  on('settings.read', () => ({ value: { statusLine: { type: 'command', command: 'node "/old/cache/ccshine/0.0.9/statusline/ccshine-statusline.mjs"' } } }))
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'ccshine-statusline', agent: '' } }))
  on('session.start', () => ({ cwd: '/repo' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(toasts).toEqual(['ccshine was updated: run /ccshine-statusline and paste the new statusLine path'])
})

test('a current or unrelated status line gets no nudge', async ($, on) => {
  const toasts: string[] = []
  on('settings.read', () => ({ value: { statusLine: { type: 'command', command: 'ccstatusline' } } }))
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'ccshine-statusline', agent: '' } }))
  on('session.start', () => ({ cwd: '/repo' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(toasts).toEqual([])
})
