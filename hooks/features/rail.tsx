import { atom, read, update } from 'claude-code'
import type { EngineInterface, Frozen, On, RenderChildren, RenderElement, RenderInput } from 'claude-code'

import type { RailRow } from '../../types'
import { fitBand } from '../layout'
import { opts } from '../options'
import { AGENT_LINGER_MS, agentRows, finishedAt, historyFor, topLevel } from '../plan'
import { doneCard, planBody, planHeader, planWanted, shellBody } from '../planview'
import { DONE_COLS, DONE_ROWS, doneCrabCells, encodeCells } from '../dock'
import type { PlanData } from '../planview'
import { lastLine, shellRows } from '../shell'
import { pickTurn, railBudget, railRows, railSeat, railSummary, sectionCap, showBars, turnWindow } from '../rail'
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
const MAX_SHELL_ROWS = 4

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

const TAIL_EVERY_MS = 2000
const MAX_TAIL_BYTES = 4 * 1024 * 1024
const tails = new Map<string, { at: number; line?: string }>()

// A background job's newest output line, re-read at most every 2s (the band keeps its own copy: `$` stays in-file).
async function tailLine($: EngineInterface, path: string, at: number): Promise<string | undefined> {
  const known = tails.get(path)
  if (known && at - known.at < TAIL_EVERY_MS) return known.line
  let line: string | undefined
  try {
    const { size } = await $.fs.stat(path)
    if (size <= MAX_TAIL_BYTES) line = lastLine(String(await $.fs.read(path)))
  } catch {
    line = undefined
  }
  tails.set(path, { at, ...(line === undefined ? {} : { line }) })
  return line
}

type PaneInput = Frozen<RenderInput<'Pane'>>

// The plan section, pinned above the docked rail's footer: a rule, the Plan header, the plan's lines around the
// running task, then the shells, in at most `cap` rows (hooks/rail.ts sectionCap). Null when there is nothing.
async function planSection($: EngineInterface, e: PaneInput, width: number, cap: number): Promise<{ el: RenderElement; rows: number } | null> {
  await read($, tick)
  const at = await $.clock.now()
  const list = await read($, tasks)
  const doneAt = finishedAt(topLevel(list))
  const showTasks = opts.tasks && topLevel(list).length > 0 && (doneAt === undefined || at - doneAt < AGENT_LINGER_MS)
  const shells = opts.tasks ? shellRows(await read($, calls), await read($, live), await read($, jobs), at).slice(-MAX_SHELL_ROWS) : []
  if (!showTasks && shells.length === 0) return null
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  const C = palette()
  const said: Record<string, string> = {}
  for (const r of shells) {
    if (r.status !== 'running' || r.outputFile === undefined) continue
    const line = await tailLine($, r.outputFile, at)
    if (line) said[r.outputFile] = line
  }
  const d: PlanData = {
    tasks: showTasks && doneAt === undefined ? list : [],
    agents: agentRows(await read($, agents), await read($, turns)),
    shells,
    tails: said,
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
  if (fit.margin || finished) out.push(<Text key="plan-rule" color={C.track}>{'╌'.repeat(width)}</Text>)
  if (finished && doneAt !== undefined) {
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
  if (fit.shell > 1) out.push(...shellBody(ui, C, { ...d, shells: shells.slice(-(fit.shell - 1)) }, fit.tails))
  // The done card is one element four rows tall.
  return { el: <Box key="plan" flexDirection="column">{out}</Box>, rows: out.length + (finished ? DONE_ROWS - 1 : 0) }
}

export function registerRail(on: On) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== RAIL_ID) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const C = palette()
    const p = e.props
    railSeat.placement = p.placement
    // With the warm theme the rail paints the Warm Claude terminal background (warm's onAccent), so it reads
    // as part of the terminal rather than a grey panel. Tidepool ships that terminal theme, so the colour is
    // known; for any other theme the real background is not, and Claude Code's own panel colour stays.
    const paint = opts.theme === 'warm' ? C.onAccent : undefined
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
    const sum = railSummary(all, turn, clock)
    // Docked, the plan section takes its share (hooks/rail.ts); the footer's lists and the tool rows share the rest.
    // Fixed rows above and below it: brand, title, two margins, the footer's rule and cost line.
    const section = isInline ? null : await planSection($, e, width, sectionCap(p.scroll.bodyRows, 6, showAll))
    const fits = railBudget({
      bodyRows: p.scroll.bodyRows,
      tools: all.length,
      bars: showBars(p.bodyColumns),
      files: sum.files.length,
      failures: sum.failures.length,
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
    const foot = []
    if (!isInline) {
      const label = (text: string, color = C.faint) => <Box flexShrink={0}><Text color={color}>{text.padEnd(TOOL)}</Text></Box>
      foot.push(<Text key="rule" color={C.track}>{'╌'.repeat(width)}</Text>)
      foot.push(
        <Box key="cost" flexDirection="row" height={1}>
          {label('cost')}
          {sum.cost !== undefined && <Box flexShrink={0}><Text color={C.ink}>{`$${sum.cost.toFixed(2)}  `}</Text></Box>}
          <Text color={C.faint} wrap="truncate-end">{[`${sum.tools} tool${sum.tools === 1 ? '' : 's'}`, sum.agents ? `${sum.agents} agent${sum.agents === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</Text>
        </Box>,
      )
      for (const [i, f] of sum.files.slice(0, fits.files).entries()) {
        foot.push(
          <Box key={`file-${i}`} flexDirection="row" height={1}>
            {label(i === 0 ? 'files' : '')}
            <Text color={C.ink} wrap="truncate-end">
              {f.path.split('/').pop()}
              <Text color={C.info}>{`  +${f.added}`}</Text>
              <Text color={C.crit}>{` −${f.removed}`}</Text>
            </Text>
          </Box>,
        )
      }
      for (const [i, f] of sum.failures.slice(0, fits.failures).entries()) {
        foot.push(
          <Box key={`fail-${i}`} flexDirection="row" height={1}>
            {label(i === 0 ? 'fail' : '', C.crit)}
            <Text color={C.crit} wrap="truncate-end">{`${f.label}${f.times > 1 ? ` ×${f.times}` : ''}`}</Text>
          </Box>,
        )
      }
    }

    return surface('rail', [
      brand,
      title,
      <Box key="rows" flexDirection="column" marginTop={1}>{body}</Box>,
      ...pin(section),
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
