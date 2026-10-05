import { expect, test } from 'claude-code/testing'

import { FONT_FILES, isWindowsRoot, setupGuide, unixTargets, windowsInstallScript } from '../hooks/setup'

test('windows roots are told apart from posix roots', async () => {
  expect(isWindowsRoot('C:\\Users\\a\\.claude\\plugins\\ccshine')).toBe(true)
  expect(isWindowsRoot('D:/plugins/ccshine')).toBe(true)
  expect(isWindowsRoot('/Users/a/.claude/mods/ccshine')).toBe(false)
})

test('macOS targets keep spaces in the home path', async () => {
  expect(unixTargets('Darwin', { HOME: '/Users/Jane Doe' })).toEqual({
    fontDir: '/Users/Jane Doe/Library/Fonts',
    themeDir: '/Users/Jane Doe/.config/ghostty/themes',
  })
})

test('linux targets follow XDG folders when set', async () => {
  expect(unixTargets('Linux', { HOME: '/home/a' })).toEqual({ fontDir: '/home/a/.local/share/fonts', themeDir: '/home/a/.config/ghostty/themes' })
  expect(unixTargets('Linux', { HOME: '/home/a', XDG_DATA_HOME: '/data', XDG_CONFIG_HOME: '/conf' })).toEqual({
    fontDir: '/data/fonts',
    themeDir: '/conf/ghostty/themes',
  })
})

test('no HOME means no targets', async () => {
  expect(unixTargets('Darwin', {})).toBeUndefined()
})

test('windows script quotes paths as literals and registers every font', async () => {
  const script = windowsInstallScript("C:\\Users\\O'Brien\\.claude\\ccshine")
  expect(script).toContain("'C:\\Users\\O''Brien\\.claude\\ccshine\\fonts'")
  expect(script).toContain('HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')
  for (const font of FONT_FILES) {
    expect(script).toContain(`'${font.registryName}'`)
    expect(script).toContain(`copied ${font.file}`)
  }
  expect(FONT_FILES.map(f => f.registryName)).toEqual([
    'Maple Mono NF (TrueType)',
    'Maple Mono NF Italic (TrueType)',
    'Maple Mono NF Bold (TrueType)',
    'Maple Mono NF Bold Italic (TrueType)',
  ])
})

test('setup guide names the font, every terminal and absolute theme paths', async () => {
  const guide = setupGuide('/Users/a/ccshine', ['MapleMono-NF-Regular.ttf'])
  expect(guide).toContain('Maple Mono NF')
  for (const terminal of ['Ghostty', 'iTerm2', 'Windows Terminal', 'kitty', 'WezTerm', 'Alacritty']) expect(guide).toContain(terminal)
  expect(guide).toContain('/Users/a/ccshine/themes/iterm2/Warm Claude.itermcolors')
  expect(guide).toContain('MapleMono-NF-Regular.ttf')
  expect(setupGuide('C:\\ccshine', [])).toContain('C:\\ccshine\\themes\\windows-terminal\\warm-claude.json')
  expect(setupGuide('C:\\ccshine', [])).toContain('already installed')
})
