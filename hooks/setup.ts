// Where the bundled font and theme go on each system, and what /tidepool-setup prints. Pure: the hooks run the commands.
import { terminalNames } from './palettes.mjs'

export const FONT_FILES = [
  { file: 'MapleMono-NF-Regular.ttf', registryName: 'Maple Mono NF (TrueType)' },
  { file: 'MapleMono-NF-Italic.ttf', registryName: 'Maple Mono NF Italic (TrueType)' },
  { file: 'MapleMono-NF-Bold.ttf', registryName: 'Maple Mono NF Bold (TrueType)' },
  { file: 'MapleMono-NF-BoldItalic.ttf', registryName: 'Maple Mono NF Bold Italic (TrueType)' },
] as const

export const FONT_FAMILY = 'Maple Mono NF'
// Every terminal theme Tidepool ships; the first start copies all the Ghostty ones.
export const TERMINAL_THEMES: readonly string[] = Object.values(terminalNames)

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
    // Windows only picks up a new per-user font at the next sign-in unless it is added to the session and announced.
    // A locked-down PowerShell refuses Add-Type: the fonts are still copied and registered, and show up after sign-in.
    "try { Add-Type -Namespace Ccshine -Name Fonts -MemberDefinition '" +
      '[DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern int AddFontResourceW(string file); ' +
      '[DllImport("user32.dll")] public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint msg, System.UIntPtr wParam, System.IntPtr lParam, uint flags, uint timeout, out System.UIntPtr result);' +
      "'; $live = $true } catch { $live = $false }",
    '$added = 0',
  ]
  for (const font of FONT_FILES) {
    lines.push(
      `$dst = Join-Path $dir ${literal(font.file)}`,
      `if (-not (Test-Path -LiteralPath $dst)) { Copy-Item -LiteralPath (Join-Path $src ${literal(font.file)}) -Destination $dst; ` +
        `New-ItemProperty -Path $reg -Name ${literal(font.registryName)} -Value $dst -PropertyType String -Force | Out-Null; ` +
        `if ($live) { [void][Ccshine.Fonts]::AddFontResourceW($dst) }; $added++; 'copied ${font.file}' }`,
    )
  }
  // WM_FONTCHANGE (0x001D) to every top-level window, so running apps refresh their font lists.
  lines.push('if ($live -and $added -gt 0) { $r = [System.UIntPtr]::Zero; [void][Ccshine.Fonts]::SendMessageTimeout([System.IntPtr]0xffff, 0x001D, [System.UIntPtr]::Zero, [System.IntPtr]::Zero, 2, 1000, [ref]$r) }')
  return lines.join('\n')
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// `powershell -EncodedCommand` takes base64 of UTF-16LE, which no Windows argument quoting can mangle.
export function encodePowerShell(script: string): string {
  const bytes: number[] = []
  for (let i = 0; i < script.length; i++) {
    const unit = script.charCodeAt(i)
    bytes.push(unit & 0xff, unit >> 8)
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? '=' : B64[(n >> 6) & 63]!) + (c === undefined ? '=' : B64[n & 63]!)
  }
  return out
}

export type InstallOutcome = { copied: readonly string[]; failed: boolean; remote: boolean }

// A theme's file names, as scripts/theme-formats.mjs writes them: 'Tidepool Nord' → tidepool-nord, tidepool_nord.
function themeSlugs(name: string): { slug: string; snake: string } {
  const words = name.toLowerCase().split(' ')
  return { slug: words.join('-'), snake: words.join('_') }
}

export function setupGuide(root: string, outcome: InstallOutcome, name: string = terminalNames.warm): string {
  const { slug, snake } = themeSlugs(name)
  const windows = isWindowsRoot(root)
  const sep = windows ? '\\' : '/'
  const base = root.replace(/[\\/]+$/, '')
  const path = (...parts: string[]) => [base, ...parts].join(sep)
  const theme = (...parts: string[]) => `\`${path('themes', ...parts)}\``
  const status = outcome.remote
    ? `This session runs on another machine than your terminal (WSL or SSH), so Tidepool did not install the font here. Copy the files in \`${path('fonts')}\` to the machine your terminal runs on and install them there.`
    : outcome.failed
      ? `Tidepool could not install the font: \`claude --debug\` shows why. The files are in \`${path('fonts')}\`.`
      : outcome.copied.length > 0
        ? `Installed: ${outcome.copied.join(', ')}.`
        : windows
          ? `The ${FONT_FAMILY} font is already installed.`
          : `The ${FONT_FAMILY} font and ${name} theme are already installed.`
  return [
    status,
    '',
    `Pick **${FONT_FAMILY}** as your terminal's font (size 14, line height 1.0 so the block pixels touch), then load the ${name} colours. Restart the terminal first so it sees the new font.`,
    '',
    '| Terminal | Font | Colours |',
    '|---|---|---|',
    `| Ghostty | \`font-family = ${FONT_FAMILY}\` | \`theme = ${name}\` (on macOS and Linux it is already in your Ghostty themes folder) |`,
    `| iTerm2 | Settings → Profiles → Text → Font | Profiles → Colors → Color Presets → Import ${theme('iterm2', `${name}.itermcolors`)} |`,
    `| Windows Terminal | Profile → Appearance → Font face | Paste ${theme('windows-terminal', `${slug}.json`)} into \`schemes\` in settings.json, then pick it |`,
    `| kitty | \`font_family ${FONT_FAMILY}\` | Copy ${theme('kitty', `${slug}.conf`)} into your kitty config folder, then \`include ${slug}.conf\` |`,
    `| WezTerm | \`font = wezterm.font '${FONT_FAMILY}'\` | Copy ${theme('wezterm', `${name}.toml`)} into your \`colors\` folder, then \`color_scheme = '${name}'\` |`,
    `| Alacritty | \`font.normal.family = "${FONT_FAMILY}"\` | Copy ${theme('alacritty', `${slug}.toml`)} into your Alacritty config folder, then add \`[general]\` with \`import = ['<that copy's full path>']\` |`,
    `| Warp, and apps that import Warp themes (Orca: Terminal Themes → Import from YAML) | Settings → Appearance → Text | Import ${theme('warp', `${snake}.yaml`)}, or copy it into your Warp themes folder |`,
    `| VS Code, Cursor | \`"terminal.integrated.fontFamily": "${FONT_FAMILY}"\` and \`"terminal.integrated.minimumContrastRatio": 1\` in settings.json | Merge ${theme('vscode', `${slug}.json`)} into your user settings.json |`,
    `| macOS Terminal | Included in the profile | Double-click ${theme('terminal-app', `${name}.terminal`)}, then make the ${name} profile the Default in Settings → Profiles |`,
    `| JetBrains | Settings → Editor → Color Scheme → Console Font | No theme file: enter the colours from ${theme(`${slug}.json`)} under Console Colors |`,
    `| Others | Pick ${FONT_FAMILY} | The colours are in ${theme(`${slug}.json`)} |`,
    '',
    'Copies in your own config folders keep working after Tidepool updates; the install folder above changes with each version.',
    '',
    'For 24-bit colour under tmux, the full steps for each terminal and a setup check: https://github.com/BhumilModi/tidepool#set-up-your-terminal',
  ].join('\n')
}
