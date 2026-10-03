import { opts } from './options'

export type Palette = {
  accent: string
  onAccent: string
  seg: string
  segAlt: string
  ink: string
  soft: string
  mid: string
  faint: string
  track: string
  warn: string
  crit: string
  info: string
}

// Dark-terminal palettes. `seg`/`segAlt` are header backgrounds; the rest are text colours.
export const palettes: Record<'claude' | 'nord' | 'dracula' | 'mono', Palette> = {
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
  mono: {
    accent: '#E4E4E4', onAccent: '#1C1C1C', seg: '#303030', segAlt: '#3A3A3A', ink: '#E4E4E4', soft: '#C6C6C6',
    mid: '#9E9E9E', faint: '#808080', track: '#4E4E4E', warn: '#D7AF5F', crit: '#D75F5F', info: '#87AFD7',
  },
}

export function palette(): Palette {
  return palettes[opts.theme as keyof typeof palettes] ?? palettes.claude
}

// Powerline glyphs need a Nerd Font: only when the user turned them on, and only in the terminal.
export function glyphsOn(surface: string): boolean {
  return opts.powerline && surface === 'terminal'
}

const SEP = ''
const START_CAP = ''
const END_CAP = ''

export type Part = { text: string; color: string; bold?: boolean }
export type Segment = { bg: string; parts: Part[] }
export type Run = { text: string; color: string; backgroundColor?: string; bold?: boolean }

// Powerline chain: rounded caps and arrow separators coloured from the neighbouring segments.
export function powerline(segments: Segment[], glyphs: boolean): Run[] {
  const runs: Run[] = []
  segments.forEach((seg, i) => {
    if (i === 0 && glyphs) runs.push({ text: START_CAP, color: seg.bg })
    for (const part of seg.parts) runs.push({ ...part, backgroundColor: seg.bg })
    const nextBg = segments[i + 1]?.bg
    if (!glyphs) return
    runs.push(nextBg === undefined ? { text: END_CAP, color: seg.bg } : { text: SEP, color: seg.bg, backgroundColor: nextBg })
  })
  return runs
}

// Same bar as ctx-meter.sh: 12 cells, half-cell precision, heavy line on a thin track.
export function bar(fraction: number, width = 12): { filled: string; track: string } {
  const units = Math.min(width * 2, Math.max(fraction > 0 ? 1 : 0, Math.round(fraction * width * 2)))
  const full = units >> 1
  const half = units % 2
  return { filled: '━'.repeat(full) + (half ? '╸' : ''), track: '─'.repeat(width - full - half) }
}

export function runsWidth(runs: Run[]): number {
  return runs.reduce((n, r) => n + [...r.text].length, 0)
}
