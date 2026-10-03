import { expect, test } from 'claude-code/testing'

import { render } from '../statusline/render.mjs'

// Captured from Claude Code 2.1.288 (ids and paths anonymised); same as statusline/fixtures/sample.json.
const SAMPLE = {
  cwd: '/home/user/projects/demo-app',
  model: { id: 'claude-haiku-4-5-20251001', display_name: 'Haiku 4.5' },
  workspace: { current_dir: '/home/user/projects/demo-app', project_dir: '/home/user/projects/demo-app', added_dirs: [] },
  version: '2.1.288',
  cost: { total_cost_usd: 0.0325673, total_duration_ms: 12836, total_api_duration_ms: 3000, total_lines_added: 0, total_lines_removed: 0 },
  context_window: {
    total_input_tokens: 43754, total_output_tokens: 187, context_window_size: 200000,
    current_usage: { input_tokens: 10, output_tokens: 187, cache_creation_input_tokens: 14341, cache_read_input_tokens: 29403 },
    used_percentage: 22, remaining_percentage: 78,
  },
  rate_limits: { five_hour: { used_percentage: 40, resets_at: 1791051000 }, seven_day: { used_percentage: 68, resets_at: 1791194400 } },
  prompt_cache: { warm: true, ttl: '1h', expires_at: 1791048934, misses: 0, hit_ratio: 0.67 },
}

// 52 minutes before the cache expires: 1h 26m before the five-hour window resets, 1d 17h before the weekly one.
const NOW = 1791048934 * 1000 - 52 * 60_000
const OPTS = { theme: 'claude', powerline: false, columns: 200, now: NOW }
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const crit = '\x1b[38;2;236;112;112m'

test('renders model, folder, context and cache from the captured sample', async () => {
  const [line1, line2] = plain(render(SAMPLE, OPTS)).split('\n')
  expect(line1).toContain(' Haiku 4.5 ')
  expect(line1).toContain(' demo-app ')
  expect(line1).toContain('ctx ━━╸─────────')
  expect(line1).toContain('22% 44k/200k')
  expect(line1).toContain('warm 52m')
  expect(line2).toContain('Session 40% · resets 1h 26m')
  expect(line2).toContain('Weekly 68% · resets 1d 17h')
})

test('context at 85% uses crit colour', async () => {
  const input = { ...SAMPLE, context_window: { ...SAMPLE.context_window, used_percentage: 85 } }
  expect(render(input, OPTS)).toContain(`${crit} 85%`)
})

test('missing rate_limits shows session cost', async () => {
  const { rate_limits: _gone, ...input } = SAMPLE
  const [, line2] = plain(render(input, OPTS)).split('\n')
  expect(line2).toContain('Session $0.03')
})

test('null used_percentage and missing prompt_cache render without NaN or undefined', async () => {
  const input = {
    model: { display_name: 'Opus 5.5' },
    context_window: { context_window_size: 200000, current_usage: null, used_percentage: null },
  }
  const out = plain(render(input, OPTS))
  expect(out).toContain('Opus 5.5')
  expect(out.includes('NaN') || out.includes('undefined') || out.includes('null')).toBe(false)
  expect(plain(render({}, OPTS)).includes('undefined')).toBe(false)
})

test('git segment shows branch, +2 ?1 ↑1', async () => {
  const out = plain(render(SAMPLE, OPTS, { branch: 'main', dirty: 2, untracked: 1, ahead: 1, behind: 0 }))
  expect(out).toContain(' main +2 ?1 ↑1 ')
})

test('no git leaves no git segment', async () => {
  expect(plain(render(SAMPLE, OPTS)).includes('main')).toBe(false)
})

test('drops right-most line-1 segments to fit 50 columns', async () => {
  const [line1] = plain(render(SAMPLE, { ...OPTS, columns: 50 }, { branch: 'feature/long-branch-name', dirty: 3, untracked: 0, ahead: 0, behind: 2 })).split('\n')
  expect([...(line1 ?? '')].length).toBeLessThanOrEqual(50)
  expect(line1).toContain('Haiku 4.5')
})

test('powerline off uses no private-use glyphs; on uses them', async () => {
  expect(/[]/.test(render(SAMPLE, OPTS))).toBe(false)
  expect(render(SAMPLE, { ...OPTS, powerline: true })).toContain('')
})

test('cold cache shows cold in crit', async () => {
  const out = render(SAMPLE, { ...OPTS, now: 1791048934 * 1000 + 1000 })
  expect(out).toContain(`${crit} cold `)
})
