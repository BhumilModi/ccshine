import type { CallTiming, Step, TurnRecord, Usage } from '../types'

const MAX_CALLS = 500

export function addCall(calls: Record<string, CallTiming>, id: string, timing: CallTiming): Record<string, CallTiming> {
  const next = { ...calls, [id]: timing }
  const ids = Object.keys(next)
  if (ids.length <= MAX_CALLS) return next
  const keep = new Set(ids.sort((a, b) => next[b]!.startedAt - next[a]!.startedAt).slice(0, MAX_CALLS))
  return Object.fromEntries(Object.entries(next).filter(([id]) => keep.has(id)))
}

export function endCall(calls: Record<string, CallTiming>, id: string, at: number): Record<string, CallTiming> {
  const call = calls[id]
  return call ? { ...calls, [id]: { ...call, endedAt: at } } : calls
}

export function totalTokens(u: Usage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite
}

// A turn's start is not reported (turn.start carries no agentId), so it is endedAt minus durationMs.
// Steps: finished calls of the same loop inside that window, time summed per tool in order of first use.
export function closeTurn(
  calls: Record<string, CallTiming>,
  turn: { turnId: string; agentId?: string; durationMs: number; endedAt: number; usage?: Usage },
): TurnRecord {
  const startedAt = turn.endedAt - turn.durationMs
  const steps: Step[] = []
  const inTurn = Object.values(calls)
    .filter(c => c.agentId === turn.agentId && c.endedAt !== undefined && c.startedAt >= startedAt && c.startedAt <= turn.endedAt)
    .sort((a, b) => a.startedAt - b.startedAt)
  for (const c of inTurn) {
    const ms = (c.endedAt ?? c.startedAt) - c.startedAt
    const step = steps.find(s => s.tool === c.tool)
    if (step) step.ms += ms
    else steps.push({ tool: c.tool, ms })
  }
  const record: TurnRecord = { turnId: turn.turnId, startedAt, durationMs: turn.durationMs, steps }
  if (turn.agentId !== undefined) record.agentId = turn.agentId
  if (turn.usage) record.usage = turn.usage
  return record
}
