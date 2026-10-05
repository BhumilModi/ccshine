import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { LiveCall, TurnRecord } from '../../types'
import { activity } from '../activity'
import { travelled } from '../dock'
import { addJob, endJob, parseNotifications } from '../jobs'
import { addCall, closeSpan, closeTurn, endCall, totalTokens } from '../timing'
import { callDetail } from '../rail'
import { describeCall, editStats } from '../tools'

export const calls = atom({ plugin: 'tidepool', key: 'calls' } as const, {})
export const turns = atom({ plugin: 'tidepool', key: 'turns' } as const, [])
const MAX_TURNS = 200

// Calls in flight, by tool_use_id. State (not a module map) so the spinner redraws when one starts or ends.
const live = atom({ plugin: 'tidepool', key: 'live' } as const, {})
// Agent rows (features/tasks.tsx); the tracker records when each agent's turn completes.
const agents = atom({ plugin: 'tidepool', key: 'agents' } as const, [])
// The prompt dock's turn (features/dock.tsx): each main-loop tool call drops a crate, and the turn's end sends the crab home.
const dock = atom({ plugin: 'tidepool', key: 'dock' } as const, null)
// The rail's turns and background shells (features/rail.tsx), and when the current chat began: /clear moves it.
export const spans = atom({ plugin: 'tidepool', key: 'spans' } as const, [])
export const jobs = atom({ plugin: 'tidepool', key: 'jobs' } as const, [])
const chat = atom({ plugin: 'tidepool', key: 'chat' } as const, 0)

let root: string | undefined

// Context % and session cost right now; either is absent where the host keeps none.
async function gauges($: EngineInterface): Promise<{ ctx?: number; cost?: number }> {
  try {
    const usage = await $.session.usage()
    const out: { ctx?: number; cost?: number } = {}
    if (usage.context.percent !== undefined) out.ctx = usage.context.percent
    if (usage.cost) out.cost = usage.cost.usd
    return out
  } catch {
    return {}
  }
}

// A new chat (fresh start or /clear) starts with no turns and no jobs on the rail.
async function syncChat($: EngineInterface) {
  const startedAt = (await $.session.usage()).startedAt
  if ((await read($, chat)) === startedAt) return
  await update($, chat, () => startedAt)
  await update($, spans, () => [])
  await update($, jobs, () => [])
}

export function registerTrack(on: On) {
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    if (id === undefined) return next(e)
    const { tool, tool_use_id: _id, agentId, ...rest } = e as typeof e & { agentId?: string; consent?: string }
    const { consent: _consent, ...input } = rest as Record<string, unknown>
    const startedAt = await $.clock.now()
    // Without a root, paths stay absolute; the call is still tracked.
    root ??= await $.session.root().catch(() => '')
    const target = describeCall(tool, input, root)?.target
    const stats = editStats(tool, input)
    await update($, calls, list =>
      addCall(list, id, {
        tool,
        startedAt,
        ...(agentId === undefined ? {} : { agentId }),
        ...(target === undefined ? {} : { target }),
        ...(stats ? { added: stats.added, removed: stats.removed } : {}),
      }),
    )
    const call: LiveCall = agentId === undefined ? { tool, input } : { tool, input, agentId }
    await update($, live, map => ({ ...map, [id]: call }))
    if (agentId === undefined) {
      const label = activity([call]) ?? tool
      await update($, dock, t => {
        if (!t || t.endedAt !== undefined) return t
        const phases = t.phases.at(-1)?.mode === 'tool' ? t.phases : [...t.phases, { mode: 'tool' as const, at: startedAt }]
        // Its crate's course position, once; the dock keeps the last 40 calls (it shows three, and crates only near the crab).
        const call = { id, at: startedAt, label, done: false, dist: travelled(t, startedAt) }
        return { ...t, phases, calls: [...t.calls, call].slice(-40), crates: (t.crates ?? t.calls.length) + 1 }
      })
    }
    let failed = true
    let detail: string[] = []
    try {
      const ran = await next(e)
      failed = ran.isError === true
      detail = callDetail(tool, input, ran as { result?: unknown; isError?: boolean; text?: string })
      const result = ran.result as { backgroundTaskId?: string; task_id?: string } | undefined
      if (agentId === undefined && result?.backgroundTaskId) {
        const job = { id: result.backgroundTaskId, callId: id, startedAt, status: 'running' as const }
        await update($, jobs, list => addJob(list, job))
      }
      if (tool === 'TaskStop' && result?.task_id) {
        const taskId = result.task_id
        const at = await $.clock.now()
        await update($, jobs, list => endJob(list, taskId, 'killed', at))
      }
      return ran
    } finally {
      await update($, live, map => {
        const { [id]: _done, ...rest } = map
        return rest
      })
      const at = await $.clock.now()
      await update($, calls, list => {
        const ended = endCall(list, id, at, failed)
        const call = ended[id]
        return call && detail.length ? { ...ended, [id]: { ...call, detail } } : ended
      })
      if (agentId === undefined) await update($, dock, t => (t ? { ...t, calls: t.calls.map(c => (c.id === id ? { ...c, done: true } : c)) } : t))
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer') await syncChat($)
    if (e.origin.kind === 'task-notification') {
      const at = await $.clock.now()
      for (const { id, status } of parseNotifications(e.text)) await update($, jobs, list => endJob(list, id, status, at))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      const level = await gauges($)
      const aborted = e.isAborted || e.reason === 'aborted'
      await update($, spans, list => closeSpan(list, { at, ...level, aborted }))
    }
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
    if (e.agentId === undefined) {
      const endedAt = await $.clock.now()
      const aborted = e.isAborted || e.reason === 'aborted'
      await update($, dock, t => (t && t.endedAt === undefined && (t.turnId === undefined || t.turnId === e.turnId) ? { ...t, endedAt, ...(aborted ? { aborted: true } : {}) } : t))
    }
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
