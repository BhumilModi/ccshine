import type { PlanAgent, PlanTask } from '../types'

type Status = PlanTask['status']

export function setStatus(task: PlanTask, status: Status, now: number): PlanTask {
  if (status === task.status) return task
  if (status === 'in_progress') return { ...task, status, startedAt: now }
  if (status === 'completed') return { ...task, status, doneAt: now }
  return { ...task, status }
}

// TodoWrite sends the whole list each time; keep timestamps of todos we already know.
export function syncTodos(
  old: PlanTask[],
  todos: ReadonlyArray<{ content: string; status: Status }>,
  now: number,
): PlanTask[] {
  return todos.map(todo => {
    const known = old.find(t => t.id === todo.content)
    const base = known ?? { id: todo.content, subject: todo.content, status: 'pending' as Status, createdAt: now }
    return setStatus(base, todo.status, now)
  })
}

// How long each finished task took. A task marked done without being started counts from the previous finish.
export function durations(tasks: PlanTask[]): Map<string, number> {
  let prevDone = Math.min(...tasks.map(t => t.createdAt))
  const out = new Map<string, number>()
  for (const t of tasks.filter(t => t.status === 'completed').sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0))) {
    const start = t.startedAt ?? prevDone
    prevDone = t.doneAt ?? prevDone
    out.set(t.id, Math.max(0, (t.doneAt ?? start) - start))
  }
  return out
}

// Durations of tasks that finished between two versions of the list.
export function newlyDone(before: PlanTask[], after: PlanTask[]): number[] {
  const wasDone = new Set(before.filter(t => t.status === 'completed').map(t => t.id))
  const took = durations(after)
  return after.filter(t => t.status === 'completed' && !wasDone.has(t.id)).map(t => took.get(t.id) ?? 0)
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

// Past plans count as PRIOR_WEIGHT tasks, so this plan's own pace takes over after a few tasks.
// Median of history so one task left running overnight doesn't skew it.
// ponytail: one global history across projects and task sizes; key by project if estimates drift.
const PRIOR_WEIGHT = 2

export function estimate(tasks: PlanTask[], now: number, history: number[] = []) {
  const took = [...durations(tasks).values()]
  const done = took.length
  const left = tasks.length - done
  const prior = median(history)
  const sum = took.reduce((a, b) => a + b, 0)
  const avg =
    prior === undefined ? (done ? sum / done : undefined) : (sum + PRIOR_WEIGHT * prior) / (done + PRIOR_WEIGHT)
  const running = tasks.filter(t => t.status === 'in_progress')
  const runningElapsed = running.reduce((total, t) => total + Math.min(avg ?? 0, now - (t.startedAt ?? now)), 0)
  const msLeft = avg === undefined ? undefined : Math.max(0, avg * left - runningElapsed)
  const first = Math.min(...tasks.map(t => t.startedAt ?? t.createdAt))
  return { done, total: tasks.length, msLeft, elapsed: now - first, fromPastOnly: done === 0 && prior !== undefined }
}

export function fmt(ms: number): string {
  const m = Math.round(ms / 60000)
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// The time-left part of the header, without the "Plan x/y" prefix.
export function timeLeft(tasks: PlanTask[], now: number, history: number[] = []): string {
  const { done, total, msLeft, elapsed, fromPastOnly } = estimate(tasks, now, history)
  if (done === total) return `done in ${fmt(elapsed)}`
  if (msLeft === undefined) return 'ETA after first task'
  return `~${fmt(msLeft)} left${fromPastOnly ? ' (from past plans)' : ''}`
}

export function summary(tasks: PlanTask[], now: number, history: number[] = []): string | undefined {
  if (tasks.length === 0) return undefined
  const { done, total, msLeft, elapsed, fromPastOnly } = estimate(tasks, now, history)
  if (done === total) return `Plan ${done}/${total} done in ${fmt(elapsed)}`
  if (msLeft === undefined) return `Plan ${done}/${total} · ETA after first task`
  return `Plan ${done}/${total} · ~${fmt(msLeft)} left${fromPastOnly ? ' (from past plans)' : ''}`
}

// Which tasks fit in `room` rows: one finished task for context, then the running one and what's next.
export function window(tasks: PlanTask[], room: number) {
  if (tasks.length <= room) return { start: 0, shown: tasks, after: 0 }
  const current = tasks.findIndex(t => t.status !== 'completed')
  const start = Math.max(0, Math.min(current - 1, tasks.length - room))
  const shown = tasks.slice(start, start + room)
  return { start, shown, after: tasks.length - start - shown.length }
}

// The task a new agent belongs to: the most recently started task still running.
// ponytail: ignores which loop spawned the agent; match on parentAgentId if parallel controllers mix up.
export function currentTaskId(tasks: PlanTask[]): string | undefined {
  return tasks
    .filter(t => t.status === 'in_progress')
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0]?.id
}

// Finished agents stay visible this long before folding away.
export const AGENT_LINGER_MS = 30_000

export function visibleAgents(agents: PlanAgent[], taskId: string | undefined, now: number): PlanAgent[] {
  return agents.filter(
    a => a.taskId === taskId && (a.status === 'running' || now - (a.endedAt ?? now) < AGENT_LINGER_MS),
  )
}

// Clock-style duration for live rows, like Claude Code's own agent list: 47s, 2m 47s, 1h 37m.
export function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
