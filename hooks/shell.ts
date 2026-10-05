import type { CallTiming, Job, LiveCall } from '../types'
import { AGENT_LINGER_MS, median } from './plan'

const RUNS_PER_COMMAND = 10
const MAX_COMMANDS = 200

// ponytail: exact command text after trimming; normalize paths or flags if ETAs miss too often.
export function commandKey(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

// A background Bash call's result names the file its output streams to.
export function parseOutputPath(text: string): string | undefined {
  return /Output is being written to: (.+?\.output)/.exec(text)?.[1]
}

// The line a progress bar or test runner printed last: colour codes dropped, a `\r` redraw keeps its newest text.
export function lastLine(output: string): string | undefined {
  const lines = output
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .split('\n')
    .map(line => (line.split('\r').filter(part => part.trim()).at(-1) ?? '').trim())
    .filter(Boolean)
  return lines.at(-1)
}

// Durations of past runs by command; the newest-recorded command sits last, so the oldest fall off first.
export function recordRun(history: Record<string, number[]>, key: string, ms: number): Record<string, number[]> {
  const { [key]: runs = [], ...rest } = history
  const kept = Object.entries(rest).slice(-(MAX_COMMANDS - 1))
  return { ...Object.fromEntries(kept), [key]: [...runs, ms].slice(-RUNS_PER_COMMAND) }
}

export function shellEta(history: Record<string, number[]>, key: string, elapsed: number): { left: number } | { over: number } | undefined {
  const typical = median(history[key] ?? [])
  if (typical === undefined) return undefined
  return elapsed <= typical ? { left: typical - elapsed } : { over: elapsed - typical }
}

// The store's saved history, keeping only well-formed entries.
export function parseHistory(saved: unknown): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  if (saved && typeof saved === 'object') {
    for (const [key, runs] of Object.entries(saved)) {
      if (Array.isArray(runs)) out[key] = runs.filter((n): n is number => typeof n === 'number')
    }
  }
  return out
}

export type ShellRow = {
  id: string
  label: string
  command?: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'error' | 'killed'
  background: boolean
  outputFile?: string
}

// A finished foreground shell this quick is noise in the band; the rail still lists it.
const SHORT_MS = 5000

// Shells for the band: running ones, and finished ones fading out like agents do. Oldest first.
export function shellRows(calls: Record<string, CallTiming>, live: Record<string, LiveCall>, jobs: Job[], now: number): ShellRow[] {
  const rows: ShellRow[] = []
  const jobCalls = new Set(jobs.map(j => j.callId))
  const fresh = (end: number | undefined) => end === undefined || now - end < AGENT_LINGER_MS
  for (const [id, c] of Object.entries(calls)) {
    if (c.tool !== 'Bash' || c.agentId !== undefined || jobCalls.has(id)) continue
    const running = id in live
    if (running && live[id]?.input.run_in_background === true) continue
    if (!running && (c.endedAt === undefined || !fresh(c.endedAt) || c.endedAt - c.startedAt < SHORT_MS)) continue
    const command = live[id]?.input.command
    rows.push({
      id,
      label: c.target || (typeof command === 'string' ? command : 'shell'),
      ...(typeof command === 'string' ? { command } : {}),
      startedAt: c.startedAt,
      ...(running || c.endedAt === undefined ? {} : { endedAt: c.endedAt }),
      status: running ? 'running' : c.failed ? 'error' : 'done',
      background: false,
    })
  }
  for (const j of jobs) {
    if (j.status !== 'running' && !fresh(j.endedAt)) continue
    rows.push({
      id: j.id,
      label: calls[j.callId]?.target || j.command || 'background shell',
      ...(j.command === undefined ? {} : { command: j.command }),
      startedAt: j.startedAt,
      ...(j.endedAt === undefined ? {} : { endedAt: j.endedAt }),
      status: j.status,
      background: true,
      ...(j.outputFile === undefined ? {} : { outputFile: j.outputFile }),
    })
  }
  return rows.sort((a, b) => a.startedAt - b.startedAt)
}
