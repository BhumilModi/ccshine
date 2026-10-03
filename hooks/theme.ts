import { opts } from './options'
import { palettes } from './palettes.mjs'
import type { Palette } from './palettes.mjs'

export { palettes }
export type { Palette }

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
