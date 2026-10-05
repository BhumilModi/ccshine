import { atom, read } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { TurnSpan } from '../../types'
import { opts } from '../options'
import { timelineOn, turnOfCall } from '../rail'
import { palette } from '../theme'
import { describeCall, editStats, fmtShort, groupSummary, isKnownTool } from '../tools'

// Written by the tracker (features/track.tsx), the dock (turn starts) and the agent band (features/tasks.tsx).
const calls = atom({ plugin: 'tidepool', key: 'calls' } as const, {})
const spans = atom({ plugin: 'tidepool', key: 'spans' } as const, [])
// The main-loop turn a call belongs to; undefined for a subagent's call or one the tracker never saw.
async function turnOf($: EngineInterface, id: string): Promise<TurnSpan | undefined> {
  const call = (await read($, calls))[id]
  if (!call || call.agentId !== undefined) return undefined
  return turnOfCall(await read($, spans), call.startedAt)
}

let root: string | undefined

async function sessionRoot($: EngineInterface): Promise<string> {
  root ??= await $.session.root()
  return root
}

export function registerTools(on: On) {
  // Header row only: the engine keeps drawing the result (diff, output) under it.
  // marginTop keeps the blank line the engine puts above each tool call.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!opts.tools) return next(e)
    const p = e.props
    // A turn's rows belong to its timeline (features/rail.tsx), drawn under the turn's first row.
    if (timelineOn(e.viewport) && (await turnOf($, p.tool_use_id))) return next(e)
    const described = describeCall(p.tool, p.input, await sessionRoot($))
    if (!described) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    const timing = (await read($, calls))[p.tool_use_id]
    const took = timing?.endedAt !== undefined ? fmtShort(timing.endedAt - timing.startedAt) : undefined
    const stats = editStats(p.tool, p.input)
    const icon = p.isErrored ? '✕' : described.icon
    const iconColor = p.isErrored ? C.crit : p.isInterrupted ? C.faint : C.accent
    return (
      // Only the target shrinks: in a narrow chat it truncates rather than wrapping the pieces beside it.
      <Box marginTop={1} height={1}>
        <Box flexShrink={0}>
          <Text color={iconColor} bold>{icon}</Text>
          <Text color={C.soft}>{` ${p.tool} `}</Text>
        </Box>
        <Text color={C.ink} wrap="truncate-end">{described.target}</Text>
        <Box flexShrink={0}>
          {stats && stats.added > 0 && <Text color={C.info}>{`  +${stats.added}`}</Text>}
          {stats && stats.removed > 0 && <Text color={C.crit}>{`${stats.added > 0 ? ' ' : '  '}−${stats.removed}`}</Text>}
          {p.isRunning && <Text color={C.faint}>{'  …'}</Text>}
          {took && !p.isRunning && <Text color={C.faint}>{`  ${took}`}</Text>}
        </Box>
      </Box>
    )
  })

  // With the timeline on, a call's result lives in its row there.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!timelineOn(e.viewport) || !(await turnOf($, e.props.tool_use_id))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    // Unfolded, each call is a ToolUse row with its id, so the anchor rule above sees it.
    if (timelineOn(e.viewport)) return next({ ...e, props: { ...e.props, isExpanded: true } })
    // MCP and other unknown tools keep the engine's own wording.
    if (!opts.tools || e.props.isExpanded || !e.props.calls.every(c => isKnownTool(c.tool))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const C = palette()
    const parts = groupSummary(e.props.calls)
    const failed = e.props.calls.filter(c => c.isErrored).length
    return (
      // One Text for the line, so a narrow chat truncates its end rather than wrapping each piece.
      <Box marginTop={1} height={1}>
        <Text color={C.soft} wrap="truncate-end">
          {parts.map((g, i) => `${i ? '  ' : ''}${g.icon} ${g.tool}${g.count > 1 ? ` ×${g.count}` : ''}`).join('')}
          {e.props.isActive ? <Text color={C.faint}>{'  …'}</Text> : ''}
          {failed > 0 ? <Text color={C.crit}>{`  · ${failed} failed`}</Text> : ''}
        </Text>
      </Box>
    )
  })
}
