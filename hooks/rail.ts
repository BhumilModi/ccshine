import type { CallTiming, Job, PlanAgent, RailRow, RailSummary, TurnSpan } from '../types'

// Anchor rows on screen, by turn id. Render hooks may not write plugin state, so the anchor row records here
// and the rail's one-second timer (features/startup.tsx) copies changes into the anchorsSeen atom.
// ponytail: the rail follows a scroll within a second, not on the same frame.
export const anchorsOnScreen = new Map<string, boolean>()

// Where the surface last seated the rail, recorded by its Pane render (a module value, as above): tool rows
// hand over to the rail only while it is docked beside the transcript.
export const railSeat: { placement?: 'dock' | 'inline' } = {}

// Body columns the rail asks for when it opens: enough for the timing bars (showBars) beside the targets.
// A width the person drags the rail to wins.
export const RAIL_COLUMNS = 48

// Which call carries each turn's anchor: the first of the turn's rows that actually draws. Some tools
// (TodoWrite, the Task tools) draw no row, so "the turn's first call" alone could leave a turn with none.
// ponytail: first to draw keeps it; a row scrolled in later from above draws nothing rather than move the anchor.
export const anchorOf = new Map<string, string>()

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
      // A background shell runs on after its Bash call returns, and an agent after its Agent call returns:
      // each ends at its own end (the job's notification, the agent's turn completing).
      const running = job ? job.status === 'running' : agent ? agent.endedAt === undefined : c.endedAt === undefined && isOpen
      const stop = job ? (job.endedAt ?? now) : agent ? (agent.endedAt ?? now) : (c.endedAt ?? (isOpen ? now : end))
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

// Which turn the rail shows: a pinned one; else the live turn while its anchor is on screen or not drawn yet;
// else the first turn whose anchor is on screen; else the newest.
// ponytail: with no anchor on screen (mid long reply) it falls back to the newest turn, not the one scrolled past.
export function pickTurn(
  spans: TurnSpan[],
  sel: { turnId?: string; pinned: boolean },
  seen: Record<string, boolean>,
): TurnSpan | undefined {
  if (sel.pinned) {
    const pinned = spans.find(s => s.turnId === sel.turnId)
    if (pinned) return pinned
  }
  const live = spans.findLast(s => s.endedAt === undefined)
  if (live && seen[live.turnId] !== false) return live
  return spans.find(s => seen[s.turnId] === true) ?? spans.at(-1)
}

const MAX_DETAIL = 200
const firstLine = (text: unknown) => (typeof text === 'string' ? (text.split('\n')[0] ?? '') : '').slice(0, MAX_DETAIL)

// What a pressed rail row shows under itself: the Bash command and its last output lines, or the error.
export function callDetail(tool: string, input: unknown, ran: { result?: unknown; isError?: boolean; text?: string }): string[] {
  const i = (input ?? {}) as Record<string, unknown>
  const lines: string[] = []
  if (tool === 'Bash') {
    lines.push(`$ ${firstLine(i.command)}`)
    const out = (ran.result ?? {}) as { stdout?: unknown; stderr?: unknown }
    const text = [out.stdout, out.stderr].filter(t => typeof t === 'string').join('\n')
    lines.push(...text.split('\n').filter(l => l.trim()).slice(-3).map(l => l.slice(0, MAX_DETAIL)))
  }
  if (ran.isError && ran.text) lines.push(firstLine(ran.text))
  return lines
}

// The docked rail splits about 40-45-15: the turn's tool rows, the plan section, the footer (rule, cost,
// failures, files). Plan and footer shares are caps; rows they leave go to the tool rows.
const PLAN_SHARE = 0.45
const FOOT_SHARE = 0.15

// The plan section's rows: its share of the rail (all of it when showing all), never less than its header and
// running task, and never more than the `fixed` rows above it leave.
export function sectionCap(bodyRows: number, fixed: number, all: boolean): number {
  if (all) return Number.MAX_SAFE_INTEGER
  return Math.min(Math.floor(bodyRows * PLAN_SHARE), Math.max(2, bodyRows - fixed - 1))
}

// Shares the docked rail's rows once the plan section is laid out. Fixed: brand, title, and the footer's rule and
// cost line; the two margins only while they leave a row for the timeline. Failures, then files, fill the rest of
// the footer's share; the tool rows take what is left, the axis and an "earlier" marker included. `shown` below
// `tools` means the marker draws.
// ponytail: a rail under 7 rows still passes bodyRows by a row or two; nothing seats a rail that short today.
export function railBudget(a: { bodyRows: number; tools: number; bars: boolean; files: number; failures: number; section: number }) {
  const base = 2
  let extra = Math.max(0, Math.floor(a.bodyRows * FOOT_SHARE) - base)
  const failures = Math.min(a.failures, extra)
  extra -= failures
  const files = Math.min(a.files, extra)
  const room = a.bodyRows - 2 - base - failures - files - a.section
  const margins = room >= 3
  const left = margins ? room - 2 : room
  const fits = { section: a.section, files, failures, margins }
  if (a.tools === 0) return { ...fits, shown: 0 }
  if (a.tools + (a.bars ? 1 : 0) <= left) return { ...fits, shown: a.tools }
  // The marker takes a row; the axis draws only under shown rows.
  return { ...fits, shown: Math.max(0, left - 1 - (a.bars ? 1 : 0)) }
}
