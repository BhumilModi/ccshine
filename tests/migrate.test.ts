import { expect, test } from 'claude-code/testing'

import { oldStore } from '../hooks/migrate'

test('oldStore picks the newest ccshine file', async () => {
  const entries = [
    { name: 'ccshine_a.json', mtimeMs: 1 },
    { name: 'ccshine_b.json', mtimeMs: 5 },
    { name: 'plan-eta_x.json', mtimeMs: 9 },
  ]
  expect(oldStore(entries)).toBe('ccshine_b.json')
  expect(oldStore([{ name: 'plan-eta_x.json', mtimeMs: 9 }])).toBeUndefined()
})

// Only the store migration runs: everything else session.start does is switched off or answered empty.
const OFF = { options: { installAssets: false, dock: false, chrome: false } }

function disk(on: any, list: () => unknown, stored: Record<string, unknown> = {}) {
  on('env.get', (_$: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/h' : undefined }))
  on('fs.list', (_$: unknown, e: { path: string }) => {
    expect(e.path).toBe('/h/.claude/plugins/store')
    return { value: list() }
  })
  on('fs.read', () => ({ value: JSON.stringify({ 'history-by-project': { '/repo': [60000] } }) }))
  on('store.get', (_$: unknown, e: { key: string }) => ({ value: stored[e.key] }))
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('settings.read', () => ({ value: {} }))
  on('command.register', (_$: unknown, e: { name: string }) => ({ value: { command: e.name, agent: '' } }))
  on('session.start', () => ({ cwd: '/repo' }))
  return stored
}

const start = ($: any) => $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
const FILE = [{ name: 'ccshine_inline-1.json', kind: 'file', size: 10, mtimeMs: 1, isLink: false }]

test('session start copies history-by-project from the ccshine store', OFF, async ($, on) => {
  const stored = disk(on, () => FILE)
  await start($)
  expect(stored['history-by-project']).toEqual({ '/repo': [60000] })
})

test('session start leaves an existing history alone', OFF, async ($, on) => {
  const stored = disk(on, () => FILE, { 'history-by-project': { '/mine': [1] } })
  await start($)
  expect(stored['history-by-project']).toEqual({ '/mine': [1] })
})

test('session start survives a missing store folder', OFF, async ($, on) => {
  const stored = disk(on, () => {
    throw new Error('ENOENT')
  })
  await start($)
  expect(stored['history-by-project']).toBeUndefined()
})
