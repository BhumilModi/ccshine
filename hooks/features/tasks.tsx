import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

import type { PlanAgent, PlanTask } from '../../types'
import {
  AGENT_LINGER_MS,
  agentRows,
  currentTaskId,
  estimate,
  fmt,
  fmtClock,
  fmtTokens,
  newlyDone,
  setStatus,
  syncTodos,
  timeLeft,
  visibleAgents,
  window,
} from '../plan'
import { bar, glyphsOn, palette, powerline, runsWidth } from '../theme'
import { opts } from '../options'
import type { Segment } from '../theme'

const tasks = atom({ plugin: 'terminal-plus', key: 'tasks' } as const, [])
const agents = atom({ plugin: 'terminal-plus', key: 'agents' } as const, [])
// Written by the tracker (features/track.tsx); atoms must be declared in the file that reads them.
const turns = atom({ plugin: 'terminal-plus', key: 'turns' } as const, [])
// Bumped every second while something runs, so live timers redraw.
const tick = atom({ plugin: 'terminal-plus', key: 'tick' } as const, 0)
const MAX_TASK_ROWS = 8
const MAX_AGENT_ROWS = 4

let ticker: Timer | undefined

// Runs the 1s redraw timer only while a task or agent is live, or a finished agent is still fading out.
async function syncTicker($: EngineInterface) {
  const now = await $.clock.now()
  const live =
    (await read($, tasks)).some(t => t.status === 'in_progress') ||
    agentRows(await read($, agents), await read($, turns)).some(a => a.status === 'running' || now - (a.endedAt ?? now) < AGENT_LINGER_MS)
  if (live && ticker === undefined) {
    ticker = $.clock.every(1000, () => {
      void update($, tick, n => n + 1).then(() => syncTicker($))
    })
  } else if (!live && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
}
const HISTORY_SIZE = 50

// Task durations from past plans per project root, kept across sessions in this plugin's store; read on first use.
// ponytail: keyed by session root, so each git worktree learns separately; key by repo remote if that matters.
let byProject: Record<string, number[]> | undefined

async function loadHistory($: EngineInterface): Promise<Record<string, number[]>> {
  if (byProject === undefined) {
    const saved = await $.store.get('history-by-project')
    byProject = {}
    if (saved && typeof saved === 'object') {
      for (const [root, list] of Object.entries(saved)) {
        if (Array.isArray(list)) byProject[root] = list.filter((n): n is number => typeof n === 'number')
      }
    }
  }
  return byProject
}

// This project's history; a project with none yet borrows every other project's until it has its own.
async function projectHistory($: EngineInterface): Promise<number[]> {
  const all = await loadHistory($)
  return all[await $.session.root()] ?? Object.values(all).flat()
}

async function apply($: EngineInterface, change: (list: PlanTask[]) => PlanTask[]) {
  const before = await read($, tasks)
  const after = change(before)
  await update($, tasks, () => after)
  const finished = newlyDone(before, after)
  if (finished.length > 0) {
    const all = await loadHistory($)
    const root = await $.session.root()
    byProject = { ...all, [root]: [...(all[root] ?? []), ...finished].slice(-HISTORY_SIZE) }
    await $.store.set('history-by-project', byProject)
  }
  await syncTicker($)
}

export function registerTasks(on: On) {
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const now = await $.clock.now()
    const task: PlanTask = { id: ran.result.task.id, subject: e.subject, status: 'pending', createdAt: now }
    if (e.activeForm) task.activeForm = e.activeForm
    // A new task after everything finished starts a new plan.
    await apply($, list => [...(list.every(t => t.status === 'completed') ? [] : list), task])
    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const now = await $.clock.now()
    const status = e.status
    await apply($, list =>
      status === 'deleted'
        ? list.filter(t => t.id !== e.taskId)
        : list.map(t =>
            t.id !== e.taskId ? t : setStatus({ ...t, subject: e.subject ?? t.subject, activeForm: e.activeForm ?? t.activeForm }, status ?? t.status, now),
          ),
    )
    return ran
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const now = await $.clock.now()
    await apply($, list => syncTodos(list, e.todos, now))
    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny !== undefined) return spawned
    const agent: PlanAgent = {
      id: spawned.agentId ?? e.tool_use_id,
      description: e.description,
      type: e.subagentType,
      taskId: currentTaskId(await read($, tasks)),
      startedAt: await $.clock.now(),
    }
    await update($, agents, list => [...list, agent].slice(-50))
    await syncTicker($)
    return spawned
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, tasks)
    if (!opts.tasks || e.props.hasSurvey || list.length === 0) return next(e)
    const C = palette()

    const { Box, Text } = $.ui.resolve(e)
    await read($, tick)
    const now = await $.clock.now()
    const agentList = agentRows(await read($, agents), await read($, turns))
    const past = await projectHistory($)

    const agentLines = (taskId: string | undefined, indent: string) => {
      const live = visibleAgents(agentList, taskId, now)
      const rows = live.slice(-MAX_AGENT_ROWS).map(a => {
        const time = fmtClock((a.endedAt ?? now) - a.startedAt)
        const meta = a.tokens ? `${time} · ${fmtTokens(a.tokens)} tokens` : time
        const mark = a.status === 'running' ? '◆' : a.status === 'done' ? '✓' : '✕'
        const isLive = a.status === 'running'
        return (
          <Box key={`agent-${a.id}`}>
            <Text color={isLive ? C.accent : C.track}>{`${indent}${mark} `}</Text>
            <Text color={isLive ? C.soft : C.faint}>{a.type}</Text>
            <Text color={C.faint} wrap="truncate-end">{`  ${a.description}`}</Text>
            <Text color={isLive ? C.mid : C.track}>{`  ${meta}`}</Text>
          </Box>
        )
      })
      if (live.length > MAX_AGENT_ROWS) {
        rows.unshift(<Text key={`agents-more-${taskId ?? 'none'}`} color={C.faint}>{`${indent}+${live.length - MAX_AGENT_ROWS} earlier agents`}</Text>)
      }
      return rows
    }
    const { done, total } = estimate(list, now, past)
    const finished = done === total
    const progress = bar(total ? done / total : 0)

    const header: Segment[] = [
      { bg: C.accent, parts: [{ text: finished ? ' ✓ Plan ' : ' Plan ', color: C.onAccent, bold: true }] },
      {
        bg: C.seg,
        parts: [
          { text: ` ${done}/${total} `, color: C.ink },
          { text: progress.filled, color: finished ? C.accent : C.mid },
          { text: `${progress.track} `, color: C.track },
        ],
      },
      { bg: C.segAlt, parts: [{ text: ` ${timeLeft(list, now, past)} `, color: finished ? C.mid : C.ink }] },
    ]
    // Narrow terminal: drop the time-left segment rather than wrap the header.
    let runs = powerline(header, glyphsOn(e.surface))
    if (runsWidth(runs) > e.props.bodyColumns - 2) runs = powerline(header.slice(0, 2), glyphsOn(e.surface))
    const headerRow = (
      <Box key="header">
        {runs.map((run, i) => (
          <Text key={`h${i}`} color={run.color} backgroundColor={run.backgroundColor} bold={run.bold}>
            {run.text}
          </Text>
        ))}
      </Box>
    )
    if (finished) return headerRow

    // Header takes one row and the band gap one more; keep it short so the prompt stays in view.
    const room = Math.max(1, Math.min(MAX_TASK_ROWS, e.props.maxRows - 3))
    const { start, shown, after } = window(list, room)

    return (
      <Box flexDirection="column" paddingLeft={1}>
        {headerRow}
        {start > 0 && <Text key="before" color={C.faint}>  {start} earlier done</Text>}
        {shown.map((t, i) => {
          const n = start + i + 1
          const label = `${n}. ${t.subject}`
          if (t.status === 'completed') {
            const took = t.startedAt !== undefined && t.doneAt !== undefined ? fmt(t.doneAt - t.startedAt) : ''
            return (
              <Box key={`task-${n}`}>
                <Text color={C.mid}>{'✓ '}</Text>
                <Text color={C.faint} wrap="truncate-end">{label}</Text>
                {took && <Text color={C.track}>{`  ${took}`}</Text>}
              </Box>
            )
          }
          if (t.status === 'in_progress') {
            const running = t.startedAt !== undefined ? fmtClock(now - t.startedAt) : ''
            return (
              <Box key={`task-${n}`} flexDirection="column">
                <Box>
                  <Text color={C.accent} bold>{'▶ '}</Text>
                  <Text color={C.ink} bold wrap="truncate-end">{label}</Text>
                  {running && <Text color={C.mid}>{`  ${running}`}</Text>}
                </Box>
                {agentLines(t.id, '    ')}
              </Box>
            )
          }
          return (
            <Box key={`task-${n}`}>
              <Text color={C.track}>{'· '}</Text>
              <Text color={C.soft} wrap="truncate-end">{label}</Text>
            </Box>
          )
        })}
        {after > 0 && <Text key="after" color={C.faint}>  +{after} more</Text>}
        {visibleAgents(agentList, undefined, now).length > 0 && (
          <Text key="agents-label" color={C.faint}>  agents</Text>
        )}
        {agentLines(undefined, '    ')}
      </Box>
    )
  })
}
