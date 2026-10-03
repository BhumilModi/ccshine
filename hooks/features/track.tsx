import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { LiveCall, TurnRecord } from '../../types'
import { addCall, closeTurn, endCall, totalTokens } from '../timing'

export const calls = atom({ plugin: 'ccshine', key: 'calls' } as const, {})
export const turns = atom({ plugin: 'ccshine', key: 'turns' } as const, [])
const MAX_TURNS = 200

// Calls in flight, by tool_use_id. State (not a module map) so the spinner redraws when one starts or ends.
const live = atom({ plugin: 'ccshine', key: 'live' } as const, {})
// Agent rows (features/tasks.tsx); the tracker records when each agent's turn completes.
const agents = atom({ plugin: 'ccshine', key: 'agents' } as const, [])

export function registerTrack(on: On) {
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    if (id === undefined) return next(e)
    const { tool, tool_use_id: _id, agentId, ...rest } = e as typeof e & { agentId?: string; consent?: string }
    const { consent: _consent, ...input } = rest as Record<string, unknown>
    const startedAt = await $.clock.now()
    await update($, calls, list => addCall(list, id, agentId === undefined ? { tool, startedAt } : { tool, startedAt, agentId }))
    const call: LiveCall = agentId === undefined ? { tool, input } : { tool, input, agentId }
    await update($, live, map => ({ ...map, [id]: call }))
    try {
      return await next(e)
    } finally {
      await update($, live, map => {
        const { [id]: _done, ...rest } = map
        return rest
      })
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
    if (e.agentId !== undefined) {
      const id = e.agentId
      const endedAt = turn.startedAt + turn.durationMs
      const used = usage ? totalTokens(usage) : 0
      await update($, agents, list =>
        list.map(a => (a.id === id ? { ...a, endedAt, tokens: (a.tokens ?? 0) + used, stopped: e.isAborted } : a)),
      )
    }
    return done
  })
}
