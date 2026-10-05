import { expect, test } from 'claude-code/testing'

import { palettes, terminalNames } from '../hooks/palettes.mjs'
import { FORMATS, themePath } from '../scripts/theme-formats.mjs'
import { terminalThemes } from '../themes/terminal.mjs'

const warmClaude = terminalThemes.warm
const bare = (hex: string) => hex.slice(1).toLowerCase()

test('every palette has a terminal theme with 16 colours, named as the palette says', async () => {
  expect(Object.keys(terminalThemes).sort()).toEqual(Object.keys(palettes).sort())
  for (const [id, theme] of Object.entries(terminalThemes)) {
    expect(theme.name).toBe(terminalNames[id as keyof typeof terminalNames])
    expect(theme.palette).toHaveLength(16)
    for (const hex of [theme.background, theme.foreground, theme.cursor, ...theme.palette]) expect([id, hex]).toEqual([id, expect.stringMatching(/^#[0-9A-F]{6}$/)])
  }
})

test('each terminal background is its palette\'s onAccent, so the rail paints the terminal colour', async () => {
  for (const [id, theme] of Object.entries(terminalThemes)) expect([id, theme.background]).toEqual([id, palettes[id as keyof typeof palettes].onAccent])
})

test('every text theme file carries its theme\'s colours', async () => {
  for (const theme of Object.values(terminalThemes)) {
    for (const [pattern, render] of Object.entries(FORMATS)) {
      if (pattern.endsWith('.itermcolors') || pattern.endsWith('.terminal')) continue
      const out = render(theme).toLowerCase()
      for (const hex of [theme.background, theme.foreground, ...theme.palette]) expect([theme.name, pattern, out.includes(bare(hex))]).toEqual([theme.name, pattern, true])
    }
  }
})

test('theme paths spell the name per format', async () => {
  expect(themePath('themes/ghostty/{name}', 'Tidepool Nord')).toBe('themes/ghostty/Tidepool Nord')
  expect(themePath('themes/kitty/{slug}.conf', 'Tidepool Nord')).toBe('themes/kitty/tidepool-nord.conf')
  expect(themePath('themes/warp/{snake}.yaml', 'Warm Claude')).toBe('themes/warp/warm_claude.yaml')
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

// A .terminal profile keeps each colour as a base64 NSKeyedArchiver archive; check the sRGB components inside.
test('macOS Terminal profile archives every colour in sRGB, and the font', async () => {
  const render = FORMATS['themes/terminal-app/{name}.terminal']!
  for (const theme of Object.values(terminalThemes)) {
    const out = render(theme)
    expect(out).toContain(`<string>${theme.name}</string>`)
    const field = (key: string) => atob(out.split(`<key>${key}</key>\n\t<data>`)[1]!.split('</data>')[0]!)
    const components = (key: string) => atob(field(key).split('<key>NSComponents</key><data>')[1]!.split('</data>')[0]!)
    const srgb = (hex: string) => [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16))).join(' ')
    const back = (key: string) => components(key).split(' ').slice(0, 3).map(x => Math.round(Number(x) * 255)).join(' ')
    expect(back('BackgroundColor')).toBe(srgb(theme.background))
    expect(back('TextColor')).toBe(srgb(theme.foreground))
    expect(back('ANSIRedColor')).toBe(srgb(theme.palette[1]!))
    expect(back('ANSIBrightWhiteColor')).toBe(srgb(theme.palette[15]!))
    expect(field('BackgroundColor')).toContain('<key>NSID</key><integer>7</integer>')
    expect(field('Font')).toContain('<string>MapleMono-NF-Regular</string>')
  }
})
