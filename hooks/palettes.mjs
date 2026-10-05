// Shared by the plugin's hooks (hooks/theme.ts) and the status line script (statusline/).
// Dark-terminal palettes. `seg`/`segAlt` are header backgrounds; the rest are text colours.
// Each palette has a matching terminal theme (themes/terminal.mjs) whose background is its `onAccent`.
export const palettes = {
  claude: {
    accent: '#D97757', onAccent: '#1A1B26', seg: '#2A2D35', segAlt: '#3A3E46', ink: '#DEE0E6', soft: '#B4B9C4',
    mid: '#92979F', faint: '#787D88', track: '#464A54', warn: '#E2B266', crit: '#EC7070', info: '#7AA2F7',
  },
  nord: {
    accent: '#88C0D0', onAccent: '#2E3440', seg: '#3B4252', segAlt: '#434C5E', ink: '#ECEFF4', soft: '#D8DEE9',
    mid: '#9AA5B8', faint: '#7B88A1', track: '#4C566A', warn: '#EBCB8B', crit: '#BF616A', info: '#81A1C1',
  },
  dracula: {
    accent: '#BD93F9', onAccent: '#282A36', seg: '#343746', segAlt: '#44475A', ink: '#F8F8F2', soft: '#E2E2DC',
    mid: '#A4A8C0', faint: '#7D85A8', track: '#4D5066', warn: '#F1FA8C', crit: '#FF5555', info: '#8BE9FD',
  },
  // Matches the Warm Claude terminal theme: greys lean toward its warm brown.
  warm: {
    accent: '#D97757', onAccent: '#1A1817', seg: '#2A2624', segAlt: '#3A3330', ink: '#E8E2D9', soft: '#C9C2B8',
    mid: '#A49C92', faint: '#8A837A', track: '#4A4440', warn: '#E2B266', crit: '#E06C5F', info: '#7FA3D1',
  },
  mono: {
    accent: '#E4E4E4', onAccent: '#1C1C1C', seg: '#303030', segAlt: '#3A3A3A', ink: '#E4E4E4', soft: '#C6C6C6',
    mid: '#9E9E9E', faint: '#808080', track: '#4E4E4E', warn: '#D7AF5F', crit: '#D75F5F', info: '#87AFD7',
  },
}

// The terminal theme Tidepool ships for each palette, by the name terminals list it under.
export const terminalNames = {
  warm: 'Warm Claude',
  claude: 'Tidepool Claude',
  nord: 'Tidepool Nord',
  dracula: 'Tidepool Dracula',
  mono: 'Tidepool Mono',
}
