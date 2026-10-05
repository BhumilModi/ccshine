import { expect, test } from 'claude-code/testing'

import {
  CRAB,
  DEFAULT,
  FINISH_MS,
  INTRO_MS,
  OUTRO_MS,
  SCENE_ROWS,
  crabBox,
  dockView,
  encodeCells,
  idleCells,
  modeAt,
  flagX,
  sceneCells,
  score,
  travelled,
} from '../hooks/dock'
import type { DockTurn } from '../hooks/dock'
import { DONE_COLS, DONE_MS, DONE_ROWS, doneCrabBox, doneCrabCells } from '../hooks/dock'
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
  expect(dockView(done, 9000 + FINISH_MS / 2)).toEqual({ kind: 'finish', k: 0.5 })
  expect(dockView(done, 9000 + FINISH_MS + OUTRO_MS / 4)).toEqual({ kind: 'outro', k: 0.25 })
  expect(dockView(done, 9000 + FINISH_MS + OUTRO_MS + 1).kind).toBe('idle')
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

test('a stopped turn skips the finish and hops straight home', async () => {
  const stopped = turn({ startedAt: 1000, endedAt: 9000, aborted: true })
  expect(dockView(stopped, 9000 + 100).kind).toBe('outro')
  expect(dockView(stopped, 9000 + OUTRO_MS + 1).kind).toBe('idle')
})

test('the crab runs through the flag, then hops on the spot', async () => {
  const t = turn({ endedAt: 20_000, phases: [{ mode: 'responding', at: INTRO_MS }] })
  expect(crabBox({ kind: 'finish', k: 0.9 }, t, 0).left).toBe(crabBox({ kind: 'finish', k: 0 }, t, 0).left)
  const hops = [0.65, 0.7, 0.75, 0.8, 0.85, 0.9].map(k => crabBox({ kind: 'finish', k }, t, 0).top)
  expect(Math.min(...hops)).toBeLessThan(crabBox({ kind: 'finish', k: 0.1 }, t, 0).top)
  expect(flagX(t, 0, 64)).toBeGreaterThan(crabBox({ kind: 'finish', k: 0 }, t, 0).left)
  expect(flagX(t, 0.6, 64)).toBeLessThan(crabBox({ kind: 'finish', k: 0.6 }, t, 0).left)
})

test('score counts what the crab cleared, the crates and the time', async () => {
  const calls = [{ id: 'a', at: INTRO_MS, label: 'Read', done: true, dist: 0 }, { id: 'b', at: INTRO_MS + 1000, label: 'Edit', done: true, dist: 34 }]
  const t = turn({ startedAt: 0, endedAt: INTRO_MS + 10_000, phases: [{ mode: 'tool', at: INTRO_MS }], calls, crates: 2 })
  const s = score(t)
  expect(s.crates).toBe(2)
  expect(s.ms).toBe(INTRO_MS + 10_000)
  // 340 px of course: ambient obstacles every 52 px from 70, plus both crates.
  expect(s.jumped).toBeGreaterThanOrEqual(5 + 2)
  expect(s.jumped).toBeLessThanOrEqual(6 + 2)
})

test('a four-row scene keeps the crab inside it, running and through the finish', async () => {
  const t = turn({})
  for (const view of [{ kind: 'work' as const, k: 0 }, { kind: 'finish' as const, k: 0.3 }, { kind: 'finish' as const, k: 0.9 }]) {
    const box = crabBox(view, t, INTRO_MS + 500, undefined, 4)
    expect(box.top).toBeGreaterThanOrEqual(0)
    expect(box.bottom).toBeLessThanOrEqual(4 * 2 - 3)
  }
  expect(sceneCells({ kind: 'work', k: 0 }, t, INTRO_MS + 30, 40, P, 4).length).toBe(40 * 4 * 3)
})

test('the plan-done crab runs in, hops inside its card, then stands still', async () => {
  const boxes = Array.from({ length: 60 }, (_, i) => doneCrabBox((i * DONE_MS) / 50))
  for (const b of boxes) {
    expect(b.top).toBeGreaterThanOrEqual(0)
    expect(b.top + b.frame.length).toBeLessThanOrEqual(DONE_ROWS * 2)
  }
  // It enters from the left edge and ends standing where it hopped.
  expect(boxes[0]!.left).toBeLessThan(0)
  const still = doneCrabBox(DONE_MS)
  expect(doneCrabBox(DONE_MS + 9000)).toEqual(still)
  expect(boxes.some(b => b.top < still.top)).toBe(true)
  expect(doneCrabCells(500, P).length).toBe(DONE_COLS * DONE_ROWS * 3)
})
