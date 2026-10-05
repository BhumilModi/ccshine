import { atom, read, update } from 'claude-code'
import type { EngineInterface, Frozen, On, RenderElement, RenderInput, Timer } from 'claude-code'

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
import { bySource, lastTurn, wasCold } from '../usage'
import type { Segment } from '../theme'
import { activity } from '../activity'
import { IDLE_COLS, IDLE_ROWS, SCENE_ROWS, dockView, encodeCells, idleCells, modeAt, phaseTimes, sceneCells, score, site } from '../dock'

const tasks = atom({ plugin: 'tidepool', key: 'tasks' } as const, [])
const agents = atom({ plugin: 'tidepool', key: 'agents' } as const, [])
// Written by the tracker (features/track.tsx); atoms must be declared in the file that reads them.
const turns = atom({ plugin: 'tidepool', key: 'turns' } as const, [])
// Bumped every second while something runs, so live timers redraw.
const tick = atom({ plugin: 'tidepool', key: 'tick' } as const, 0)
// The prompt dock's turn (features/dock.tsx) and the calls in flight (features/track.tsx).
const dock = atom({ plugin: 'tidepool', key: 'dock' } as const, null)
const liveCalls = atom({ plugin: 'tidepool', key: 'live' } as const, {})
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

// Claude Code 2.1.289 stopped typing these tools' inputs and results; the shapes are unchanged.
type TaskCreateInput = { subject: string; activeForm?: string }
type TaskUpdateInput = { taskId: string; status?: PlanTask['status'] | 'deleted'; subject?: string; activeForm?: string }
type TodoWriteInput = { todos: Parameters<typeof syncTodos>[1] }

export function registerTasks(on: On) {
  on('tool.call', { tool: 'TaskCreate' }, async ($, raw, next) => {
    const e = raw as typeof raw & TaskCreateInput
    const ran = await next(raw)
    if (ran.deny !== undefined || ran.isError) return ran
    const now = await $.clock.now()
    const task: PlanTask = { id: (ran.result as { task: { id: string } }).task.id, subject: e.subject, status: 'pending', createdAt: now }
    if (e.activeForm) task.activeForm = e.activeForm
    // A new task after everything finished starts a new plan.
    await apply($, list => [...(list.every(t => t.status === 'completed') ? [] : list), task])
    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, raw, next) => {
    const e = raw as typeof raw & TaskUpdateInput
    const ran = await next(raw)
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

  on('tool.call', { tool: 'TodoWrite' }, async ($, raw, next) => {
    const e = raw as typeof raw & TodoWriteInput
    const ran = await next(raw)
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
      callId: e.tool_use_id,
    }
    await update($, agents, list => [...list, agent].slice(-50))
    await syncTicker($)
    return spawned
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const docking = opts.dock && e.surface === 'terminal' && !e.props.hasSurvey
    // The plan gives up the dock's rows: three idle, eight while a turn runs, plus the blank row above it.
    const reserve = docking ? 1 + (dockView((await read($, dock)) ?? undefined, await $.clock.now()).kind === 'idle' ? IDLE_ROWS : SCENE_ROWS + 2) : 0
    const plan = e.props.hasSurvey ? null : await planBand($, e, reserve)
    const docked = docking ? await dockBand($, e) : null
    if (!docked) {
      site.id = undefined
      return plan ?? next(e)
    }
    const { Box } = $.ui.resolve(e)
    return plan ? <Box flexDirection="column">{plan}{docked}</Box> : docked
  })
}

type Band = Frozen<RenderInput<'AbovePrompt'>>

// The plan, its agents and the usage rows; null when there is nothing to show.
async function planBand($: EngineInterface, e: Band, reserve: number): Promise<RenderElement | null> {
  {
    const list = await read($, tasks)
    const turnList = await read($, turns)
    const last = lastTurn(turnList)
    const showTasks = opts.tasks && list.length > 0
    const showUsage = opts.usage && last !== undefined
    if (!showTasks && !showUsage) return null
    const C = palette()

    const { Box, Text } = $.ui.resolve(e)
    await read($, tick)
    const now = await $.clock.now()
    const agentList = agentRows(await read($, agents), turnList)

    // Usage: only what the status line does not show — a cold-cache warning, and tokens split by agent.
    let usage: RenderElement | null = null
    if (showUsage && last && last.usage) {
      const previous = [...turnList].reverse().find(t => t.agentId === undefined && t.usage && t !== last && t.startedAt < last.startedAt)
      const cold = wasCold(last, previous)
      const sources = bySource(turnList, await read($, agents), now - 30 * 60_000)
      if (cold || sources.length > 1) {
        usage = (
          <Box key="usage" flexDirection="column">
            {cold && (
              <Text color={C.warn} wrap="truncate-end">{`⚠ cache was cold · this turn re-sent ${fmtTokens(last.usage.cacheWrite)} at full price`}</Text>
            )}
            {sources.length > 1 && (
              <Text color={C.faint} wrap="truncate-end">{sources.map(s => `${s.source} ${fmtTokens(s.tokens)}`).join(' · ')}</Text>
            )}
          </Box>
        )
      }
    }
    const withUsage = (el: RenderElement | null): RenderElement =>
      usage === null ? (el ?? <Box />) : (
        <Box flexDirection="column">
          {el}
          <Box paddingLeft={1}>{usage}</Box>
        </Box>
      )
    if (!showTasks) return usage === null ? null : withUsage(null)
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
    if (finished) return withUsage(<Box paddingLeft={1}>{headerRow}</Box>)

    // Header takes one row and the band gap one more; keep it short so the prompt stays in view.
    const room = Math.max(1, Math.min(MAX_TASK_ROWS, e.props.maxRows - 3 - reserve))
    const { start, shown, after } = window(list, room)

    return withUsage(
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
  }
}

const SCENE_MAX = 64
// Below these widths the key hints, then the phase times, drop rather than wrap the row.
const KEYS_FROM = 72
const PHASES_FROM = 56
const KEYS = [['⏎', 'send'], ['/', 'commands'], ['@', 'files'], ['?', 'shortcuts']] as const

// The prompt dock: the crab's corner and the prompt label when idle; the step, the scene and the calls while a turn runs.
async function dockBand($: EngineInterface, e: Band): Promise<RenderElement> {
  const { Box, Text, Raster } = $.ui.resolve(e) as ReturnType<EngineInterface['ui']['resolve']> & { Raster: (props: Record<string, unknown>) => RenderElement }
  const C = palette()
  await read($, tick)
  const turn = await read($, dock)
  const now = await $.clock.now()
  const view = dockView(turn ?? undefined, now)
  site.id = e.requestId
  if (view.kind === 'idle' || !turn) {
    site.cols = undefined
    const project = (await $.session.root()).split(/[\\/]/).filter(Boolean).pop() ?? ''
    return (
      <Box key="dock" marginTop={1} paddingLeft={1}>
        <Raster key="dock-idle" columns={IDLE_COLS} rows={IDLE_ROWS} cells={encodeCells(idleCells(false, C))} />
        <Box flexDirection="column" flexGrow={1}>
          <Text> </Text>
          <Box>
            <Text color={C.accent} bold wrap="truncate-end">{'◆ '}</Text>
            <Text color={C.ink} bold wrap="truncate-end">Ask Claude</Text>
            {project && <Text color={C.faint} wrap="truncate-end">{`  ${project}`}</Text>}
            <Box flexGrow={1} />
            {e.props.bodyColumns >= KEYS_FROM &&
              KEYS.flatMap(([key, word], i) => [
                <Text key={`k${i}`} color={C.accent} wrap="truncate-end">{`${i ? '   ' : ''}${key}`}</Text>,
                <Text key={`w${i}`} color={C.faint} wrap="truncate-end">{` ${word}`}</Text>,
              ])}
          </Box>
          <Text> </Text>
        </Box>
      </Box>
    )
  }
  const cols = Math.max(20, Math.min(SCENE_MAX, e.props.bodyColumns - 2))
  site.cols = cols
  const mode = modeAt(turn, now)
  const live = Object.values(await read($, liveCalls)).filter(c => c.agentId === undefined)
  const ending = view.kind === 'finish' || view.kind === 'outro'
  const step = ending ? (turn.aborted ? 'Stopped' : 'Done!') : (activity(live) ?? STEP[mode])
  const result = ending && !turn.aborted ? score(turn) : undefined
  const spent = phaseTimes(turn, now)
  const color = MODE_COLOR(C)[mode]
  const recent = turn.calls.slice(-3)
  return (
    <Box key="dock" flexDirection="column" marginTop={1} paddingLeft={1}>
      <Box>
        <Text color={ending ? C.accent : color} bold wrap="truncate-end">{'◆ '}</Text>
        <Text color={C.ink} bold wrap="truncate-end">{ending ? step : `${step}…`}</Text>
        {result && <Text color={C.warn} bold wrap="truncate-end">{'  ★ '}</Text>}
        {result && <Text color={C.ink} wrap="truncate-end">{`${result.jumped} jumped · ${result.crates} crate${result.crates === 1 ? '' : 's'} · ${fmtClock(result.ms)}`}</Text>}
        <Box flexGrow={1} />
        {!ending && e.props.bodyColumns >= PHASES_FROM &&
          (['thinking', 'tool', 'responding'] as const).flatMap((m, i) => [
            <Text key={`p${m}`} color={m === mode ? MODE_COLOR(C)[m] : C.faint} wrap="truncate-end">{`${i ? ' · ' : ''}${PHASE_LABEL[m]} `}</Text>,
            <Text key={`s${m}`} color={m === mode ? C.ink : C.faint} wrap="truncate-end">{`${Math.round(spent[m])}s`}</Text>,
          ])}
        {!result && <Text color={C.mid} wrap="truncate-end">{`   ${fmtClock((turn.endedAt ?? now) - turn.startedAt)}`}</Text>}
      </Box>
      <Raster key="dock-scene" columns={cols} rows={SCENE_ROWS} cells={encodeCells(sceneCells(view, turn, now, cols, C))} />
      <Box>
        {recent.length === 0 ? (
          <Text color={C.faint} wrap="truncate-end">Waiting for the first tool call</Text>
        ) : (
          recent.map((c, i) => (
            <Box key={`c${c.id}`}>
              <Text color={c.done ? C.mid : color} wrap="truncate-end">{`${i ? '    ' : ''}${c.done ? '✓' : '…'} `}</Text>
              <Text color={c.done ? C.faint : C.ink} wrap="truncate-end">{c.label}</Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
}

const STEP = { requesting: 'Working', thinking: 'Thinking', tool: 'Running a tool', responding: 'Writing the reply' } as const
const PHASE_LABEL = { thinking: 'think', tool: 'tools', responding: 'reply' } as const
const MODE_COLOR = (C: ReturnType<typeof palette>) => ({ requesting: C.faint, thinking: C.accent, tool: C.info, responding: C.ink })
