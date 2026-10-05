import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'

import type { RailRow } from '../../types'
import { opts } from '../options'
import { pickTurn, railRows, railSummary, showBars, turnWindow } from '../rail'
import { bar, palette, span } from '../theme'
import { fmtShort } from '../tools'

export const RAIL_ID = 'tidepool-rail'

// Written by the tracker (features/track.tsx), the dock (turn starts) and the agent band (features/tasks.tsx).
const calls = atom({ plugin: 'tidepool', key: 'calls' } as const, {})
const spans = atom({ plugin: 'tidepool', key: 'spans' } as const, [])
const jobs = atom({ plugin: 'tidepool', key: 'jobs' } as const, [])
const agents = atom({ plugin: 'tidepool', key: 'agents' } as const, [])
// The rail's own: which turn, which rows are open, the live clock.
const sel = atom({ plugin: 'tidepool', key: 'railSel' } as const, { pinned: false })
const open = atom({ plugin: 'tidepool', key: 'railOpen' } as const, [])
const now = atom({ plugin: 'tidepool', key: 'railNow' } as const, 0)
// Anchor rows on screen, by turn (features/tools.tsx writes it).
const seen = atom({ plugin: 'tidepool', key: 'anchorsSeen' } as const, {})

const NAME = 22
const META = 14
const INLINE_ROWS = 6

const fit = (text: string, width: number) => (text.length <= width ? text.padEnd(width) : `${text.slice(0, width - 1)}…`)

function meta(r: RailRow): string {
  const parts: string[] = []
  if (r.kind === 'job' && r.running) parts.push(`running · ${fmtShort(r.ms)}`)
  else parts.push(r.running ? `${fmtShort(r.ms)} …` : fmtShort(r.ms))
  if (r.added || r.removed) parts.push(`+${r.added ?? 0} −${r.removed ?? 0}`)
  return parts.join('  ')
}

export function registerRail(on: On) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== RAIL_ID) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const C = palette()
    const p = e.props

    const list = await read($, spans)
    // Reading railNow redraws the rail on each live tick; the clock itself is the truth.
    const clock = Math.max(await read($, now), await $.clock.now())
    const isInline = p.placement === 'inline'
    const live = list.findLast(s => s.endedAt === undefined)
    // Above the prompt (no fullscreen) the rail follows the live turn, and between turns shrinks to one line.
    if (isInline && !live && list.length > 0) {
      const last = list.at(-1)!
      const sum = railSummary(railRows(await read($, calls), await read($, agents), await read($, jobs), last, clock), last, clock)
      const line = [`turn ${list.length}`, fmtShort(sum.ms), `${sum.tools} tools`, sum.failures.length ? `${sum.failures.length} failed` : ''].filter(Boolean).join(' · ')
      return (
        <Box flexDirection="row" height={1}>
          <Text color={C.accent}>≈ tidepool</Text>
          <Text color={sum.failures.length ? C.crit : C.faint} wrap="truncate-end">{`  ${line}`}</Text>
        </Box>
      )
    }
    const turn = isInline ? live : pickTurn(list, await read($, sel), await read($, seen))
    if (!turn) {
      return (
        <Box flexDirection="column">
          <Text color={C.accent}>≈ tidepool</Text>
          <Text color={C.faint}>{isInline ? 'no turn running' : 'no turns yet'}</Text>
        </Box>
      )
    }

    const at = turn.endedAt === undefined ? clock : turn.endedAt
    const { start, end } = turnWindow(turn, at)
    const allCalls = await read($, calls)
    const all = railRows(allCalls, await read($, agents), await read($, jobs), turn, clock)
    const hidden = isInline ? Math.max(0, all.length - INLINE_ROWS) : 0
    const rows = all.slice(hidden)
    const opened = await read($, open)
    const bars = showBars(p.bodyColumns)
    const width = Math.max(6, Math.min(16, p.bodyColumns - NAME - META - 2))
    const nameWidth = bars ? NAME : Math.max(10, p.bodyColumns - META - 2)
    const state = turn.endedAt === undefined ? 'live' : turn.aborted ? 'stopped' : ''
    const header = [`turn ${list.indexOf(turn) + 1}`, state, fmtShort(end - start)].filter(Boolean).join(' · ')
    const toggle = (id: string) => update($, open, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]))

    const body = []
    if (rows.length === 0) body.push(<Text key="empty" color={C.faint}>no tools this turn</Text>)
    if (hidden) body.push(<Text key="earlier" color={C.faint}>{`${hidden} earlier`}</Text>)
    for (const r of rows) {
      const color = r.failed ? C.crit : r.kind === 'job' ? C.warn : r.kind === 'agent' ? C.info : r.running ? C.mid : C.soft
      const b = span(r.from, r.to, width)
      const label = `${r.failed ? '✕ ' : ''}${r.tool.padEnd(6)}${r.target}`
      const more = r.children !== undefined ? `  ${r.children} tools ${opened.includes(r.id) ? '▾' : '▸'}` : ''
      body.push(
        <Box key={`r-${r.id}`} flexDirection="row" height={1}>
          <Button key={`row:${r.id}`} plain onPress={() => toggle(r.id)}>
            {fit(label, nameWidth)}
          </Button>
          {bars && <Text color={C.track}>{` ${b.before}`}</Text>}
          {bars && <Text color={color}>{b.filled}</Text>}
          {bars && <Text color={C.track}>{b.after}</Text>}
          {bars && r.over && <Text color={color}>⇢</Text>}
          <Text color={r.failed ? C.crit : C.faint} wrap="truncate-end">{` ${meta(r)}${more}`}</Text>
        </Box>,
      )
      if (!opened.includes(r.id)) continue
      if (r.kind === 'agent') {
        const agentId = (await read($, agents)).find(a => a.callId === r.id)?.id
        const kids = Object.values(allCalls)
          .filter(c => c.agentId !== undefined && c.agentId === agentId)
          .sort((x, y) => x.startedAt - y.startedAt)
        for (const [i, c] of kids.entries()) {
          body.push(<Text key={`k-${r.id}-${i}`} color={C.mid} wrap="truncate-end">{`  └ ${c.tool} ${c.target ?? ''}`}</Text>)
        }
      }
      for (const [i, line] of (allCalls[r.id]?.detail ?? []).entries()) {
        body.push(<Text key={`d-${r.id}-${i}`} color={C.faint} wrap="truncate-end">{`    ${line}`}</Text>)
      }
    }

    const foot = []
    if (bars && rows.length > 0) {
      const label = fmtShort(end - start)
      foot.push(<Text key="axis" color={C.faint}>{`${' '.repeat(nameWidth + 1)}0s${label.padStart(width - 2)}`}</Text>)
    }
    if (!isInline) {
      const sum = railSummary(all, turn, clock)
      if (sum.ctx) {
        const g = bar(sum.ctx[1] / 100, 12)
        foot.push(
          <Box key="ctx" flexDirection="row" height={1}>
            <Text color={C.faint}>{'ctx  '}</Text>
            {bars && <Text color={C.accent}>{g.filled}</Text>}
            {bars && <Text color={C.track}>{g.track}</Text>}
            <Text color={C.mid}>{` ${sum.ctx[0]}% → ${sum.ctx[1]}%`}</Text>
            {sum.cost !== undefined && <Text color={C.ink}>{`  $${sum.cost.toFixed(2)}`}</Text>}
          </Box>,
        )
      }
      if (sum.files.length) {
        const files = sum.files.map(f => `${f.path.split('/').pop()} +${f.added} −${f.removed}`).join(' · ')
        foot.push(<Text key="files" color={C.soft} wrap="truncate-end">{`files ${files}`}</Text>)
      }
      for (const f of sum.failures) {
        foot.push(<Text key={`f-${f.label}`} color={C.crit} wrap="truncate-end">{`✕ ${f.label}${f.times > 1 ? ` ×${f.times}` : ''}`}</Text>)
      }
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" height={1}>
          <Text color={C.accent}>≈ tidepool</Text>
          <Text color={C.ink}>{`  ${header}`}</Text>
          {(await read($, sel)).pinned && !isInline && <Text color={C.faint}>{'  · pinned'}</Text>}
        </Box>
        {body}
        {foot}
      </Box>
    )
  })

  on('command.run', { command: RAIL_ID }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === RAIL_ID)
    if (isOpen) await $.ui.close({ id: RAIL_ID })
    else if (opts.rail) await $.ui.open({ id: RAIL_ID, title: 'tidepool' })
    return { text: isOpen ? 'Tide rail closed.' : 'Tide rail open.' }
  })
}
