import { atom, read, update } from 'claude-code'
import type { On, RenderChildren } from 'claude-code'

import type { RailRow } from '../../types'
import { opts } from '../options'
import { pickTurn, railRows, railSeat, railSummary, showBars, turnWindow } from '../rail'
import { gauge, palette, span } from '../theme'
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

const TOOL = 6
const META = 13
const INLINE_ROWS = 6

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

export function registerRail(on: On) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== RAIL_ID) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const C = palette()
    const p = e.props
    railSeat.placement = p.placement
    // Painted in the theme's own background (each palette's onAccent), so the rail reads as part of the
    // terminal rather than a grey panel laid over it. One column of air on each side.
    const width = Math.max(10, p.bodyColumns - 2)
    const surface = (key: string, children: RenderChildren) => (
      <Box key={key} flexDirection="column" backgroundColor={C.onAccent} paddingX={1} minHeight={p.placement === 'dock' ? p.scroll.bodyRows : undefined}>
        {children}
      </Box>
    )

    const list = await read($, spans)
    // Reading railNow redraws the rail on each live tick; the clock itself is the truth.
    const clock = Math.max(await read($, now), await $.clock.now())
    const isInline = p.placement === 'inline'
    const live = list.findLast(s => s.endedAt === undefined)
    // Above the prompt (no fullscreen) the rail follows the live turn, and between turns shrinks to one line.
    if (isInline && !live && list.length > 0) {
      const last = list.at(-1)!
      const sum = railSummary(railRows(await read($, calls), await read($, agents), await read($, jobs), last, clock), last, clock)
      const failed = sum.failures.reduce((n, f) => n + f.times, 0)
      const line = [`turn ${list.length}`, fmtShort(sum.ms), `${sum.tools} tools`].join(' · ')
      return surface(
        'idle',
        <Box flexDirection="row" height={1}>
          <Text color={C.accent} bold>≈ tidepool</Text>
          <Text color={C.faint} wrap="truncate-end">{`  ${line}`}</Text>
          {failed > 0 && <Text color={C.crit}>{` · ${failed} failed`}</Text>}
        </Box>,
      )
    }
    const pinned = (await read($, sel)).pinned
    const turn = isInline ? live : pickTurn(list, await read($, sel), await read($, seen))
    const follow = isInline ? '' : pinned ? 'pinned · scroll to follow' : 'following scroll'
    const brand = (
      <Box key="brand" flexDirection="row" height={1} justifyContent="space-between">
        <Text color={C.accent} bold>≈ tidepool</Text>
        <Text color={C.faint}>{follow}</Text>
      </Box>
    )
    if (!turn) return surface('empty', [brand, <Text key="none" color={C.faint}>{isInline ? 'no turn running' : 'no turns yet'}</Text>])

    const { start, end } = turnWindow(turn, turn.endedAt ?? clock)
    const allCalls = await read($, calls)
    const all = railRows(allCalls, await read($, agents), await read($, jobs), turn, clock)
    const hidden = isInline ? Math.max(0, all.length - INLINE_ROWS) : 0
    const rows = all.slice(hidden)
    const opened = await read($, open)
    const bars = showBars(p.bodyColumns)
    const col = columns(width, bars)
    const state = turn.endedAt === undefined ? 'live' : turn.aborted ? 'stopped' : ''
    const toggle = (id: string) => update($, open, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]))

    // The turn line shares a hover group with its anchor in the chat: pointing at either lights both.
    const title = (
      <Box key="title" flexDirection="row" height={1} hover={{ scope: `tidepool-turn-${turn.turnId}`, backgroundColor: C.seg }}>
        <Text color={C.ink} bold>{`turn ${list.indexOf(turn) + 1}`}</Text>
        {state && <Text color={state === 'live' ? C.accent : C.warn}>{` · ${state}`}</Text>}
        <Text color={C.ink}>{` · ${fmtShort(end - start)}`}</Text>
        {turn.prompt && <Text color={C.faint} wrap="truncate-end">{`  ${turn.prompt}`}</Text>}
      </Box>
    )

    const body = []
    if (rows.length === 0) body.push(<Text key="empty" color={C.faint}>no tools this turn</Text>)
    if (hidden) body.push(<Text key="earlier" color={C.faint}>{`${' '.repeat(TOOL + 1)}${hidden} earlier`}</Text>)
    for (const r of rows) {
      const color = r.failed ? C.crit : r.kind === 'job' ? C.warn : r.kind === 'agent' ? C.info : r.running ? C.mid : C.soft
      const b = bars ? span(r.from, r.to, col.bar) : { before: '', filled: '', after: '' }
      const isOpen = opened.includes(r.id)
      body.push(
        <Box key={`r-${r.id}`} flexDirection="row" height={1} hover={{ backgroundColor: C.seg }}>
          <Text color={r.failed ? C.crit : C.mid}>{fit(r.failed ? `✕ ${r.tool}` : r.tool, TOOL)}</Text>
          <Text> </Text>
          <Button key={`row:${r.id}`} plain onPress={() => toggle(r.id)}>
            {fit(r.target || r.tool, col.target)}
          </Button>
          {bars && <Text color={C.track}>{` ${b.before}`}</Text>}
          {bars && <Text color={color}>{b.filled}</Text>}
          {bars && <Text color={C.track}>{b.after}</Text>}
          {bars && r.over && <Text color={color}>⇢</Text>}
          <Text color={r.running ? C.mid : C.faint} wrap="truncate-end">{` ${timing(r)}`}</Text>
          {(r.added || r.removed) ? <Text color={C.info}>{`  +${r.added ?? 0}`}</Text> : null}
          {(r.added || r.removed) ? <Text color={C.crit}>{` −${r.removed ?? 0}`}</Text> : null}
          {r.children !== undefined && <Text color={C.info}>{`  ${r.children} tools ${isOpen ? '▾' : '▸'}`}</Text>}
        </Box>,
      )
      if (!isOpen) continue
      if (r.kind === 'agent') {
        const agentId = (await read($, agents)).find(a => a.callId === r.id)?.id
        const kids = Object.values(allCalls)
          .filter(c => c.agentId !== undefined && c.agentId === agentId)
          .sort((x, y) => x.startedAt - y.startedAt)
        for (const [i, c] of kids.entries()) {
          body.push(<Text key={`k-${r.id}-${i}`} color={C.mid} wrap="truncate-end">{`${' '.repeat(TOOL - 2)}└ ${fit(c.tool, TOOL)} ${c.target ?? ''}`}</Text>)
        }
      }
      for (const [i, line] of (allCalls[r.id]?.detail ?? []).entries()) {
        body.push(<Text key={`d-${r.id}-${i}`} color={C.faint} wrap="truncate-end">{`${' '.repeat(TOOL + 1)}${line}`}</Text>)
      }
    }

    const foot = []
    if (bars && rows.length > 0) {
      const label = fmtShort(end - start)
      foot.push(<Text key="axis" color={C.faint}>{`${' '.repeat(TOOL + col.target + 2)}0s${label.padStart(col.bar - 2)}`}</Text>)
    }
    if (!isInline) {
      const sum = railSummary(all, turn, clock)
      const label = (text: string) => <Text color={C.faint}>{text.padEnd(TOOL)}</Text>
      foot.push(<Text key="rule" color={C.track}>{'╌'.repeat(width)}</Text>)
      if (sum.ctx) {
        const g = gauge(sum.ctx[0] / 100, sum.ctx[1] / 100, 12)
        foot.push(
          <Box key="ctx" flexDirection="row" height={1}>
            {label('ctx')}
            {bars && <Text color={C.soft}>{g.base}</Text>}
            {bars && <Text color={C.accent}>{g.added}</Text>}
            {bars && <Text color={C.track}>{`${g.track} `}</Text>}
            <Text color={C.mid}>{`${sum.ctx[0]}% → ${sum.ctx[1]}%`}</Text>
          </Box>,
        )
      }
      foot.push(
        <Box key="cost" flexDirection="row" height={1}>
          {label('cost')}
          {sum.cost !== undefined && <Text color={C.ink}>{`$${sum.cost.toFixed(2)}  `}</Text>}
          <Text color={C.faint}>{[`${sum.tools} tool${sum.tools === 1 ? '' : 's'}`, sum.agents ? `${sum.agents} agent${sum.agents === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</Text>
        </Box>,
      )
      for (const [i, f] of sum.files.entries()) {
        foot.push(
          <Box key={`file-${i}`} flexDirection="row" height={1}>
            {label(i === 0 ? 'files' : '')}
            <Text color={C.ink} wrap="truncate-end">{f.path.split('/').pop()}</Text>
            <Text color={C.info}>{`  +${f.added}`}</Text>
            <Text color={C.crit}>{` −${f.removed}`}</Text>
          </Box>,
        )
      }
      for (const [i, f] of sum.failures.entries()) {
        foot.push(
          <Box key={`fail-${i}`} flexDirection="row" height={1}>
            <Text color={C.crit}>{(i === 0 ? 'fail' : '').padEnd(TOOL)}</Text>
            <Text color={C.crit} wrap="truncate-end">{`${f.label}${f.times > 1 ? ` ×${f.times}` : ''}`}</Text>
          </Box>,
        )
      }
    }

    return surface('rail', [
      brand,
      title,
      <Box key="rows" flexDirection="column" marginTop={1}>{body}</Box>,
      <Box key="foot" flexDirection="column" marginTop={1}>{foot}</Box>,
    ])
  })

  on('command.run', { command: RAIL_ID }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === RAIL_ID)
    if (isOpen) await $.ui.close({ id: RAIL_ID })
    else if (opts.rail) await $.ui.open({ id: RAIL_ID, title: 'tidepool' })
    return { text: isOpen ? 'Tide rail closed.' : 'Tide rail open.' }
  })
}
