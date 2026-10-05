import { expect, test } from 'claude-code/testing'

import { FORMATS } from '../scripts/theme-formats.mjs'
import { warmClaude } from '../themes/warm-claude.mjs'

const hexes = [warmClaude.background, warmClaude.foreground, ...warmClaude.palette]
const bare = (hex: string) => hex.slice(1).toLowerCase()

test('canonical theme has 16 palette colours', async () => {
  expect(warmClaude.palette).toHaveLength(16)
  for (const hex of hexes) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
})

test('every text theme file carries the canonical colours', async () => {
  for (const [path, render] of Object.entries(FORMATS)) {
    if (path.endsWith('.itermcolors')) continue
    const out = render(warmClaude).toLowerCase()
    for (const hex of hexes) expect([path, out.includes(bare(hex))]).toEqual([path, true])
  }
})

test('iterm2 file is a plist with every colour key', async () => {
  const path = Object.keys(FORMATS).find(p => p.endsWith('.itermcolors'))!
  const out = FORMATS[path]!(warmClaude)
  expect(out.startsWith('<?xml')).toBe(true)
  expect(out.trimEnd().endsWith('</plist>')).toBe(true)
  for (let i = 0; i < 16; i++) expect(out).toContain(`<key>Ansi ${i} Color</key>`)
  for (const key of ['Background Color', 'Foreground Color', 'Cursor Color', 'Cursor Text Color', 'Selection Color', 'Selected Text Color', 'Bold Color']) {
    expect(out).toContain(`<key>${key}</key>`)
  }
  // 1A1817 background: red component 26/255.
  expect(out).toContain((26 / 255).toFixed(6))
})

test('windows terminal scheme is valid JSON with named colours', async () => {
  const path = Object.keys(FORMATS).find(p => p.includes('windows-terminal'))!
  const scheme = JSON.parse(FORMATS[path]!(warmClaude))
  expect(scheme.name).toBe('Warm Claude')
  expect(scheme.background).toBe(warmClaude.background)
  expect(scheme.purple).toBe(warmClaude.palette[5])
  expect(scheme.brightWhite).toBe(warmClaude.palette[15])
})

test('warp theme is YAML with named normal and bright colours', async () => {
  const path = Object.keys(FORMATS).find(p => p.startsWith('themes/warp/'))!
  const out = FORMATS[path]!(warmClaude)
  expect(out).toContain('name: Warm Claude')
  expect(out).toContain(`background: '${warmClaude.background}'`)
  expect(out).toContain(`accent: '${warmClaude.cursor}'`)
  expect(out).toContain('terminal_colors:\n  normal:\n    black:')
  expect(out).toContain(`  bright:\n    black: '${warmClaude.palette[8]}'`)
  expect(out).toContain(`    magenta: '${warmClaude.palette[5]}'`)
})
