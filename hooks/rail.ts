import type { CallTiming, Job, PlanAgent, RailRow, RailSummary, TurnSpan } from '../types'

// The rail's model: which calls belong to a turn and where each sits on the turn's timeline. No engine calls.

const clamp = (x: number) => Math.min(1, Math.max(0, x))

export function turnWindow(turn: TurnSpan, now: number): { start: number; end: number } {
  return { start: turn.startedAt, end: turn.endedAt ?? now }
}

// The newest turn a moment falls in; an open turn reaches to now.
export function turnOfCall(spans: TurnSpan[], at: number): TurnSpan | undefined {
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i]!
    if (s.startedAt <= at && (s.endedAt === undefined || at <= s.endedAt)) return s
  }
  return undefined
}

export function showBars(bodyColumns: number): boolean {
  return bodyColumns >= 40
}

export function railRows(calls: Record<string, CallTiming>, agents: PlanAgent[], jobs: Job[], turn: TurnSpan, now: number): RailRow[] {
  const { start, end } = turnWindow(turn, now)
  const length = Math.max(1, end - start)
  const isOpen = turn.endedAt === undefined
  const children = new Map<string, number>()
  for (const c of Object.values(calls)) if (c.agentId !== undefined) children.set(c.agentId, (children.get(c.agentId) ?? 0) + 1)

  return Object.entries(calls)
    .filter(([, c]) => c.agentId === undefined && c.startedAt >= start && c.startedAt <= end)
    .sort(([, a], [, b]) => a.startedAt - b.startedAt)
    .map(([id, c]) => {
      const job = jobs.find(j => j.callId === id)
      const agent = agents.find(a => a.callId === id)
      // A background shell runs on after its Bash call returns; an agent's own end is when its turn completed.
      const running = job ? job.status === 'running' : agent ? agent.endedAt === undefined && c.endedAt === undefined && isOpen : c.endedAt === undefined && isOpen
      const stop = job ? (job.endedAt ?? now) : agent?.endedAt ?? c.endedAt ?? (isOpen ? now : end)
      const row: RailRow = {
        id,
        tool: c.tool,
        target: c.target ?? '',
        from: clamp((c.startedAt - start) / length),
        to: clamp((Math.min(stop, end) - start) / length),
        over: !isOpen && stop > end,
        running,
        failed: c.failed === true,
        kind: job ? 'job' : agent ? 'agent' : 'tool',
        ms: (job || agent ? stop : Math.min(stop, end)) - c.startedAt,
      }
      if (c.added !== undefined) row.added = c.added
      if (c.removed !== undefined) row.removed = c.removed
      if (agent) row.children = children.get(agent.id) ?? 0
      return row
    })
}

export function railSummary(rows: RailRow[], turn: TurnSpan, now: number): RailSummary {
  const { start, end } = turnWindow(turn, now)
  const files = new Map<string, { path: string; added: number; removed: number }>()
  const failures = new Map<string, { label: string; times: number }>()
  for (const r of rows) {
    if (r.added !== undefined || r.removed !== undefined) {
      const f = files.get(r.target) ?? { path: r.target, added: 0, removed: 0 }
      f.added += r.added ?? 0
      f.removed += r.removed ?? 0
      files.set(r.target, f)
    }
    if (r.failed) {
      const label = `${r.tool} ${r.target}`.trim()
      const f = failures.get(label) ?? { label, times: 0 }
      f.times += 1
      failures.set(label, f)
    }
  }
  const summary: RailSummary = {
    ms: end - start,
    tools: rows.reduce((n, r) => n + 1 + (r.children ?? 0), 0),
    agents: rows.filter(r => r.kind === 'agent').length,
    files: [...files.values()],
    failures: [...failures.values()],
  }
  if (turn.ctxStart !== undefined) summary.ctx = [turn.ctxStart, turn.ctxEnd ?? turn.ctxStart]
  if (turn.costStart !== undefined && turn.costEnd !== undefined) summary.cost = turn.costEnd - turn.costStart
  return summary
}
