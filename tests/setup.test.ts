import { expect, test } from 'claude-code/testing'

import { encodePowerShell, FONT_FILES, isWindowsRoot, setupGuide, unixTargets, windowsInstallScript } from '../hooks/setup'

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

const done = (copied: string[] = []) => ({ copied, failed: false, remote: false })

test('setup guide names the font, every terminal and absolute theme paths', async () => {
  const guide = setupGuide('/Users/a/ccshine', done(['MapleMono-NF-Regular.ttf']))
  expect(guide).toContain('Maple Mono NF')
  for (const terminal of ['Ghostty', 'iTerm2', 'Windows Terminal', 'kitty', 'WezTerm', 'Alacritty']) expect(guide).toContain(terminal)
  expect(guide).toContain('/Users/a/ccshine/themes/iterm2/Warm Claude.itermcolors')
  expect(guide).toContain('MapleMono-NF-Regular.ttf')
  expect(setupGuide('C:\\ccshine', done())).toContain('C:\\ccshine\\themes\\windows-terminal\\warm-claude.json')
})

test('windows script makes the fonts usable without signing out', async () => {
  const script = windowsInstallScript('C:\\ccshine')
  expect(script).toContain('AddFontResourceW')
  expect(script).toContain('SendMessageTimeout')
  expect(script).toContain('0x001D')
})

test('windows guide talks about the font only', async () => {
  const guide = setupGuide('C:\\ccshine', done())
  expect(guide).toContain('The Maple Mono NF font is already installed.')
  expect(guide).not.toContain('Warm Claude theme are already installed')
})

test('kitty and alacritty rows copy the file instead of pointing into the versioned install', async () => {
  for (const root of ['/Users/a/ccshine', 'C:\\Users\\Jane Doe\\ccshine']) {
    const guide = setupGuide(root, done())
    expect(guide).not.toContain(`include ${root}`)
    expect(guide).not.toContain(`import = ["${root}`)
    expect(guide).toContain('[general]')
    expect(guide).toContain("import = ['")
  }
})

test('a failed install is reported, not called already installed', async () => {
  const guide = setupGuide('/Users/a/ccshine', { copied: [], failed: true, remote: false })
  expect(guide).toContain('could not install')
  expect(guide).not.toContain('already installed')
})

test('a remote session says to install the font where the terminal runs', async () => {
  const guide = setupGuide('/home/a/ccshine', { copied: [], failed: false, remote: true })
  expect(guide).toContain('another machine')
  expect(guide).toContain('/home/a/ccshine/fonts')
})

test('powershell scripts are encoded as base64 UTF-16LE', async () => {
  expect(encodePowerShell('a')).toBe('YQA=')
  expect(encodePowerShell('dir')).toBe('ZABpAHIA')
  expect(encodePowerShell("'é'")).toBe('JwDpACcA')
})
