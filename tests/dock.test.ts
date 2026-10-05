import { expect, test } from 'claude-code/testing'

import {
  CRAB,
  DEFAULT,
  INTRO_MS,
  OUTRO_MS,
  SCENE_ROWS,
  crabBox,
  dockView,
  encodeCells,
  idleCells,
  modeAt,
  sceneCells,
  travelled,
} from '../hooks/dock'
import type { DockTurn } from '../hooks/dock'
import { palettes } from '../hooks/palettes.mjs'

const P = palettes.warm
const turn = (over: Partial<DockTurn> = {}): DockTurn => ({ startedAt: 0, phases: [], calls: [], seed: 1, ...over })
const ACCENT = 0xd97757

// Rows of the scene as text, '#' where the crab's body colour is.
function crabRows(cells: Uint32Array, cols: number): string[] {
  const rows: string[] = []
  for (let r = 0; r < SCENE_ROWS; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 3
      line += cells[i + 1] === ACCENT || cells[i + 2] === ACCENT ? '#' : '.'
    }
    rows.push(line)
  }
  return rows
}

test('cells encode as little-endian u32 triplets in base64', async () => {
  expect(encodeCells(Uint32Array.of(0x2588, 0xff8800, DEFAULT))).toBe('iCUAAACI/wAAAAAB')
})

test('view: intro after start, work, outro after end, then idle', async () => {
  const t = turn({ startedAt: 1000 })
  expect(dockView(undefined, 5000).kind).toBe('idle')
  expect(dockView(t, 1000 + INTRO_MS / 2)).toEqual({ kind: 'intro', k: 0.5 })
  expect(dockView(t, 1000 + INTRO_MS + 1).kind).toBe('work')
  const done = turn({ startedAt: 1000, endedAt: 9000 })
  expect(dockView(done, 9000 + OUTRO_MS / 4)).toEqual({ kind: 'outro', k: 0.25 })
  expect(dockView(done, 9000 + OUTRO_MS + 1).kind).toBe('idle')
})

test('mode follows the latest phase, requesting before any', async () => {
  const t = turn({ phases: [{ mode: 'thinking', at: 2000 }, { mode: 'tool', at: 5000 }] })
  expect(modeAt(t, 1000)).toBe('requesting')
  expect(modeAt(t, 3000)).toBe('thinking')
  expect(modeAt(t, 6000)).toBe('tool')
})

test('distance integrates speed per phase and starts after the intro', async () => {
  const t = turn({ phases: [{ mode: 'tool', at: INTRO_MS }] })
  expect(travelled(t, INTRO_MS)).toBe(0)
  expect(travelled(t, INTRO_MS + 1000)).toBe(34)
  const mixed = turn({ phases: [{ mode: 'thinking', at: INTRO_MS }, { mode: 'tool', at: INTRO_MS + 1000 }] })
  expect(travelled(mixed, INTRO_MS + 2000)).toBe(18 + 34)
})

test('crab rests on the ground with no obstacle near', async () => {
  const t = turn({ phases: [{ mode: 'thinking', at: INTRO_MS }] })
  const box = crabBox({ kind: 'work', k: 0 }, t, INTRO_MS)
  expect(box.bottom).toBe(SCENE_ROWS * 2 - 3)
})

test('crab jumps over an obstacle and never leaves the scene', async () => {
  const t = turn({ phases: [{ mode: 'tool', at: INTRO_MS }], calls: [{ id: 'c1', at: INTRO_MS, label: 'Read a.ts', done: false }] })
  let highest = Infinity
  for (let ms = INTRO_MS; ms < INTRO_MS + 4000; ms += 20) highest = Math.min(highest, crabBox({ kind: 'work', k: 0 }, t, ms).top)
  expect(highest).toBeGreaterThanOrEqual(0)
  expect(highest).toBeLessThan(SCENE_ROWS * 2 - 3 - CRAB[0]!.length)
})

test('legs alternate as the crab covers distance', async () => {
  const t = turn({ phases: [{ mode: 'tool', at: INTRO_MS }] })
  const a = crabRows(sceneCells({ kind: 'work', k: 0 }, t, INTRO_MS + 30, 40, P), 40).join('\n')
  const b = crabRows(sceneCells({ kind: 'work', k: 0 }, t, INTRO_MS + 120, 40, P), 40).join('\n')
  expect(a).not.toBe(b)
})

test('intro starts at the top and lands on the ground; outro rises to the top', async () => {
  const t = turn()
  expect(crabBox({ kind: 'intro', k: 0 }, t, 0).top).toBe(0)
  expect(crabBox({ kind: 'intro', k: 1 }, t, INTRO_MS).bottom).toBe(SCENE_ROWS * 2 - 3)
  expect(crabBox({ kind: 'outro', k: 0.7 }, turn({ endedAt: 0 }), 0).top).toBe(0)
})

test('scene and idle cells have the right sizes and fit a narrow band', async () => {
  const t = turn({ phases: [{ mode: 'thinking', at: INTRO_MS }] })
  expect(sceneCells({ kind: 'work', k: 0 }, t, INTRO_MS + 500, 40, P)).toHaveLength(40 * SCENE_ROWS * 3)
  expect(idleCells(false, P)).toHaveLength(14 * 3 * 3)
  // Blinking turns the eye cells to the body colour.
  expect(idleCells(true, P)).not.toEqual(idleCells(false, P))
})

test('a long turn stays cheap to draw', async () => {
  const phases: DockTurn['phases'] = []
  const calls: DockTurn['calls'] = []
  for (let i = 0; i < 2400; i++) phases.push({ mode: (['thinking', 'tool', 'requesting', 'responding'] as const)[i % 4]!, at: INTRO_MS + i * 2250 })
  // The tracker stores each crate's course position when the call starts.
  for (let i = 0; i < 600; i++) calls.push({ id: `c${i}`, at: INTRO_MS + i * 9000, label: 'Read a.ts', done: true, dist: i * 230 })
  const t = turn({ phases, calls })
  const now = INTRO_MS + 90 * 60_000
  const start = Date.now()
  for (let f = 0; f < 20; f++) sceneCells({ kind: 'work', k: 0 }, t, now + f * 50, 64, P)
  expect(Date.now() - start).toBeLessThan(100)
})
