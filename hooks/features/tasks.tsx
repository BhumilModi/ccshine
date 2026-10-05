import { atom, read, update } from 'claude-code'
import type { EngineInterface, Frozen, On, RenderElement, RenderInput, Timer } from 'claude-code'

import type { PlanAgent, PlanTask } from '../../types'
import {
  AGENT_LINGER_MS,
  agentRows,
  currentTaskId,
  fmtClock,
  fmtTokens,
  finishedAt,
  newlyDone,
  setStatus,
  syncTodos,
  topLevel,
} from '../plan'
import { planBody, planHeader, planWanted, shellBody } from '../planview'
import type { PlanData } from '../planview'
import { fitBand } from '../layout'
import type { DockSize } from '../layout'
import { palette } from '../theme'
import { opts } from '../options'
import { bySource, lastTurn, wasCold } from '../usage'
import { activity } from '../activity'
import { lastLine, parseHistory, shellRows } from '../shell'
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
// The tracker's calls and the rail's turns: a docked rail shows the newest turn's agents itself.
const calls = atom({ plugin: 'tidepool', key: 'calls' } as const, {})
const spans = atom({ plugin: 'tidepool', key: 'spans' } as const, [])
// Background shells (features/track.tsx) and past shell durations by command, for the band's shell rows.
const jobs = atom({ plugin: 'tidepool', key: 'jobs' } as const, [])
const shellHistory = atom({ plugin: 'tidepool', key: 'shellHistory' } as const, null)
// Every plan row, or only what fits beside the dock; toggled from the Plan header.
const planAll = atom({ plugin: 'tidepool', key: 'planAll' } as const, false)
const MAX_SHELL_ROWS = 4

let ticker: Timer | undefined

// A finished plan shows its total briefly, then folds away until a new one starts.
function lingers(list: PlanTask[], now: number): boolean {
  const at = finishedAt(topLevel(list))
  return at !== undefined && now - at < AGENT_LINGER_MS
}

// Runs the 1s redraw timer only while a task, agent or shell is live, or a finished one is still fading out.
// `force` starts it before the tracker has recorded a new shell; the next tick re-checks.
async function syncTicker($: EngineInterface, force = false) {
  const now = await $.clock.now()
  const live =
    force ||
    (opts.tasks && shellRows(await read($, calls), await read($, liveCalls), await read($, jobs), now).length > 0) ||
    (await read($, tasks)).some(t => t.status === 'in_progress') ||
    lingers(await read($, tasks), now) ||
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
  const finished = newlyDone(topLevel(before), topLevel(after))
  if (finished.length > 0) {
    const all = await loadHistory($)
    const root = await $.session.root()
    byProject = { ...all, [root]: [...(all[root] ?? []), ...finished].slice(-HISTORY_SIZE) }
    await $.store.set('history-by-project', byProject)
  }
  await syncTicker($)
}

// Claude Code 2.1.289 stopped typing these tools' inputs and results; the shapes are unchanged.
type TaskCreateInput = { subject: string; activeForm?: string; metadata?: Record<string, unknown> }
type TaskUpdateInput = { taskId: string; status?: PlanTask['status'] | 'deleted'; subject?: string; activeForm?: string; metadata?: Record<string, unknown> }

// `metadata.parent` names a sub-item's task; null on an update makes it top-level again.
function parentOf(metadata: Record<string, unknown> | undefined): string | null | undefined {
  const p = metadata?.parent
  return typeof p === 'string' || typeof p === 'number' ? String(p) : p === null ? null : undefined
}
type TodoWriteInput = { todos: Parameters<typeof syncTodos>[1] }

export function registerTasks(on: On) {
  on('tool.call', { tool: 'TaskCreate' }, async ($, raw, next) => {
    const e = raw as typeof raw & TaskCreateInput
    const ran = await next(raw)
    if (ran.deny !== undefined || ran.isError) return ran
    const now = await $.clock.now()
    const task: PlanTask = { id: (ran.result as { task: { id: string } }).task.id, subject: e.subject, status: 'pending', createdAt: now }
    if (e.activeForm) task.activeForm = e.activeForm
    const parent = parentOf(e.metadata)
    if (parent) task.parent = parent
    // A new task after everything finished starts a new plan; a sub-item joins its parent's.
    await apply($, list => [...(!parent && list.every(t => t.status === 'completed') ? [] : list), task])
    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, raw, next) => {
    const e = raw as typeof raw & TaskUpdateInput
    const ran = await next(raw)
    if (ran.deny !== undefined || ran.isError) return ran
    const now = await $.clock.now()
    const status = e.status
    const parent = parentOf(e.metadata)
    const reparent = (t: PlanTask): PlanTask => {
      if (parent === undefined) return t
      const { parent: _old, ...rest } = t
      return parent === null ? rest : { ...rest, parent }
    }
    await apply($, list =>
      status === 'deleted'
        ? list.filter(t => t.id !== e.taskId)
        : list.map(t =>
            t.id !== e.taskId
              ? t
              : setStatus(reparent({ ...t, subject: e.subject ?? t.subject, activeForm: e.activeForm ?? t.activeForm }), status ?? t.status, now),
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

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (opts.tasks) {
      // Drawing cannot write state, so the band's ETA history is loaded here, at the first shell.
      if ((await read($, shellHistory)) === null) {
        const loaded = parseHistory(await $.store.get('shell-history'))
        await update($, shellHistory, known => known ?? loaded)
      }
      await syncTicker($, true)
    }
    return next(e)
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
    const kind = !docking ? 'none' : dockView((await read($, dock)) ?? undefined, await $.clock.now()).kind === 'idle' ? 'idle' : 'live'
    // The plan and the dock share the band's rows (layout.ts), so the dock is never scrolled out of sight.
    const band = e.props.hasSurvey ? null : await planBand($, e, kind)
    const alone = { maxRows: e.props.maxRows, dock: kind, header: false, focus: false, shell: 0, plan: 0, tails: 0, usage: 0, expanded: false } as const
    const docked = docking ? await dockBand($, e, band?.dock ?? fitBand(alone).dock) : null
    if (!docked) {
      site.id = undefined
      return band?.el ?? next(e)
    }
    const { Box } = $.ui.resolve(e)
    return band?.el ? <Box flexDirection="column">{band.el}{docked}</Box> : docked
  })
}

type Band = Frozen<RenderInput<'AbovePrompt'>>

// A rail docked beside the transcript (fullscreen, 110+ columns) already shows the newest turn's agents;
// agents from earlier turns still running stay in the band, where they would otherwise be out of sight.
async function railDocked($: EngineInterface, e: Band): Promise<boolean> {
  if (!opts.rail || e.viewport?.isFullscreen !== true || e.viewport.columns < 110) return false
  try {
    return (await $.ui.panes()).some(pane => pane.id === 'tidepool-rail' && pane.isPlaced)
  } catch {
    return false
  }
}

async function onRail($: EngineInterface, agent: PlanAgent): Promise<boolean> {
  const call = agent.callId === undefined ? undefined : (await read($, calls))[agent.callId]
  const newest = (await read($, spans)).at(-1)
  return call !== undefined && newest !== undefined && call.startedAt >= newest.startedAt
}

// The plan, its agents, running shells and the usage rows, fitted with the dock into the band's rows.
// Null when there is nothing to show; `dock` is the size the dock should draw at.
async function planBand($: EngineInterface, e: Band, dockKind: 'none' | 'idle' | 'live'): Promise<{ el: RenderElement | null; dock: DockSize } | null> {
  const list = await read($, tasks)
  const turnList = await read($, turns)
  const last = lastTurn(turnList)
  await read($, tick)
  const now = await $.clock.now()
  const top = topLevel(list)
  const doneAt = finishedAt(top)
  const showTasks = opts.tasks && top.length > 0 && (doneAt === undefined || now - doneAt < AGENT_LINGER_MS)
  const showUsage = opts.usage && last !== undefined
  const shells = opts.tasks ? shellRows(await read($, calls), await read($, liveCalls), await read($, jobs), now).slice(-MAX_SHELL_ROWS) : []
  if (!showTasks && !showUsage && shells.length === 0) return null
  const C = palette()
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui

  // Usage: only what the status line does not show — a cold-cache warning, and tokens split by agent.
  const usageRows: RenderElement[] = []
  if (showUsage && last && last.usage) {
    const previous = [...turnList].reverse().find(t => t.agentId === undefined && t.usage && t !== last && t.startedAt < last.startedAt)
    const sources = bySource(turnList, await read($, agents), now - 30 * 60_000)
    if (wasCold(last, previous)) {
      usageRows.push(<Text key="cold" color={C.warn} wrap="truncate-end">{` ⚠ cache was cold · this turn re-sent ${fmtTokens(last.usage.cacheWrite)} at full price`}</Text>)
    }
    if (sources.length > 1) {
      usageRows.push(<Text key="sources" color={C.faint} wrap="truncate-end">{` ${sources.map(s => `${s.source} ${fmtTokens(s.tokens)}`).join(' · ')}`}</Text>)
    }
  }

  const docked = await railDocked($, e)
  const listed = []
  for (const agent of await read($, agents)) if (!docked || !(await onRail($, agent))) listed.push(agent)
  const finished = doneAt !== undefined
  const tails: Record<string, string> = {}
  for (const r of shells) {
    if (r.status !== 'running' || r.outputFile === undefined) continue
    const line = await tailLine($, r.outputFile, now)
    if (line) tails[r.outputFile] = line
  }
  const d: PlanData = {
    tasks: showTasks && !finished ? list : [],
    agents: agentRows(listed, turnList),
    shells,
    tails,
    shellHistory: (await read($, shellHistory)) ?? {},
    planHistory: await projectHistory($),
    now,
    all: await read($, planAll),
  }
  const want = planWanted(d)
  const fit = fitBand({
    maxRows: e.props.maxRows,
    dock: dockKind,
    header: showTasks,
    focus: want.focus,
    shell: want.shell,
    plan: want.plan,
    tails: want.tails,
    usage: usageRows.length,
    expanded: d.all,
  })
  // The newest shells when not all fit; the section's label takes one of its rows.
  const shell = fit.shell > 1 ? <Box key="shell" flexDirection="column">{shellBody(ui, C, { ...d, shells: shells.slice(-(fit.shell - 1)) }, fit.tails)}</Box> : null
  const usage = fit.usage && usageRows.length ? <Box key="usage" flexDirection="column">{usageRows}</Box> : null
  const band = (rows: (RenderElement | null | undefined)[]) => ({
    dock: fit.dock,
    el: (
      <Box flexDirection="column" marginTop={fit.margin ? 1 : 0} paddingLeft={1}>
        {rows}
      </Box>
    ),
  })
  if (!showTasks || !fit.header) return shell || usage ? band([shell, usage]) : { el: null, dock: fit.dock }

  const body = planBody(ui, C, d, fit.focus ? fit.plan + 1 : 0)
  // The header reads the whole list for its count, even once the plan is finished.
  const header = planHeader(ui, C, { ...d, tasks: list }, {
    surface: e.surface,
    columns: e.props.bodyColumns,
    toggle: { hidden: body.hidden, onPress: () => update($, planAll, v => !v) },
  })
  return band([header, ...body.rows, shell, usage])
}

const TAIL_EVERY_MS = 2000
const MAX_TAIL_BYTES = 4 * 1024 * 1024
const tails = new Map<string, { at: number; line?: string }>()

// A background job's newest output line, re-read at most every 2s; a file too big for one read shows nothing.
async function tailLine($: EngineInterface, path: string, now: number): Promise<string | undefined> {
  const seen = tails.get(path)
  if (seen && now - seen.at < TAIL_EVERY_MS) return seen.line
  let line: string | undefined
  try {
    const { size } = await $.fs.stat(path)
    if (size <= MAX_TAIL_BYTES) line = lastLine(String(await $.fs.read(path)))
  } catch {
    line = undefined
  }
  tails.set(path, { at: now, ...(line === undefined ? {} : { line }) })
  return line
}

const SCENE_MAX = 64
// Below these widths the key hints, then the phase times, drop rather than wrap the row.
const KEYS_FROM = 72
const PHASES_FROM = 56
const KEYS = [['⏎', 'send'], ['/', 'commands'], ['@', 'files'], ['?', 'shortcuts']] as const

// The prompt dock: the crab's corner and the prompt label when idle; the step, the scene and the calls while a turn runs.
// A compact size (layout.ts, when the plan needs the rows) keeps the label, or the step and calls, without the picture.
async function dockBand($: EngineInterface, e: Band, size: DockSize): Promise<RenderElement> {
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
    const label = (
      <Box key="dock-label">
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
    )
    if (size === 'idle-compact') {
      return (
        <Box key="dock" marginTop={1} paddingLeft={1}>
          {label}
        </Box>
      )
    }
    return (
      <Box key="dock" marginTop={1} paddingLeft={1}>
        <Raster key="dock-idle" columns={IDLE_COLS} rows={IDLE_ROWS} cells={encodeCells(idleCells(false, C))} />
        <Box flexDirection="column" flexGrow={1}>
          <Text> </Text>
          {label}
          <Text> </Text>
        </Box>
      </Box>
    )
  }
  const compact = size === 'compact' || size === 'tiny'
  const cols = Math.max(20, Math.min(SCENE_MAX, e.props.bodyColumns - 2))
  site.cols = compact ? undefined : cols
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
      {!compact && <Raster key="dock-scene" columns={cols} rows={SCENE_ROWS} cells={encodeCells(sceneCells(view, turn, now, cols, C))} />}
      {size !== 'tiny' && <Box>
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
      </Box>}
    </Box>
  )
}

const STEP = { requesting: 'Working', thinking: 'Thinking', tool: 'Running a tool', responding: 'Writing the reply' } as const
const PHASE_LABEL = { thinking: 'think', tool: 'tools', responding: 'reply' } as const
const MODE_COLOR = (C: ReturnType<typeof palette>) => ({ requesting: C.faint, thinking: C.accent, tool: C.info, responding: C.ink })
