import type { Step, Usage } from '../types'
import { fmtShort } from './tools'

const SHADES = ['▒', '░', '▓']

// Cells per segment, proportional to time: thinking (turn time not spent in tools) first, then each tool.
// Largest-remainder rounding so the cells always add up to `width`; any segment with time gets one cell.
export function timeline(steps: Step[], durationMs: number, width: number): { char: string; tool: string }[] {
  const toolMs = steps.reduce((n, s) => n + s.ms, 0)
  const segments = [{ tool: 'thinking', ms: Math.max(0, durationMs - toolMs) }, ...steps].filter(s => s.ms > 0)
  if (segments.length === 0) segments.push({ tool: 'thinking', ms: 1 })
  const total = segments.reduce((n, s) => n + s.ms, 0)
  const exact = segments.map(s => (s.ms / total) * width)
  const cells = exact.map(x => Math.max(1, Math.floor(x)))
  let spare = width - cells.reduce((n, c) => n + c, 0)
  const byRemainder = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)
  for (let k = 0; spare > 0; k = (k + 1) % byRemainder.length, spare--) cells[byRemainder[k]!.i]! += 1
  while (spare < 0) {
    const big = cells.indexOf(Math.max(...cells))
    cells[big]! -= 1
    spare++
  }
  let shade = 0
  return segments.flatMap((s, i) => {
    const char = s.tool === 'thinking' ? '▇' : SHADES[shade++ % SHADES.length]!
    return Array.from({ length: cells[i]! }, () => ({ char, tool: s.tool }))
  })
}

// The three biggest parts of the turn: `Bash 31s · thinking 28s · Read ×6 4s`.
export function legend(steps: Step[], durationMs: number): string {
  const thinking = Math.max(0, durationMs - steps.reduce((n, s) => n + s.ms, 0))
  const parts = [{ label: 'thinking', ms: thinking }, ...steps.map(s => ({ label: s.count > 1 ? `${s.tool} ×${s.count}` : s.tool, ms: s.ms }))]
  return parts
    .filter(p => p.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3)
    .map(p => `${p.label} ${fmtShort(p.ms)}`)
    .join(' · ')
}

export function cacheRate(u: Usage): number {
  const sent = u.input + u.cacheRead + u.cacheWrite
  return sent === 0 ? 0 : Math.round((u.cacheRead / sent) * 100) / 100
}

const pad = (n: number) => String(n).padStart(2, '0')

export function fmtTurn(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const s = Math.floor(ms / 1000)
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`
  return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`
}
