import { expect, test } from 'claude-code/testing'

import { pickConfigKey } from '../statusline/config.mjs'

test('statusline config falls back to a ccshine key', async () => {
  expect(pickConfigKey(['other', 'ccshine@x'])).toBe('ccshine@x')
  expect(pickConfigKey(['ccshine'])).toBe('ccshine')
  expect(pickConfigKey(['other'])).toBeUndefined()
})

test('statusline config prefers the tidepool key', async () => {
  expect(pickConfigKey(['ccshine@x', 'tidepool@y'])).toBe('tidepool@y')
  expect(pickConfigKey(['tidepool', 'ccshine'])).toBe('tidepool')
})

function engine(on: any, command: string, names: string[] = []) {
  const toasts: string[] = []
  on('env.get', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: true }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'Darwin\n', stderr: '' } }))
  on('ui.toast', (_$: unknown, e: { text: string }) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('settings.read', () => ({ value: { statusLine: { type: 'command', command } } }))
  on('config.list', () => ({ value: [] }))
  on('command.register', (_$: unknown, e: { name: string }) => {
    names.push(e.name)
    return { value: { command: e.name, agent: '' } }
  })
  on('session.start', () => ({ cwd: '/repo' }))
  return toasts
}

const start = ($: any) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

test('startup toasts when settings still point at ccshine-statusline.mjs', async ($, on) => {
  const toasts = engine(on, 'node /old/ccshine/statusline/ccshine-statusline.mjs')
  await start($)
  expect(toasts.some(t => t.includes('/tidepool-statusline'))).toBe(true)
})

test('startup registers the tidepool commands', async ($, on) => {
  const names: string[] = []
  engine(on, '', names)
  await start($)
  expect(names).toContain('tidepool-statusline')
  expect(names).toContain('tidepool-setup')
})
