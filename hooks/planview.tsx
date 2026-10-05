import type { EngineInterface, RenderElement } from 'claude-code'

import type { PlanTask } from '../types'
import { estimate, fmt, fmtClock, fmtTokens, planStats, timeLeft, topLevel, visibleAgents, windowLines } from './plan'
import type { AgentRow } from './plan'
import { commandKey, shellEta } from './shell'
import type { ShellRow } from './shell'
import { bar, glyphsOn, palette, powerline, runsWidth } from './theme'
import type { Segment } from './theme'

// The plan's drawing, shared by the band (features/tasks.tsx) and the rail (features/rail.tsx).
// Pure: each caller reads state and output files itself, since `$` never crosses an import.

export type Palette = ReturnType<typeof palette>
type Resolved = ReturnType<EngineInterface['ui']['resolve']>
export type PlanUi = Pick<Resolved, 'Box' | 'Text' | 'Button'>

export type PlanData = {
  tasks: PlanTask[]
  agents: AgentRow[]
  shells: ShellRow[]
  // A background job's output file -> its newest line.
  tails: Record<string, string>
  shellHistory: Record<string, number[]>
  planHistory: number[]
  now: number
  all: boolean
}

export const MAX_TASK_ROWS = 8
const MAX_AGENT_ROWS = 4

export type Line =
  | { kind: 'task'; task: PlanTask; n: number }
  | { kind: 'sub'; task: PlanTask }
  | { kind: 'agent'; agent: AgentRow; indent: string }
  | { kind: 'note'; text: string }

// The plan as one row per line: each task, the running task's sub-items and agents (every task's sub-items
// when showing all), then agents that belong to no task. `focus` is the running task's line, else the first unfinished one.
export function planLines(list: PlanTask[], agentList: AgentRow[], now: number, all: boolean): { lines: Line[]; focus: number } {
  const lines: Line[] = []
  let focus = -1
  let next = -1
  const agentsOf = (taskId: string | undefined, indent: string): Line[] => {
    const live = visibleAgents(agentList, taskId, now)
    const out: Line[] = live.length > MAX_AGENT_ROWS ? [{ kind: 'note', text: `${indent}+${live.length - MAX_AGENT_ROWS} earlier agents` }] : []
    return [...out, ...live.slice(-MAX_AGENT_ROWS).map(agent => ({ kind: 'agent' as const, agent, indent }))]
  }
  topLevel(list).forEach((t, i) => {
    if (focus < 0 && t.status === 'in_progress') focus = lines.length
    if (next < 0 && t.status !== 'completed') next = lines.length
    lines.push({ kind: 'task', task: t, n: i + 1 })
    const open = t.status === 'in_progress'
    if (open || all) {
      for (const sub of list.filter(c => c.parent === t.id)) {
        lines.push({ kind: 'sub', task: sub })
        if (sub.status === 'in_progress') lines.push(...agentsOf(sub.id, '        '))
      }
    }
    if (open) lines.push(...agentsOf(t.id, '    '))
  })
  const loose = agentsOf(undefined, '    ')
  if (loose.length > 0) lines.push({ kind: 'note', text: '  agents' }, ...loose)
  return { lines, focus: Math.max(0, focus >= 0 ? focus : next) }
}

// What the plan asks of a row budget: rows past the header's task line, the shell section, and a row for each
// running background shell's output line. Callers read output files only once the fit says those rows are drawn.
export function planWanted(d: PlanData): { plan: number; shell: number; tails: number; focus: boolean } {
  const { lines } = planLines(d.tasks, d.agents, d.now, d.all)
  const others = Math.max(0, lines.length - 1)
  return {
    plan: d.all ? others : Math.min(others, MAX_TASK_ROWS),
    shell: d.shells.length ? 1 + d.shells.length : 0,
    tails: d.shells.filter(r => r.status === 'running' && r.outputFile !== undefined).length,
    focus: lines.length > 0,
  }
}

// The powerline header; with `toggle`, a show-all Button (key "all") whenever rows are hidden or all are shown.
export function planHeader(
  ui: PlanUi,
  C: Palette,
  d: PlanData,
  o: { surface: string; columns: number; toggle?: { hidden: number; onPress: () => void } },
): RenderElement {
  const { Box, Text, Button } = ui
  const top = topLevel(d.tasks)
  const { done, total } = estimate(top, d.now, d.planHistory)
  const finished = total > 0 && done === total
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
    { bg: C.segAlt, parts: [{ text: ` ${timeLeft(top, d.now, d.planHistory)} `, color: finished ? C.mid : C.ink }] },
  ]
  const toggle = !o.toggle ? '' : d.all ? '▴ fewer' : o.toggle.hidden > 0 ? '▾ show all' : ''
  // Narrow: drop the time-left segment rather than wrap the header.
  let runs = powerline(header, glyphsOn(o.surface))
  if (runsWidth(runs) + toggle.length + 2 > o.columns - 2) runs = powerline(header.slice(0, 2), glyphsOn(o.surface))
  return (
    <Box key="header">
      {runs.map((run, i) => (
        <Text key={`h${i}`} color={run.color} backgroundColor={run.backgroundColor} bold={run.bold}>
          {run.text}
        </Text>
      ))}
      {toggle && o.toggle && (
        <Button key="all" plain dimColor onPress={o.toggle.onPress}>
          {`  ${toggle}`}
        </Button>
      )}
    </Box>
  )
}

function drawLine(ui: PlanUi, C: Palette, now: number, line: Line, key: string): RenderElement {
  const { Box, Text } = ui
  if (line.kind === 'note') return <Text key={key} color={C.faint}>{line.text}</Text>
  if (line.kind === 'agent') {
    const a = line.agent
    const time = fmtClock((a.endedAt ?? now) - a.startedAt)
    const meta = a.tokens ? `${time} · ${fmtTokens(a.tokens)} tokens` : time
    const mark = a.status === 'running' ? '◆' : a.status === 'done' ? '✓' : '✕'
    const isLive = a.status === 'running'
    return (
      <Box key={key}>
        <Box flexShrink={0}>
          <Text color={isLive ? C.accent : C.track}>{`${line.indent}${mark} `}</Text>
          <Text color={isLive ? C.soft : C.faint}>{a.type}</Text>
        </Box>
        <Text color={C.faint} wrap="truncate-end">{`  ${a.description}`}</Text>
        <Box flexShrink={0}><Text color={isLive ? C.mid : C.track}>{`  ${meta}`}</Text></Box>
      </Box>
    )
  }
  const t = line.task
  const indent = line.kind === 'sub' ? '    ' : ''
  const label = line.kind === 'task' ? `${line.n}. ${t.subject}` : t.subject
  if (t.status === 'completed') {
    const took = t.startedAt !== undefined && t.doneAt !== undefined ? fmt(t.doneAt - t.startedAt) : ''
    return (
      <Box key={key}>
        <Box flexShrink={0}><Text color={C.mid}>{`${indent}✓ `}</Text></Box>
        <Text color={C.faint} wrap="truncate-end">{label}</Text>
        {took && <Box flexShrink={0}><Text color={C.track}>{`  ${took}`}</Text></Box>}
      </Box>
    )
  }
  if (t.status === 'in_progress') {
    const running = t.startedAt !== undefined ? fmtClock(now - t.startedAt) : ''
    const isSub = line.kind === 'sub'
    return (
      <Box key={key}>
        <Box flexShrink={0}><Text color={C.accent} bold={!isSub}>{`${indent}${isSub ? '▸' : '▶'} `}</Text></Box>
        <Text color={isSub ? C.soft : C.ink} bold={!isSub} wrap="truncate-end">{label}</Text>
        {running && <Box flexShrink={0}><Text color={C.mid}>{`  ${running}`}</Text></Box>}
      </Box>
    )
  }
  return (
    <Box key={key}>
      <Box flexShrink={0}><Text color={C.track}>{`${indent}· `}</Text></Box>
      <Text color={C.soft} wrap="truncate-end">{label}</Text>
    </Box>
  )
}

// Plan lines in `room` rows around the running task, markers included. `hidden` counts what the toggle would add.
export function planBody(ui: PlanUi, C: Palette, d: PlanData, room: number): { rows: RenderElement[]; hidden: number } {
  const { Text } = ui
  const { lines, focus } = planLines(d.tasks, d.agents, d.now, d.all)
  const { start, shown, before, after } = room > 0 ? windowLines(lines, focus, room) : { start: 0, shown: [], before: 0, after: 0 }
  const hidden = d.all ? 0 : planLines(d.tasks, d.agents, d.now, true).lines.length - shown.length
  const rows: RenderElement[] = []
  if (before > 0) rows.push(<Text key="before" color={C.faint}>{`  ${before} earlier`}</Text>)
  shown.forEach((line, i) => rows.push(drawLine(ui, C, d.now, line, `line-${start + i}`)))
  if (after > 0) rows.push(<Text key="after" color={C.faint}>{`  +${after} more`}</Text>)
  return { rows, hidden }
}

// The shell section: a label, one row per shell with elapsed time and the ETA from past runs of the same
// command, and a running background job's newest output line under its row when `tails`.
export function shellBody(ui: PlanUi, C: Palette, d: PlanData, tails: boolean): RenderElement[] {
  const { Box, Text } = ui
  const out: RenderElement[] = [<Text key="shell-label" color={C.faint}>  shell</Text>]
  for (const r of d.shells) {
    const isLive = r.status === 'running'
    let meta = fmtClock((r.endedAt ?? d.now) - r.startedAt)
    const eta = isLive && r.command !== undefined ? shellEta(d.shellHistory, commandKey(r.command), d.now - r.startedAt) : undefined
    if (eta) meta += 'left' in eta ? ` · ~${fmt(eta.left)} left` : ` · over by ${fmt(eta.over)}`
    if (r.status === 'killed') meta += ' · stopped'
    const mark = isLive ? '▶' : r.status === 'done' ? '✓' : '✕'
    out.push(
      <Box key={`shell-${r.id}`}>
        <Box flexShrink={0}>
          <Text color={isLive ? C.accent : r.status === 'error' ? C.crit : C.track}>{`    ${mark} `}</Text>
          {r.background && <Text color={C.warn}>{'bg '}</Text>}
        </Box>
        <Text color={isLive ? C.ink : C.faint} wrap="truncate-end">{r.label}</Text>
        <Box flexShrink={0}><Text color={isLive ? C.mid : C.track}>{`  ${meta}`}</Text></Box>
      </Box>,
    )
    const said = tails && isLive && r.outputFile !== undefined ? d.tails[r.outputFile] : undefined
    if (said) out.push(<Text key={`shell-out-${r.id}`} color={C.faint} wrap="truncate-end">{`        ${said}`}</Text>)
  }
  return out
}

// A finished plan's card: the crab (a Raster the caller draws and animates), "✓ Plan complete", then the count
// of tasks and sub-items with the total time, and the fastest and longest task.
export function doneCard(ui: PlanUi, C: Palette, tasks: PlanTask[], crab: RenderElement): RenderElement {
  const { Box, Text } = ui
  const s = planStats(tasks)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const count = [plural(s.tasks, 'task'), s.subs ? plural(s.subs, 'sub-item') : '', fmt(s.ms)].filter(Boolean).join(' · ')
  const pace = s.tasks > 1 && s.fastest !== undefined && s.longest !== undefined ? `fastest ${fmt(s.fastest)} · longest ${fmt(s.longest)}` : ''
  return (
    <Box key="done" flexDirection="row">
      {crab}
      <Box flexDirection="column" paddingLeft={2}>
        <Box>
          <Text color={C.accent} bold>✓ Plan complete</Text>
          <Text color={C.mid} wrap="truncate-end">{`  ${'▚▞'.repeat(6)}`}</Text>
        </Box>
        <Text color={C.ink} wrap="truncate-end">{`★ ${count}`}</Text>
        {pace ? <Text color={C.faint} wrap="truncate-end">{pace}</Text> : null}
      </Box>
    </Box>
  )
}
