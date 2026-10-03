import { atom, read, update } from 'claude-code'
import type { On, Timer } from 'claude-code'

import type { TurnRecord } from '../../types'
import { opts } from '../options'
import { addCall, closeTurn, endCall } from '../timing'
import { cacheLeftMs } from '../usage'

export const calls = atom({ plugin: 'terminal-plus', key: 'calls' } as const, {})
export const turns = atom({ plugin: 'terminal-plus', key: 'turns' } as const, [])
const MAX_TURNS = 200
// Bumped to redraw the band; the tasks feature bumps it every second while something runs.
const tick = atom({ plugin: 'terminal-plus', key: 'tick' } as const, 0)

// After each main turn, redraw twice a minute until the prompt cache has gone cold, so the countdown moves.
// Started here, not while drawing: a render hook may not start timers.
let warmTimer: Timer | undefined

// Calls in flight, by tool_use_id: the spinner reads what is running right now.
export const running = new Map<string, { tool: string; input: unknown }>()

export function registerTrack(on: On) {
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    if (id === undefined) return next(e)
    const { tool, tool_use_id: _id, agentId, ...rest } = e as typeof e & { agentId?: string; consent?: string }
    const { consent: _consent, ...input } = rest as Record<string, unknown>
    const startedAt = await $.clock.now()
    await update($, calls, list => addCall(list, id, agentId === undefined ? { tool, startedAt } : { tool, startedAt, agentId }))
    running.set(id, { tool, input })
    try {
      return await next(e)
    } finally {
      running.delete(id)
      const at = await $.clock.now()
      await update($, calls, list => endCall(list, id, at))
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const u = done.usage ?? e.usage
    const usage = u && { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens }
    const turn: TurnRecord = closeTurn(await read($, calls), {
      turnId: e.turnId,
      agentId: e.agentId,
      durationMs: e.durationMs,
      endedAt: await $.clock.now(),
      usage,
    })
    if (e.isAborted) turn.aborted = true
    await update($, turns, list => [...list, turn].slice(-MAX_TURNS))
    if (e.agentId === undefined && opts.usage) {
      warmTimer?.cancel()
      const endedAt = turn.startedAt + turn.durationMs
      const timer = $.clock.every(30_000, () => {
        void $.clock.now().then(now => {
          if (cacheLeftMs(endedAt, now, opts.cacheTtl) === 0) timer.cancel()
          return update($, tick, n => n + 1)
        })
      })
      warmTimer = timer
    }
    return done
  })
}
