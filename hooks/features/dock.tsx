import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import { dockView, encodeCells, sceneCells, site } from '../dock'
import type { DockMode } from '../dock'
import { opts } from '../options'
import { palette } from '../theme'

// The main turn the dock draws; the tracker (features/track.tsx) adds its tool calls and its end.
const dock = atom({ plugin: 'ccshine', key: 'dock' } as const, null)
// Bumped to redraw the band (features/tasks.tsx): on a change of layout, and once a second for the clock.
const tick = atom({ plugin: 'ccshine', key: 'tick' } as const, 0)

const FRAME_MS = 50
let timer: Timer | undefined
let busy = false
let lastKind = ''
let lastSecond = -1
let refused = 0
let lastMode: DockMode | undefined

async function notePhase($: EngineInterface, mode: DockMode) {
  if (mode === lastMode) return
  lastMode = mode
  const at = await $.clock.now()
  await update($, dock, t => (t && t.endedAt === undefined ? { ...t, phases: [...t.phases, { mode, at }] } : t))
}

function stop() {
  timer?.cancel()
  timer = undefined
}

// One frame: redraw the band when its layout or clock changes, repaint the scene, stop once the crab is home.
async function frame($: EngineInterface) {
  if (busy) return
  busy = true
  try {
    const turn = await read($, dock)
    const now = await $.clock.now()
    const view = dockView(turn ?? undefined, now)
    const second = Math.floor(now / 1000)
    if (view.kind !== lastKind || second !== lastSecond) {
      lastKind = view.kind
      lastSecond = second
      await update($, tick, n => n + 1)
    }
    if (view.kind === 'idle' || !turn) {
      stop()
      await update($, dock, () => null)
      return
    }
    if (!site.id || !site.cols) return
    const result = await $.ui.blit({ requestId: site.id, key: 'dock-scene', cells: encodeCells(sceneCells(view, turn, now, site.cols, palette())) })
    // A band that is hidden, collapsed or held by a survey refuses repaints; give up after a second of them.
    if (result && 'deny' in result && result.deny) {
      if (++refused > 1000 / FRAME_MS) stop()
    } else refused = 0
  } catch {
    // A failed frame is skipped; the next one tries again.
  } finally {
    busy = false
  }
}

export function registerDock(on: On) {
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (!opts.dock) return started
    const now = await $.clock.now()
    // A subagent's turn also starts here, and carries no agent id: keep the main turn already running.
    const current = await read($, dock)
    if (current && current.endedAt === undefined) return started
    lastMode = undefined
    refused = 0
    await update($, dock, () => ({ startedAt: now, phases: [], calls: [], seed: now % 997 }))
    stop()
    timer = $.clock.every(FRAME_MS, () => {
      void frame($)
    })
    return started
  })

  // The stream says what the model is doing: thinking, writing text, or calling a tool.
  on('turn.step', async function* ($, e, next) {
    const main = opts.dock && e.agentId === undefined
    if (main) await notePhase($, 'requesting')
    const stream = next(e)
    for await (const chunk of stream) {
      if (main) {
        const mode = chunk.kind === 'thinking' ? 'thinking' : chunk.kind === 'text' ? 'responding' : chunk.kind === 'tool' || chunk.kind === 'input' ? 'tool' : undefined
        if (mode) await notePhase($, mode)
      }
      yield chunk
    }
    return await stream.result
  })
}
