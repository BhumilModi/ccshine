// The terminal theme for each Tidepool palette (hooks/palettes.mjs). Every file under themes/ is generated
// from these by scripts/build-themes.mjs. Each background is its palette's `onAccent`, and the cursor its accent.
import { terminalNames } from '../hooks/palettes.mjs'

// ANSI 0–7, then bright 8–15: black, red, green, yellow, blue, magenta, cyan, white.
export const terminalThemes = {
  warm: {
    name: terminalNames.warm,
    background: '#1A1817',
    foreground: '#E8E2D9',
    cursor: '#D97757',
    cursorText: '#1A1817',
    selectionBackground: '#3A3330',
    selectionForeground: '#E8E2D9',
    palette: [
      '#2A2624', '#E06C5F', '#8FB573', '#E2B266', '#7FA3D1', '#C49BD6', '#7DBFB5', '#C9C2B8',
      '#7A746C', '#EC8A7F', '#A8C98F', '#EDC889', '#9DBBE0', '#D5B5E3', '#9DD2C9', '#F4EFE8',
    ],
  },
  // Cool slate greys with Claude's clay accent.
  claude: {
    name: terminalNames.claude,
    background: '#1A1B26',
    foreground: '#DEE0E6',
    cursor: '#D97757',
    cursorText: '#1A1B26',
    selectionBackground: '#3A3E46',
    selectionForeground: '#DEE0E6',
    palette: [
      '#2A2D35', '#EC7070', '#9ECE6A', '#E2B266', '#7AA2F7', '#BB9AF7', '#7DCFFF', '#B4B9C4',
      '#787D88', '#F28B8B', '#B5DE8A', '#EDC889', '#9AB8FA', '#CDB4FA', '#A0DDFF', '#F2F3F7',
    ],
  },
  // Nord's published colours (nordtheme.com), with the frost accent as the cursor.
  nord: {
    name: terminalNames.nord,
    background: '#2E3440',
    foreground: '#D8DEE9',
    cursor: '#88C0D0',
    cursorText: '#2E3440',
    selectionBackground: '#434C5E',
    selectionForeground: '#ECEFF4',
    palette: [
      '#3B4252', '#BF616A', '#A3BE8C', '#EBCB8B', '#81A1C1', '#B48EAD', '#88C0D0', '#E5E9F0',
      '#4C566A', '#BF616A', '#A3BE8C', '#EBCB8B', '#81A1C1', '#B48EAD', '#8FBCBB', '#ECEFF4',
    ],
  },
  // Dracula's published colours (draculatheme.com), with the purple accent as the cursor.
  dracula: {
    name: terminalNames.dracula,
    background: '#282A36',
    foreground: '#F8F8F2',
    cursor: '#BD93F9',
    cursorText: '#282A36',
    selectionBackground: '#44475A',
    selectionForeground: '#F8F8F2',
    palette: [
      '#21222C', '#FF5555', '#50FA7B', '#F1FA8C', '#BD93F9', '#FF79C6', '#8BE9FD', '#F8F8F2',
      '#6272A4', '#FF6E6E', '#69FF94', '#FFFFA5', '#D6ACFF', '#FF92DF', '#A4FFFF', '#FFFFFF',
    ],
  },
  // Neutral greys; the ANSI colours stay muted so code and diffs still read.
  mono: {
    name: terminalNames.mono,
    background: '#1C1C1C',
    foreground: '#E4E4E4',
    cursor: '#E4E4E4',
    cursorText: '#1C1C1C',
    selectionBackground: '#3A3A3A',
    selectionForeground: '#E4E4E4',
    palette: [
      '#303030', '#D75F5F', '#87AF87', '#D7AF5F', '#87AFD7', '#AF87AF', '#87AFAF', '#C6C6C6',
      '#808080', '#E08787', '#A8C8A8', '#E4C887', '#A8C8E4', '#C8A8C8', '#A8C8C8', '#F2F2F2',
    ],
  },
}
