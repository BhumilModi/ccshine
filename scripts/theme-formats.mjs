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

// Warp's theme format; Orca and other apps that import Warp themes read it too.
function warp(t) {
  const block = (title, offset) => [`  ${title}:`, ...NAMES.map((name, i) => `    ${name}: '${t.palette[i + offset]}'`)]
  return [
    `name: ${t.name}`,
    `accent: '${t.cursor}'`,
    `cursor: '${t.cursor}'`,
    `background: '${t.background}'`,
    `foreground: '${t.foreground}'`,
    'details: darker',
    'terminal_colors:',
    ...block('normal', 0),
    ...block('bright', 8),
    '',
  ].join('\n')
}

// VS Code, Cursor and other VS Code-based editors: a block to merge into the user's settings.json.
function vscode(t) {
  const colours = {
    'terminal.background': t.background,
    'terminal.foreground': t.foreground,
    'terminalCursor.foreground': t.cursor,
    'terminalCursor.background': t.cursorText,
    'terminal.selectionBackground': t.selectionBackground,
    'terminal.selectionForeground': t.selectionForeground,
  }
  NAMES.forEach((name, i) => (colours[`terminal.ansi${name[0].toUpperCase()}${name.slice(1)}`] = t.palette[i]))
  NAMES.forEach((name, i) => (colours[`terminal.ansiBright${name[0].toUpperCase()}${name.slice(1)}`] = t.palette[i + 8]))
  return JSON.stringify({ 'workbench.colorCustomizations': colours }, null, 2) + '\n'
}

function json(t) {
  return JSON.stringify(t, null, 2) + '\n'
}

// Published path pattern → renderer. {name} is the theme's name, {slug} its kebab-case and {snake} its snake_case form.
export const FORMATS = {
  'themes/{slug}.json': json,
  'themes/ghostty/{name}': ghostty,
  'themes/iterm2/{name}.itermcolors': iterm2,
  'themes/windows-terminal/{slug}.json': windowsTerminal,
  'themes/kitty/{slug}.conf': kitty,
  'themes/wezterm/{name}.toml': wezterm,
  'themes/alacritty/{slug}.toml': alacritty,
  'themes/warp/{snake}.yaml': warp,
  'themes/vscode/{slug}.json': vscode,
}

export function themePath(pattern, name) {
  const words = name.toLowerCase().split(' ')
  return pattern.replace('{name}', name).replace('{slug}', words.join('-')).replace('{snake}', words.join('_'))
}

// The README's colour reference: one column per theme, one row per colour, for terminals with no theme file.
const SLOTS = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White']
export function colourTable(themes) {
  const rows = [
    ['Background', t => t.background],
    ['Text', t => t.foreground],
    ['Bold text', t => t.foreground],
    ['Cursor', t => t.cursor],
    ['Selection', t => t.selectionBackground],
    ...SLOTS.map((slot, i) => [`ANSI ${slot}`, t => t.palette[i]]),
    ...SLOTS.map((slot, i) => [`ANSI bright ${slot}`, t => t.palette[i + 8]]),
  ]
  return [
    `| Colour | ${themes.map(t => t.name).join(' | ')} |`,
    `|---|${themes.map(() => '---').join('|')}|`,
    ...rows.map(([label, pick]) => `| ${label} | ${themes.map(t => `\`${pick(t)}\``).join(' | ')} |`),
  ].join('\n')
}
