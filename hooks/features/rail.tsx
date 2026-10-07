import { atom, read, update } from 'claude-code'
import type { EngineInterface, Frozen, On, RenderChildren, RenderElement, RenderInput } from 'claude-code'

import type { RailRow } from '../../types'
import { fitBand } from '../layout'
import { opts } from '../options'
import { agentRows, finishedAt, historyFor, planShows, topLevel } from '../plan'
import { doneCard, planBody, planHeader, planWanted } from '../planview'
import { DONE_COLS, DONE_ROWS, doneCrabCells, encodeCells } from '../dock'
import type { PlanData } from '../planview'
import { MAX_TAIL_BYTES, shellRows, shellTails } from '../shell'
import { RAIL_COLUMNS, pickTurn, railBudget, railRows, railSeat, railSummary, sectionCap, showBars, turnWindow } from '../rail'
import { palette, span } from '../theme'
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
// The plan the docked rail owns (features/tasks.tsx writes these; its 1s tick redraws live timers).
const tasks = atom({ plugin: 'tidepool', key: 'tasks' } as const, [])
const turns = atom({ plugin: 'tidepool', key: 'turns' } as const, [])
const live = atom({ plugin: 'tidepool', key: 'live' } as const, {})
const shellHistory = atom({ plugin: 'tidepool', key: 'shellHistory' } as const, null)
const planAll = atom({ plugin: 'tidepool', key: 'planAll' } as const, false)
const tick = atom({ plugin: 'tidepool', key: 'tick' } as const, 0)

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

// A background job's output file for shellTails (shell.ts); a file too big for one read shows nothing.
const readTail = ($: EngineInterface) => async (path: string) =>
  (await $.fs.stat(path)).size <= MAX_TAIL_BYTES ? String(await $.fs.read(path)) : undefined

type PaneInput = Frozen<RenderInput<'Pane'>>

// The plan section, pinned to the docked rail's foot: a rule, the Plan header and the plan's tree around the
// running task (or, with no plan, the running shells and agents), in at most `cap` rows (hooks/rail.ts sectionCap). Null when there is nothing.
// Agents whose Agent call is in `shown`, the tool rows of the turn on screen, are left to those rows.
async function planSection($: EngineInterface, e: PaneInput, width: number, cap: number, shown: ReadonlySet<string> = new Set()): Promise<{ el: RenderElement; rows: number } | null> {
  await read($, tick)
  const at = await $.clock.now()
  const list = await read($, tasks)
  const doneAt = finishedAt(topLevel(list))
  const showTasks = opts.tasks && planShows(list, at)
  const shells = opts.tasks ? shellRows(await read($, calls), await read($, live), await read($, jobs), at) : []
  if (!showTasks && shells.length === 0) return null
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  const C = palette()
  const d: PlanData = {
    tasks: showTasks && doneAt === undefined ? list : [],
    agents: agentRows(await read($, agents), await read($, turns)).filter(a => a.callId === undefined || !shown.has(a.callId)),
    shells,
    // Output lines are rows of the plan's tree, so they are read before it is fitted (cached for 2s per file).
    tails: await shellTails(shells, readTail($), at),
    shellHistory: (await read($, shellHistory)) ?? {},
    planHistory: historyFor(await $.store.get('history-by-project'), await $.session.root()),
    now: at,
    all: await read($, planAll),
  }
  const finished = showTasks && doneAt !== undefined
  const want = planWanted(d)
  // The rule above the section stands in for the band's blank row.
  const fit = fitBand({
    maxRows: cap,
    dock: 'none',
    header: showTasks && !finished,
    focus: want.focus,
    shell: want.shell,
    plan: want.plan,
    tails: want.tails,
    usage: 0,
    expanded: d.all,
  })
  const out: RenderElement[] = []
  // The done card, its rule included, draws only when it fits the cap.
  const card = finished && doneAt !== undefined && DONE_ROWS + 1 <= cap
  if (fit.margin || card) out.push(<Text key="plan-rule" color={C.track}>{'╌'.repeat(width)}</Text>)
  if (card) {
    // The crab's frames are blitted by features/tasks.tsx for DONE_MS after the plan finishes; this draws the frame due now.
    const { Raster } = ui as unknown as { Raster: (props: Record<string, unknown>) => RenderElement }
    const crab = <Raster key="plan-crab" columns={DONE_COLS} rows={DONE_ROWS} cells={encodeCells(doneCrabCells(at - doneAt, C))} />
    out.push(doneCard(ui, C, list, crab))
  }
  if (fit.header) {
    const body = planBody(ui, C, d, fit.focus ? fit.plan + 1 : 0)
    out.push(
      planHeader(ui, C, { ...d, tasks: list }, {
        surface: e.surface,
        columns: width + 2,
        toggle: { hidden: body.hidden, onPress: () => update($, planAll, v => !v) },
      }),
      ...body.rows,
    )
  }
  // With no plan, running shells and agents draw alone, their label included.
  if (!fit.header && fit.shell > 1) out.push(...planBody(ui, C, d, fit.shell).rows)
  // The done card is one element four rows tall.
  if (out.length === 0) return null
  return { el: <Box key="plan" flexDirection="column">{out}</Box>, rows: out.length + (card ? DONE_ROWS - 1 : 0) }
}

export function registerRail(on: On) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== RAIL_ID) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const C = palette()
    const p = e.props
    railSeat.placement = p.placement
    // The rail paints the background of the terminal theme Tidepool ships for this palette (its onAccent), so it
    // reads as part of the terminal rather than a grey panel.
    const paint = C.onAccent
    const width = Math.max(10, p.bodyColumns - 2)
    const surface = (key: string, children: RenderChildren) => (
      <Box key={key} flexDirection="column" backgroundColor={paint} paddingX={1} minHeight={p.placement === 'dock' ? p.scroll.bodyRows : undefined}>
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
    const showAll = await read($, planAll)
    const pin = (section: { el: RenderElement } | null) => (section ? [<Box key="gap" flexGrow={1} />, section.el] : [])
    if (!turn) {
      // Brand and the "no turns" line sit above the section.
      const section = isInline ? null : await planSection($, e, width, sectionCap(p.scroll.bodyRows, 2, showAll))
      return surface('empty', [brand, <Text key="none" color={C.faint}>{isInline ? 'no turn running' : 'no turns yet'}</Text>, ...pin(section)])
    }

    const { start, end } = turnWindow(turn, turn.endedAt ?? clock)
    const allCalls = await read($, calls)
    const all = railRows(allCalls, await read($, agents), await read($, jobs), turn, clock)
    // Docked, the plan section takes its share (hooks/rail.ts); the tool rows take the rest.
    // Fixed rows above it: brand, title and two margins.
    const agentCalls = new Set(all.filter(r => r.kind === 'agent').map(r => r.id))
    const section = isInline ? null : await planSection($, e, width, sectionCap(p.scroll.bodyRows, 4, showAll), agentCalls)
    const fits = railBudget({
      bodyRows: p.scroll.bodyRows,
      tools: all.length,
      bars: showBars(p.bodyColumns),
      section: section?.rows ?? 0,
    })
    const hidden = isInline ? Math.max(0, all.length - INLINE_ROWS) : all.length - fits.shown
    const rows = all.slice(hidden)
    const opened = await read($, open)
    const bars = showBars(p.bodyColumns)
    const col = columns(width, bars)
    const state = turn.endedAt === undefined ? 'live' : turn.aborted ? 'stopped' : ''
    const toggle = (id: string) => update($, open, ids => (ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]))

    // The turn line shares a hover group with its anchor in the chat: pointing at either lights both.
    const title = (
      <Box key="title" flexDirection="row" height={1} hover={{ scope: `tidepool-turn-${turn.turnId}`, backgroundColor: C.seg }}>
        <Box flexShrink={0}>
          <Text color={C.ink} bold>{`turn ${list.indexOf(turn) + 1}`}</Text>
          {state && <Text color={state === 'live' ? C.accent : C.warn}>{` · ${state}`}</Text>}
          <Text color={C.ink}>{` · ${fmtShort(end - start)}`}</Text>
        </Box>
        {turn.prompt && <Text color={C.faint} wrap="truncate-end">{`  ${turn.prompt}`}</Text>}
      </Box>
    )

    const body = []
    if (all.length === 0) body.push(<Text key="empty" color={C.faint}>no tools this turn</Text>)
    if (hidden) body.push(<Text key="earlier" color={C.faint}>{`${' '.repeat(TOOL + 1)}${hidden} earlier`}</Text>)
    for (const r of rows) {
      const color = r.failed ? C.crit : r.kind === 'job' ? C.warn : r.kind === 'agent' ? C.info : r.running ? C.mid : C.soft
      const b = bars ? span(r.from, r.to, col.bar) : { before: '', filled: '', after: '' }
      const isOpen = opened.includes(r.id)
      body.push(
        <Box key={`r-${r.id}`} flexDirection="row" height={1} hover={{ backgroundColor: C.seg }}>
          <Box flexShrink={0}>
            <Text color={r.failed ? C.crit : C.mid}>{`${fit(r.failed ? `✕ ${r.tool}` : r.tool, TOOL)} `}</Text>
            <Button key={`row:${r.id}`} plain onPress={() => toggle(r.id)}>
              {fit(r.target || r.tool, col.target)}
            </Button>
            {bars && (
              <Text color={C.track}>
                {` ${b.before}`}
                <Text color={color}>{b.filled}</Text>
                {b.after}
                {r.over ? <Text color={color}>⇢</Text> : ''}
              </Text>
            )}
          </Box>
          <Text color={r.running ? C.mid : C.faint} wrap="truncate-end">
            {` ${timing(r)}`}
            {(r.added || r.removed) ? <Text color={C.info}>{`  +${r.added ?? 0}`}</Text> : ''}
            {(r.added || r.removed) ? <Text color={C.crit}>{` −${r.removed ?? 0}`}</Text> : ''}
            {r.children !== undefined ? <Text color={C.info}>{`  ${r.children} tools ${isOpen ? '▾' : '▸'}`}</Text> : ''}
          </Text>
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

    // The time axis closes the timeline, above the plan section.
    if (bars && rows.length > 0) {
      const label = fmtShort(end - start)
      body.push(<Text key="axis" color={C.faint}>{`${' '.repeat(TOOL + col.target + 2)}0s${label.padStart(col.bar - 2)}`}</Text>)
    }
    return surface('rail', [
      brand,
      title,
      <Box key="rows" flexDirection="column" marginTop={isInline || fits.margins ? 1 : 0}>{body}</Box>,
      ...pin(section),
    ])
  })

  on('command.run', { command: RAIL_ID }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === RAIL_ID)
    if (isOpen) await $.ui.close({ id: RAIL_ID })
    else if (opts.rail) await $.ui.open({ id: RAIL_ID, title: 'tidepool', columns: RAIL_COLUMNS })
    return { text: isOpen ? 'Tide rail closed.' : 'Tide rail open.' }
  })
}
