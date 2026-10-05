import { expect, test } from 'claude-code/testing'

test('command prints the settings line with the plugin root', async ($, on) => {
  on('session.root', () => ({ value: '/repo' }))
  const { text } = await $.command.run({ command: 'tidepool-statusline', args: '' } as never)
  expect(text).toContain('"statusLine"')
  expect(text).toContain('"type": "command"')
  expect(text).toMatch(/"command": "node \\"\/.+\/statusline\/tidepool-statusline\.mjs\\""/)
  expect(text).toContain('settings.json')
})

test('a status line pointing at an old ccshine install gets a nudge', async ($, on) => {
  const toasts: string[] = []
  on('settings.read', () => ({ value: { statusLine: { type: 'command', command: 'node "/old/cache/ccshine/0.0.9/statusline/tidepool-statusline.mjs"' } } }))
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'tidepool-statusline', agent: '' } }))
  // Session start also installs the bundled font: never let a test run real commands.
  on('process.run', () => {
    throw new Error('no host commands in tests')
  })
  on('env.get', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/repo' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(toasts).toEqual(['Tidepool was updated: run /tidepool-statusline and paste the new statusLine path'])
})

test('a current or unrelated status line gets no nudge', async ($, on) => {
  const toasts: string[] = []
  on('settings.read', () => ({ value: { statusLine: { type: 'command', command: 'ccstatusline' } } }))
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'tidepool-statusline', agent: '' } }))
  // Session start also installs the bundled font: never let a test run real commands.
  on('process.run', () => {
    throw new Error('no host commands in tests')
  })
  on('env.get', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/repo' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  expect(toasts).toEqual([])
})
