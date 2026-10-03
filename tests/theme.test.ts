import { expect, test } from 'claude-code/testing'

import { palettes as sharedPalettes } from '../hooks/palettes.mjs'
import { palettes } from '../hooks/theme'

const KEYS = ['accent', 'onAccent', 'seg', 'segAlt', 'ink', 'soft', 'mid', 'faint', 'track', 'warn', 'crit', 'info']

test('palettes all define every Palette key', async () => {
  for (const [name, palette] of Object.entries(palettes)) {
    expect([name, Object.keys(palette).sort()]).toEqual([name, [...KEYS].sort()])
    for (const value of Object.values(palette)) expect(value).toMatch(/^#[0-9A-F]{6}$/)
  }
})

test('mono palette uses no accent hue', async () => {
  expect(palettes.mono.accent).toBe(palettes.mono.ink)
})

test('theme palettes are the shared palette file', async () => {
  expect(palettes).toBe(sharedPalettes)
})
