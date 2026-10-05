// The prompt dock's frames: the clay crab, the course it runs, and the cells a Raster paints. Pure: the hooks
// own the clock and the repaints. Pixels are half blocks, two to a terminal cell, so a 6-row scene is 12 tall.

import type { Palette } from './palettes.mjs'

import type { DockMode, DockTurn } from '../types'

export type { DockMode, DockTurn }

export type DockView = { kind: 'idle' | 'intro' | 'work' | 'outro'; k: number }

export const INTRO_MS = 900
export const OUTRO_MS = 800
export const SCENE_ROWS = 6
export const IDLE_COLS = 14
export const IDLE_ROWS = 3
export const DEFAULT = 0x01000000

const H = SCENE_ROWS * 2
const GROUND_Y = H - 2
const RUN_X = 8
const IDLE_X = 2
const SPEED: Record<DockMode, number> = { requesting: 8, thinking: 18, tool: 34, responding: 28 } // pixels a second

// '#' body, 'o' eye, '.' empty. Run A, run B, airborne.
export const CRAB = [
  ['..#....#..', '.########.', '##o####o##', '.########.', '.#.#..#.#.', '#.#....#.#'],
  ['..#....#..', '.########.', '##o####o##', '.########.', '#.#.##.#.#', '.#......#.'],
  ['.#......#.', '.########.', '##o####o##', '.########.', '..#.##.#..', '..........'],
]
// Landing: one pixel shorter, as if it squashed.
const SQUASH = [CRAB[0]![0]!, ...CRAB[0]!.slice(2)]
const CRAB_W = CRAB[0]![0]!.length
const CRAB_H = CRAB[0]!.length

const OBSTACLES: Record<string, string[]> = {
  cactus: ['.#.', '###', '.#.'],
  tall: ['.#.#', '##.#', '.###', '..#.'],
  double: ['.#..#.', '###.##', '.#..#.'],
  rock: ['.##.', '####'],
  crate: ['###', '#.#', '###'],
}
const AMBIENT = ['cactus', 'tall', 'double', 'rock']
const CLOUD = ['.##..', '#####']

const rand = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}
const hex = (color: string) => parseInt(color.slice(1), 16)
const easeOut = (k: number) => 1 - (1 - k) ** 3
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export function dockView(turn: DockTurn | undefined, now: number): DockView {
  if (!turn) return { kind: 'idle', k: 0 }
  if (turn.endedAt !== undefined) {
    const since = now - turn.endedAt
    return since < OUTRO_MS ? { kind: 'outro', k: Math.max(0, since / OUTRO_MS) } : { kind: 'idle', k: 0 }
  }
  const since = now - turn.startedAt
  return since < INTRO_MS ? { kind: 'intro', k: Math.max(0, since / INTRO_MS) } : { kind: 'work', k: 0 }
}

export function modeAt(turn: DockTurn, now: number): DockMode {
  let mode: DockMode = 'requesting'
  for (const p of turn.phases) if (p.at <= now) mode = p.mode
  return mode
}

// Pixels run since the intro ended, each phase at its own speed.
export function travelled(turn: DockTurn, now: number): number {
  const from = turn.startedAt + INTRO_MS
  const until = Math.min(now, turn.endedAt ?? now)
  if (until <= from) return 0
  const marks = [{ mode: 'requesting' as DockMode, at: from }, ...turn.phases.filter(p => p.at > from), { mode: 'requesting' as DockMode, at: until }]
  let d = 0
  for (let i = 0; i < marks.length - 1; i++) {
    const a = Math.max(from, marks[i]!.at)
    const b = Math.min(until, marks[i + 1]!.at)
    const mode = i === 0 ? modeAt(turn, from) : marks[i]!.mode
    if (b > a) d += ((b - a) / 1000) * SPEED[mode]
  }
  return Math.round(d * 1000) / 1000
}

// Seconds spent in each phase so far, for the header.
export function phaseTimes(turn: DockTurn, now: number): Record<'thinking' | 'tool' | 'responding', number> {
  const out = { thinking: 0, tool: 0, responding: 0 }
  const until = Math.min(now, turn.endedAt ?? now)
  turn.phases.forEach((p, i) => {
    const end = Math.min(until, turn.phases[i + 1]?.at ?? until)
    if (p.mode !== 'requesting' && end > p.at) out[p.mode] += (end - p.at) / 1000
  })
  return out
}

type Obstacle = { at: number; shape: string[]; crate: boolean }

function course(turn: DockTurn, upTo: number): Obstacle[] {
  const items: Obstacle[] = []
  for (let i = 0, d = 70; d < upTo + 80; i++) {
    items.push({ at: d, shape: OBSTACLES[AMBIENT[Math.floor(rand(turn.seed + i) * AMBIENT.length)]!]!, crate: false })
    d += 34 + Math.floor(rand(turn.seed + i + 0.5) * 36)
  }
  for (const c of turn.calls) items.push({ at: travelled(turn, c.at) + 46, shape: OBSTACLES.crate!, crate: true })
  return items
}

// Where the crab is, in scene pixels, and which frame it shows.
export function crabBox(view: DockView, turn: DockTurn, now: number): { left: number; top: number; bottom: number; frame: string[] } {
  const rest = GROUND_Y - CRAB_H
  const box = (x: number, top: number, frame: string[]) => ({ left: Math.round(x), top: Math.round(top), bottom: Math.round(top) + frame.length - 1, frame })
  if (view.kind === 'intro') {
    // It leaves the top of the scene and arcs down onto the ground, squashing as it lands.
    const hop = Math.min(1, view.k / 0.8)
    if (hop >= 1) return box(RUN_X, rest + 1, SQUASH)
    return box(lerp(IDLE_X, RUN_X, easeOut(hop)), Math.max(0, lerp(0, rest, hop * hop) - 2 * Math.sin(Math.PI * hop)), CRAB[2]!)
  }
  if (view.kind === 'outro') {
    const hop = Math.min(1, view.k / 0.7)
    return box(lerp(RUN_X, IDLE_X, easeOut(hop)), Math.max(0, lerp(rest, 0, easeOut(hop)) - 2 * Math.sin(Math.PI * hop)), hop < 1 ? CRAB[2]! : CRAB[0]!)
  }
  const dist = travelled(turn, now)
  const mid = RUN_X + CRAB_W / 2
  let lift = 0
  for (const o of course(turn, dist + 80)) {
    const w = o.shape[0]!.length
    const x = o.at - dist + RUN_X
    const d = Math.abs(mid - (x + w / 2))
    const reach = w / 2 + 6
    // Peak one pixel over the obstacle, capped so the crab never leaves the scene.
    const peak = Math.min(rest, o.shape.length + 1)
    if (d < reach) lift = Math.max(lift, Math.round(peak * (1 - (d / reach) ** 2)))
  }
  return box(RUN_X, rest - lift, lift > 0 ? CRAB[2]! : CRAB[Math.floor(dist / 3) % 2]!)
}

class Pixels {
  grid: (number | undefined)[][]
  constructor(readonly w: number, readonly h: number) {
    this.grid = Array.from({ length: h }, () => Array<number | undefined>(w).fill(undefined))
  }
  put(x: number, y: number, c: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.grid[y]![x] = c
  }
  sprite(rows: string[], x: number, y: number, body: number, eye: number) {
    rows.forEach((row, dy) => [...row].forEach((p, dx) => p !== '.' && this.put(x + dx, y + dy, p === 'o' ? eye : body)))
  }
  // Two pixel rows per cell: ▀ in the top colour over the bottom colour.
  cells(): Uint32Array {
    const out = new Uint32Array(this.w * (this.h / 2) * 3)
    for (let r = 0; r < this.h / 2; r++) {
      for (let x = 0; x < this.w; x++) {
        const a = this.grid[r * 2]![x], b = this.grid[r * 2 + 1]![x]
        const i = (r * this.w + x) * 3
        if (a !== undefined && b !== undefined) out.set(a === b ? [0x2588, a, DEFAULT] : [0x2580, a, b], i)
        else if (a !== undefined) out.set([0x2580, a, DEFAULT], i)
        else if (b !== undefined) out.set([0x2584, b, DEFAULT], i)
        else out.set([0x20, DEFAULT, DEFAULT], i)
      }
    }
    return out
  }
}

export function sceneCells(view: DockView, turn: DockTurn, now: number, cols: number, p: Palette): Uint32Array {
  const px = new Pixels(cols, H)
  const dist = view.kind === 'work' ? travelled(turn, now) : view.kind === 'outro' ? travelled(turn, turn.endedAt ?? now) : 0
  // Clouds drift at a third of the speed.
  for (let i = 0; i < 2; i++) {
    const span = cols + 10
    const cx = ((Math.round(i * 37 + 12 - dist / 3) % span) + span) % span - 5
    CLOUD.forEach((row, y) => [...row].forEach((c, x) => c === '#' && px.put(cx + x, y + i, hex(p.seg))))
  }
  for (let x = 0; x < cols; x++) {
    px.put(x, GROUND_Y, hex(p.track))
    if (rand(Math.floor(x + dist)) > 0.82) px.put(x, GROUND_Y + 1, hex(p.segAlt))
  }
  if (view.kind === 'work') {
    for (const o of course(turn, dist + cols)) {
      const x = Math.round(o.at - dist + RUN_X)
      if (x > cols || x + o.shape[0]!.length < 0) continue
      const c = hex(o.crate ? p.info : p.warn)
      o.shape.forEach((row, y) => [...row].forEach((ch, dx) => ch === '#' && px.put(x + dx, GROUND_Y - o.shape.length + y, c)))
    }
  }
  const crab = crabBox(view, turn, now)
  px.sprite(crab.frame, crab.left, crab.top, hex(p.accent), hex(p.onAccent))
  return px.cells()
}

// Idle: the crab standing in a 14×3 cell corner; a blink paints its eyes in the body colour.
export function idleCells(blink: boolean, p: Palette): Uint32Array {
  const px = new Pixels(IDLE_COLS, IDLE_ROWS * 2)
  px.sprite(CRAB[0]!, IDLE_X, 0, hex(p.accent), blink ? hex(p.accent) : hex(p.onAccent))
  return px.cells()
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Raster cells: little-endian u32 triplets [codePoint, fg, bg], as standard padded base64.
export function encodeCells(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? '=' : B64[(n >> 6) & 63]!) + (c === undefined ? '=' : B64[n & 63]!)
  }
  return out
}

// The band's requestId, recorded when the band draws, so the timer can repaint its Raster.
export const site: { id: string | undefined; cols: number | undefined } = { id: undefined, cols: undefined }
