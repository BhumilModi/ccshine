import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderElement } from 'claude-code'

import type { RailRow, TurnSpan } from '../../types'
import { anchorOf, railRows, railSummary, showBars, timelineOn, turnOfCall, turnWindow } from '../rail'
import { gauge, palette, span } from '../theme'
import { fmtShort } from '../tools'

// Written by the tracker (features/track.tsx), the dock (turn starts) and the agent band (features/tasks.tsx).
const calls = atom({ plugin: 'tidepool', key: 'calls' } as const, {})
const spans = atom({ plugin: 'tidepool', key: 'spans' } as const, [])
const jobs = atom({ plugin: 'tidepool', key: 'jobs' } as const, [])
const agents = atom({ plugin: 'tidepool', key: 'agents' } as const, [])
// The timeline's own: which turns the person folded or unfolded, which rows are open, the live clock.
const fold = atom({ plugin: 'tidepool', key: 'railFold' } as const, {})
const open = atom({ plugin: 'tidepool', key: 'railOpen' } as const, [])
const now = atom({ plugin: 'tidepool', key: 'railNow' } as const, 0)

const TOOL = 6
const META = 13
// The timeline sits under its anchor, indented past the ◇.
const INDENT = 3
// Columns the transcript keeps for itself either side of a row.
const GUTTER = 4
// A live turn shows its newest rows only; unfolded by the person, a turn shows them all.
const LIVE_ROWS = 8

const fit = (text: string, width: number) => (text.length <= width ? text.padEnd(width) : `${text.slice(0, width - 1)}…`)

// Column widths for a body `width` cells wide: tool, target, bar, then what is left for timings.
// The target takes what the bar does not need, the bar stops at 20 cells, timings take the rest.
function columns(width: number, bars: boolean): { target: number; bar: number } {
  if (!bars) return { target: Math.max(8, width - TOOL - META - 2), bar: 0 }
  const room = width - TOOL - META - 3
  const target = Math.min(24, Math.max(10, room - 12))
  return { target, bar: Math.max(6, Math.min(20, room - target)) }
}

function timing(r: RailRow): string {
  if (r.kind === 'job' && r.running) return `running · ${fmtShort(r.ms)}`
  return r.running ? `${fmtShort(r.ms)} …` : fmtShort(r.ms)
}

// The main-loop turn a call belongs to; undefined for a subagent's call or one the tracker never saw.
async function turnOf($: EngineInterface, id: string): Promise<TurnSpan | undefined> {
  const call = (await read($, calls))[id]
  if (!call || call.agentId !== undefined) return undefined
  return turnOfCall(await read($, spans), call.startedAt)
}

export function registerRail(on: On) {
  // The turn's first tool row carries its anchor line and, unfolded, the turn's timeline under it; the turn's
  // other rows draw nothing. Fixed-width pieces sit in boxes that never shrink, so a narrow chat truncates the
  // one flexible piece on each line instead of wrapping its neighbours.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!timelineOn(e.viewport)) return next(e)
    const p = e.props
    const turn = await turnOf($, p.tool_use_id)
    if (!turn) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    // The turn's first row to draw carries the anchor; the rest of its rows draw nothing.
    if (!anchorOf.has(turn.turnId)) anchorOf.set(turn.turnId, p.tool_use_id)
    if (anchorOf.get(turn.turnId) !== p.tool_use_id) return <Box />

    const C = palette()
    const clock = Math.max(await read($, now), await $.clock.now())
    const allCalls = await read($, calls)
    const all = railRows(allCalls, await read($, agents), await read($, jobs), turn, clock)
    const live = turn.endedAt === undefined
    const folded = await read($, fold)
    const isOpen = folded[turn.turnId] ?? live
    const toggleTurn = () => update($, fold, f => ({ ...f, [turn.turnId]: !isOpen }))

    const tools = all.reduce((n, r) => n + 1 + (r.children ?? 0), 0)
    const agentCount = all.filter(r => r.kind === 'agent').length
    const background = all.filter(r => r.kind === 'job').length
    const errors = all.filter(r => r.failed).length
    const { start, end } = turnWindow(turn, clock)
    const parts = [
      `${tools} tool${tools === 1 ? '' : 's'}`,
      agentCount ? `${agentCount} agent${agentCount === 1 ? '' : 's'}` : '',
      background ? `${background} background` : '',
      `${fmtShort(end - start)}${live ? ' …' : ''}`,
      turn.aborted ? 'stopped' : '',
    ].filter(Boolean)
    const anchor = (
      <Box key="anchor" flexDirection="row" height={1} hover={{ backgroundColor: C.seg }}>
        <Text color={C.faint} wrap="truncate-end">{` ◇ ${parts.join(' · ')}`}</Text>
        {errors > 0 && (
          <Box flexShrink={0}>
            <Text color={C.crit}>{` · ${errors} error${errors === 1 ? '' : 's'}`}</Text>
          </Box>
        )}
        <Box flexShrink={0}>
          <Button key="anchor" plain dimColor={!isOpen} onPress={toggleTurn}>
            {isOpen ? '  ▾ timeline' : '  ▸ timeline'}
          </Button>
        </Box>
      </Box>
    )
    if (!isOpen) return <Box marginTop={1}>{anchor}</Box>

    const width = Math.max(20, (e.viewport?.columns ?? 80) - INDENT - GUTTER)
    const bars = showBars(width)
    const col = columns(width, bars)
    const hidden = live && folded[turn.turnId] === undefined ? Math.max(0, all.length - LIVE_ROWS) : 0
    const rows = all.slice(hidden)
    const opened = await read($, open)
    const toggleRow = (id: string) => update($, open, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]))
    const fixed = (key: string, child: RenderElement) => <Box key={key} flexShrink={0}>{child}</Box>
    const line = (key: string, children: (RenderElement | false | null | undefined)[]) => (
      <Box key={key} flexDirection="row" height={1}>{children}</Box>
    )
    const label = (text: string, color = C.faint) => fixed('label', <Text color={color}>{text.padEnd(TOOL + 1)}</Text>)

    const body: RenderElement[] = []
    if (rows.length === 0) body.push(<Text key="empty" color={C.faint}>no tools this turn</Text>)
    if (hidden) body.push(<Text key="earlier" color={C.faint}>{`${' '.repeat(TOOL + 1)}${hidden} earlier`}</Text>)
    for (const r of rows) {
      const color = r.failed ? C.crit : r.kind === 'job' ? C.warn : r.kind === 'agent' ? C.info : r.running ? C.mid : C.soft
      const b = bars ? span(r.from, r.to, col.bar) : { before: '', filled: '', after: '' }
      const isRowOpen = opened.includes(r.id)
      const edits = r.added || r.removed
      body.push(
        <Box key={`r-${r.id}`} flexDirection="row" height={1} hover={{ backgroundColor: C.seg }}>
          {fixed('tool', <Text color={r.failed ? C.crit : C.mid}>{fit(r.failed ? `✕ ${r.tool}` : r.tool, TOOL)} </Text>)}
          {fixed('target', (
            <Button key={`row:${r.id}`} plain onPress={() => toggleRow(r.id)}>
              {fit(r.target || r.tool, col.target)}
            </Button>
          ))}
          {bars && fixed('bar', (
            <Text color={C.track}>
              {` ${b.before}`}
              <Text color={color}>{b.filled}</Text>
              {b.after}
              {r.over ? <Text color={color}>⇢</Text> : ''}
            </Text>
          ))}
          <Text color={r.running ? C.mid : C.faint} wrap="truncate-end">
            {` ${timing(r)}`}
            {edits ? <Text color={C.info}>{`  +${r.added ?? 0}`}</Text> : ''}
            {edits ? <Text color={C.crit}>{` −${r.removed ?? 0}`}</Text> : ''}
            {r.children !== undefined ? <Text color={C.info}>{`  ${r.children} tools ${isRowOpen ? '▾' : '▸'}`}</Text> : ''}
          </Text>
        </Box>,
      )
      if (!isRowOpen) continue
      if (r.kind === 'agent') {
        const agentId = (await read($, agents)).find(a => a.callId === r.id)?.id
        const kids = Object.values(allCalls)
          .filter(c => c.agentId !== undefined && c.agentId === agentId)
          .sort((x, y) => x.startedAt - y.startedAt)
        for (const [i, c] of kids.entries()) {
          body.push(<Text key={`k-${r.id}-${i}`} color={C.mid} wrap="truncate-end">{`${' '.repeat(TOOL - 2)}└ ${fit(c.tool, TOOL)} ${c.target ?? ''}`}</Text>)
        }
      }
      for (const [i, detail] of (allCalls[r.id]?.detail ?? []).entries()) {
        body.push(<Text key={`d-${r.id}-${i}`} color={C.faint} wrap="truncate-end">{`${' '.repeat(TOOL + 1)}${detail}`}</Text>)
      }
    }

    const foot: RenderElement[] = []
    if (bars && rows.length > 0) {
      const axis = fmtShort(end - start)
      foot.push(<Text key="axis" color={C.faint}>{`${' '.repeat(TOOL + col.target + 2)}0s${axis.padStart(col.bar - 2)}`}</Text>)
    }
    if (!live) {
      const sum = railSummary(all, turn, clock)
      if (sum.ctx) {
        const g = gauge(sum.ctx[0] / 100, sum.ctx[1] / 100, 12)
        foot.push(line('ctx', [
          label('ctx'),
          bars && fixed('gauge', <Text color={C.soft}>{g.base}<Text color={C.accent}>{g.added}</Text><Text color={C.track}>{`${g.track} `}</Text></Text>),
          <Text key="pct" color={C.mid} wrap="truncate-end">{`${sum.ctx[0]}% → ${sum.ctx[1]}%`}</Text>,
        ]))
      }
      const counts = [`${sum.tools} tool${sum.tools === 1 ? '' : 's'}`, sum.agents ? `${sum.agents} agent${sum.agents === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
      foot.push(line('cost', [
        label('cost'),
        sum.cost !== undefined && fixed('usd', <Text color={C.ink}>{`$${sum.cost.toFixed(2)}  `}</Text>),
        <Text key="counts" color={C.faint} wrap="truncate-end">{counts}</Text>,
      ]))
      for (const [i, f] of sum.files.entries()) {
        foot.push(line(`file-${i}`, [
          label(i === 0 ? 'files' : ''),
          <Text key="path" color={C.ink} wrap="truncate-end">
            {f.path.split('/').pop()}
            <Text color={C.info}>{`  +${f.added}`}</Text>
            <Text color={C.crit}>{` −${f.removed}`}</Text>
          </Text>,
        ]))
      }
      for (const [i, f] of sum.failures.entries()) {
        foot.push(line(`fail-${i}`, [
          label(i === 0 ? 'fail' : '', C.crit),
          <Text key="what" color={C.crit} wrap="truncate-end">{`${f.label}${f.times > 1 ? ` ×${f.times}` : ''}`}</Text>,
        ]))
      }
    }

    return (
      <Box flexDirection="column" marginTop={1}>
        {anchor}
        <Box key="timeline" flexDirection="column" paddingLeft={INDENT}>
          {body}
          {foot.length > 0 && <Box key="foot" flexDirection="column" marginTop={1}>{foot}</Box>}
        </Box>
      </Box>
    )
  })
}
