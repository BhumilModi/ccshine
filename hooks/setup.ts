// Where the bundled font and theme go on each system, and what /ccshine-setup prints. Pure: the hooks run the commands.

export const FONT_FILES = [
  { file: 'MapleMono-NF-Regular.ttf', registryName: 'Maple Mono NF (TrueType)' },
  { file: 'MapleMono-NF-Italic.ttf', registryName: 'Maple Mono NF Italic (TrueType)' },
  { file: 'MapleMono-NF-Bold.ttf', registryName: 'Maple Mono NF Bold (TrueType)' },
  { file: 'MapleMono-NF-BoldItalic.ttf', registryName: 'Maple Mono NF Bold Italic (TrueType)' },
] as const

export const FONT_FAMILY = 'Maple Mono NF'
export const GHOSTTY_THEME = 'Warm Claude'

// The plugin API has no platform field and Windows has no `uname`; an install path tells them apart.
export function isWindowsRoot(root: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(root) || root.includes('\\')
}

export function unixTargets(os: 'Darwin' | 'Linux', env: Record<string, string>): { fontDir: string; themeDir: string } | undefined {
  const home = env.HOME
  if (!home) return undefined
  const config = env.XDG_CONFIG_HOME || `${home}/.config`
  const data = env.XDG_DATA_HOME || `${home}/.local/share`
  return {
    fontDir: os === 'Darwin' ? `${home}/Library/Fonts` : `${data}/fonts`,
    themeDir: `${config}/ghostty/themes`,
  }
}

const literal = (text: string) => `'${text.replace(/'/g, "''")}'`

// Per-user install, no admin (Windows 10 1809+): copy into the user's font folder and register under HKCU.
// Prints `copied <file>` for each font it copied, which is how the hook knows what was installed.
export function windowsInstallScript(root: string): string {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `$src = ${literal(`${root.replace(/[\\/]+$/, '')}\\fonts`)}`,
    "$dir = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Fonts'",
    'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    "$reg = 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'",
    'if (-not (Test-Path -LiteralPath $reg)) { New-Item -Path $reg -Force | Out-Null }',
  ]
  for (const font of FONT_FILES) {
    lines.push(
      `$dst = Join-Path $dir ${literal(font.file)}`,
      `if (-not (Test-Path -LiteralPath $dst)) { Copy-Item -LiteralPath (Join-Path $src ${literal(font.file)}) -Destination $dst; ` +
        `New-ItemProperty -Path $reg -Name ${literal(font.registryName)} -Value $dst -PropertyType String -Force | Out-Null; ` +
        `'copied ${font.file}' }`,
    )
  }
  return lines.join('\n')
}

export function setupGuide(root: string, installed: readonly string[]): string {
  const sep = isWindowsRoot(root) ? '\\' : '/'
  const theme = (...parts: string[]) => `\`${[root.replace(/[\\/]+$/, ''), 'themes', ...parts].join(sep)}\``
  return [
    installed.length > 0
      ? `Installed: ${installed.join(', ')}.`
      : `The ${FONT_FAMILY} font and ${GHOSTTY_THEME} theme are already installed.`,
    '',
    `Pick **${FONT_FAMILY}** as your terminal's font (size 14, line height 1.2 suggested), then load the ${GHOSTTY_THEME} colours. On Windows, restart the terminal first so it sees the new font.`,
    '',
    '| Terminal | Font | Colours |',
    '|---|---|---|',
    `| Ghostty | \`font-family = ${FONT_FAMILY}\` | \`theme = ${GHOSTTY_THEME}\` (already in your Ghostty themes folder) |`,
    `| iTerm2 | Settings → Profiles → Text → Font | Profiles → Colors → Color Presets → Import ${theme('iterm2', 'Warm Claude.itermcolors')} |`,
    `| Windows Terminal | Profile → Appearance → Font face | Paste ${theme('windows-terminal', 'warm-claude.json')} into \`schemes\` in settings.json, then pick it |`,
    `| kitty | \`font_family ${FONT_FAMILY}\` | \`include ${theme('kitty', 'warm-claude.conf').slice(1, -1)}\` |`,
    `| WezTerm | \`font = wezterm.font '${FONT_FAMILY}'\` | Copy ${theme('wezterm', 'Warm Claude.toml')} into your \`colors\` folder, then \`color_scheme = '${GHOSTTY_THEME}'\` |`,
    `| Alacritty | \`font.normal.family = "${FONT_FAMILY}"\` | \`import = ["${theme('alacritty', 'warm-claude.toml').slice(1, -1)}"]\` |`,
    `| Others | Pick ${FONT_FAMILY} | The colours are in ${theme('warm-claude.json')} |`,
  ].join('\n')
}
