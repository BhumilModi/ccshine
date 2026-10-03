import { expect, test } from 'claude-code/testing'

import { parsePr, prKey, shouldRefresh } from '../statusline/pr.mjs'
import { render } from '../statusline/render.mjs'

const MIN = 60_000
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const fgOf = (hex: string) => `\x1b[38;2;${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(';')}m`

test('parsePr reads number and state, draft wins over open', async () => {
  expect(parsePr('{"number":5,"state":"MERGED","isDraft":false}')).toEqual({ number: 5, state: 'MERGED' })
  expect(parsePr('{"number":12,"state":"OPEN","isDraft":true}')).toEqual({ number: 12, state: 'DRAFT' })
  expect(parsePr('{"number":3,"state":"CLOSED","isDraft":false}')).toEqual({ number: 3, state: 'CLOSED' })
})

test('parsePr returns null for no PR or junk', async () => {
  expect(parsePr('')).toBeNull()
  expect(parsePr('no pull requests found for branch "x"')).toBeNull()
  expect(parsePr('{"state":"OPEN"}')).toBeNull()
})

test('prKey is per folder and branch', async () => {
  expect(prKey('/repo', 'main')).not.toBe(prKey('/repo', 'feature'))
})

test('shouldRefresh when missing or older than 60s, not while a refresh is running', async () => {
  const now = 10 * MIN
  expect(shouldRefresh(undefined, now)).toBe(true)
  expect(shouldRefresh({ checkedAt: now - 30_000, pr: null }, now)).toBe(false)
  expect(shouldRefresh({ checkedAt: now - 61_000, pr: null }, now)).toBe(true)
  expect(shouldRefresh({ checkedAt: now - 5 * MIN, pr: null, refreshingAt: now - 10_000 }, now)).toBe(false)
  expect(shouldRefresh({ checkedAt: now - 5 * MIN, pr: null, refreshingAt: now - 31_000 }, now)).toBe(true)
})

const INPUT = { model: { display_name: 'Opus 5.5' }, workspace: { current_dir: '/home/u/app' }, context_window: { context_window_size: 200000, used_percentage: 30 } }
const OPTS = { theme: 'claude', powerline: false, columns: 200, now: 0 }
const GIT = { branch: 'main', dirty: 0, untracked: 0, ahead: 0, behind: 0 }

test('badge sits after the git segment with a colour per state', async () => {
  const merged = render(INPUT, OPTS, GIT, { number: 5, state: 'MERGED' })
  expect(plain(merged)).toContain(' main  #5 MERGED ')
  expect(merged).toContain(`${fgOf('#D97757')} #5 MERGED `)
  expect(render(INPUT, OPTS, GIT, { number: 7, state: 'OPEN' })).toContain(`${fgOf('#7AA2F7')} #7 OPEN `)
  expect(render(INPUT, OPTS, GIT, { number: 8, state: 'DRAFT' })).toContain(`${fgOf('#92979F')} #8 DRAFT `)
  expect(render(INPUT, OPTS, GIT, { number: 9, state: 'CLOSED' })).toContain(`${fgOf('#EC7070')} #9 CLOSED `)
})

test('no PR draws no badge', async () => {
  expect(plain(render(INPUT, OPTS, GIT, null)).includes('#')).toBe(false)
  expect(plain(render(INPUT, OPTS, GIT)).includes('#')).toBe(false)
})

test('on a narrow terminal the badge drops before the context meter', async () => {
  const full = plain(render(INPUT, OPTS, GIT, { number: 5, state: 'MERGED' })).split('\n')[0] ?? ''
  const [line1] = plain(render(INPUT, { ...OPTS, columns: [...full].length - 2 }, GIT, { number: 5, state: 'MERGED' })).split('\n')
  expect(line1).not.toContain('#5')
  expect(line1).toContain('ctx')
})
