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

// Context-meter style bar: 12 cells, half-cell precision, heavy line on a thin track.
export function bar(fraction: number, width = 12): { filled: string; track: string } {
  const units = Math.min(width * 2, Math.max(fraction > 0 ? 1 : 0, Math.round(fraction * width * 2)))
  const full = units >> 1
  const half = units % 2
  return { filled: '━'.repeat(full) + (half ? '╸' : ''), track: '─'.repeat(width - full - half) }
}

// The meter split in two: the cells up to `from` (what a turn started with), then the cells it added.
export function gauge(from: number, to: number, width = 12): { base: string; added: string; track: string } {
  const whole = bar(Math.max(from, to), width)
  const cells = bar(from, width).filled.length
  return { base: whole.filled.slice(0, cells), added: whole.filled.slice(cells), track: whole.track }
}

// The same look for a stretch of time inside a window: track, heavy line from `from` to `to`, track.
// Ends round outward to half cells, so even a 0 ms call shows as one half cell.
export function span(from: number, to: number, width: number): { before: string; filled: string; after: string } {
  const a = Math.min(width * 2 - 1, Math.max(0, Math.floor(from * width * 2)))
  const b = Math.min(width * 2, Math.max(a + 1, Math.ceil(to * width * 2)))
  const first = a >> 1
  const last = (b - 1) >> 1
  let filled = ''
  for (let cell = first; cell <= last; cell++) {
    const left = cell * 2 >= a && cell * 2 < b
    const right = cell * 2 + 1 >= a && cell * 2 + 1 < b
    filled += left && right ? '━' : left ? '╸' : '╺'
  }
  return { before: '─'.repeat(first), filled, after: '─'.repeat(width - last - 1) }
}

export function runsWidth(runs: Run[]): number {
  return runs.reduce((n, r) => n + [...r.text].length, 0)
}
