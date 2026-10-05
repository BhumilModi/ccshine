// One renderer per terminal's theme format. Pure: theme in, file text out.
const NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const WT_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white']
const bright = name => `bright${name[0].toUpperCase()}${name.slice(1)}`

function ghostty(t) {
  return [
    `background = ${t.background}`,
    `foreground = ${t.foreground}`,
    `cursor-color = ${t.cursor}`,
    `cursor-text = ${t.cursorText}`,
    `selection-background = ${t.selectionBackground}`,
    `selection-foreground = ${t.selectionForeground}`,
    ...t.palette.map((hex, i) => `palette = ${i}=${hex}`),
    '',
  ].join('\n')
}

function iterm2(t) {
  const colour = (key, hex) => {
    const [r, g, b] = [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(6))
    return [
      `\t<key>${key}</key>`,
      '\t<dict>',
      '\t\t<key>Alpha Component</key>\n\t\t<real>1</real>',
      `\t\t<key>Blue Component</key>\n\t\t<real>${b}</real>`,
      '\t\t<key>Color Space</key>\n\t\t<string>sRGB</string>',
      `\t\t<key>Green Component</key>\n\t\t<real>${g}</real>`,
      `\t\t<key>Red Component</key>\n\t\t<real>${r}</real>`,
      '\t</dict>',
    ].join('\n')
  }
  const entries = [
    ...t.palette.map((hex, i) => colour(`Ansi ${i} Color`, hex)),
    colour('Background Color', t.background),
    colour('Bold Color', t.foreground),
    colour('Cursor Color', t.cursor),
    colour('Cursor Text Color', t.cursorText),
    colour('Foreground Color', t.foreground),
    colour('Selected Text Color', t.selectionForeground),
    colour('Selection Color', t.selectionBackground),
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    ...entries,
    '</dict>',
    '</plist>',
    '',
  ].join('\n')
}

function windowsTerminal(t) {
  const scheme = {
    name: t.name,
    background: t.background,
    foreground: t.foreground,
    cursorColor: t.cursor,
    selectionBackground: t.selectionBackground,
  }
  WT_NAMES.forEach((name, i) => (scheme[name] = t.palette[i]))
  WT_NAMES.forEach((name, i) => (scheme[bright(name)] = t.palette[i + 8]))
  return JSON.stringify(scheme, null, 2) + '\n'
}

function kitty(t) {
  return [
    `# ${t.name}`,
    `background ${t.background}`,
    `foreground ${t.foreground}`,
    `cursor ${t.cursor}`,
    `cursor_text_color ${t.cursorText}`,
    `selection_background ${t.selectionBackground}`,
    `selection_foreground ${t.selectionForeground}`,
    ...t.palette.map((hex, i) => `color${i} ${hex}`),
    '',
  ].join('\n')
}

function wezterm(t) {
  const list = hexes => `[${hexes.map(h => `"${h}"`).join(', ')}]`
  return [
    '[colors]',
    `background = "${t.background}"`,
    `foreground = "${t.foreground}"`,
    `cursor_bg = "${t.cursor}"`,
    `cursor_fg = "${t.cursorText}"`,
    `cursor_border = "${t.cursor}"`,
    `selection_bg = "${t.selectionBackground}"`,
    `selection_fg = "${t.selectionForeground}"`,
    `ansi = ${list(t.palette.slice(0, 8))}`,
    `brights = ${list(t.palette.slice(8))}`,
    '',
    '[metadata]',
    `name = "${t.name}"`,
    '',
  ].join('\n')
}

function alacritty(t) {
  const block = (title, offset) => [`[colors.${title}]`, ...NAMES.map((name, i) => `${name} = "${t.palette[i + offset]}"`), '']
  return [
    `# ${t.name}`,
    '[colors.primary]',
    `background = "${t.background}"`,
    `foreground = "${t.foreground}"`,
    '',
    '[colors.cursor]',
    `cursor = "${t.cursor}"`,
    `text = "${t.cursorText}"`,
    '',
    '[colors.selection]',
    `background = "${t.selectionBackground}"`,
    `text = "${t.selectionForeground}"`,
    '',
    ...block('normal', 0),
    ...block('bright', 8),
  ].join('\n')
}

function json(t) {
  return JSON.stringify(t, null, 2) + '\n'
}

// Published path (under themes/) → renderer.
export const FORMATS = {
  'themes/warm-claude.json': json,
  'themes/ghostty/Warm Claude': ghostty,
  'themes/iterm2/Warm Claude.itermcolors': iterm2,
  'themes/windows-terminal/warm-claude.json': windowsTerminal,
  'themes/kitty/warm-claude.conf': kitty,
  'themes/wezterm/Warm Claude.toml': wezterm,
  'themes/alacritty/warm-claude.toml': alacritty,
}
